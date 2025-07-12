require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const { Kafka } = require('kafkajs');
const { createClient } = require('@clickhouse/client');
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs');
const { Server } = require('socket.io');
const { generateSlug } = require('random-word-slugs');
const httpProxy = require('http-proxy');

const app = express();
const PORT = 9000;
const PROXY_PORT = 8000;

app.use(cors());
app.use(express.json());

const prisma = new PrismaClient();
const io = new Server({ cors: '*' });

const proxy = httpProxy.createProxy();
const BASE_PATH = '';

const clickhouseClient = createClient({
  host: process.env.CLICKHOUSE_URL,
  username: process.env.CLICKHOUSE_USERNAME,
  password: process.env.CLICKHOUSE_PASSWORD,
  clickhouse_settings: {
    async_insert: 1,
    wait_for_async_insert: 0
  }
});

let kafka;
let producer;
let consumer;

async function initializeKafka() {
  try {
    kafka = new Kafka({
      clientId: 'api-server',
      brokers: [process.env.KAFKA_BROKER],
      ssl: {
        ca: [fs.readFileSync(path.join(__dirname, 'kafka.pem'), 'utf-8')]
      },
      sasl: {
        username: process.env.KAFKA_USERNAME,
        password: process.env.KAFKA_PASSWORD,
        mechanism: 'plain'
      },
      retry: {
        initialRetryTime: 100,
        retries: 3
      }
    });

    try {
      const admin = kafka.admin();
      await admin.connect();
      await admin.createTopics({
        topics: [
          { topic: 'container-logs', numPartitions: 3, replicationFactor: 1 },
          { topic: 'page-visits', numPartitions: 3, replicationFactor: 1 }
        ]
      });
      await admin.disconnect();
    } catch (adminError) {
      console.error('Kafka topic creation failed:', adminError);
    }

    producer = kafka.producer();
    consumer = kafka.consumer({ groupId: 'api-server-logs-consumer' });

    await producer.connect();
    await consumer.connect();
    await consumer.subscribe({ topics: ['container-logs'], fromBeginning: true });

    console.log('Kafka initialized successfully');
  } catch (error) {
    console.error('Kafka initialization failed:', error);
    producer = null;
    consumer = null;
  }
}

const proxyApp = express();
proxyApp.use(async (req, res) => {
  const hostname = req.hostname;
  const subdomain = hostname.split('.')[0];

  try {
    const project = await prisma.project.findFirst({ where: { subDomain: subdomain } });

    if (!project) {
      return res.status(404).send('Project not found');
    }

    if (producer) {
      try {
        await producer.send({
          topic: 'page-visits',
          messages: [{
            value: JSON.stringify({
              projectId: project.id,
              subDomain: subdomain,
              path: req.path,
              timestamp: new Date().toISOString()
            })
          }]
        });
      } catch (kafkaError) {
        console.error('Kafka error:', kafkaError);
      }
    }

    const resolvesTo = `${BASE_PATH}/${project.id}`;
    proxy.web(req, res, { target: resolvesTo, changeOrigin: true });
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err);
  res.status(502).json({ error: 'Bad Gateway' });
});

proxy.on('proxyReq', (proxyReq, req) => {
  if (req.url === '/') proxyReq.path += 'index.html';
});

const ecsClient = new ECSClient({
  region: 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  },
  maxAttempts: 3
});

const ecsConfig = {
  CLUSTER: process.env.ECS_CLUSTER,
  TASK: process.env.ECS_TASK,
  SUBNETS: process.env.ECS_SUBNETS?.split(',') || [],
  SECURITY_GROUPS: process.env.ECS_SECURITY_GROUPS?.split(',') || []
};

io.on('connection', socket => {
  socket.on('subscribe', channel => {
    socket.join(channel);
    socket.emit('message', {
      status: 'subscribed',
      channel,
      timestamp: new Date().toISOString()
    });
  });
});

app.post('/project', async (req, res) => {
  const schema = z.object({
    name: z.string().min(3).max(50),
    gitURL: z.string().url().regex(/^https:\/\/github\.com\/.+/)
  });

  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: result.error.flatten()
    });
  }

  const { name, gitURL } = result.data;
  const subDomain = generateSlug();

  try {
    const project = await prisma.project.create({
      data: { name, gitURL, subDomain }
    });
    return res.status(201).json({ status: 'success', data: { project } });
  } catch (err) {
    console.error('Project creation error:', err);
    return res.status(500).json({ error: 'Failed to create project' });
  }
});

app.post('/deploy', async (req, res) => {
  const { projectId } = req.body;

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const deployment = await prisma.deployement.create({
      data: {
        project: { connect: { id: projectId } },
        status: 'QUEUED'
      }
    });

    const command = new RunTaskCommand({
      cluster: ecsConfig.CLUSTER,
      taskDefinition: ecsConfig.TASK,
      launchType: 'FARGATE',
      count: 1,
      networkConfiguration: {
        awsvpcConfiguration: {
          assignPublicIp: 'ENABLED',
          subnets: ecsConfig.SUBNETS,
          securityGroups: ecsConfig.SECURITY_GROUPS
        }
      },
      overrides: {
        containerOverrides: [{
          name: 'Stack-up-image',
          environment: [
            { name: 'GIT_REPO_URL', value: project.gitURL },
            { name: 'PROJECT_ID', value: projectId },
            { name: 'DEPLOYEMENT_ID', value: deployment.id },
            { name: 'NODE_ENV', value: 'production' }
          ]
        }]
      }
    });

    await ecsClient.send(command);
    return res.json({
      status: 'queued',
      data: {
        deploymentId: deployment.id,
        statusUrl: `/logs/${deployment.id}`
      }
    });
  } catch (err) {
    console.error('Deployment error:', err);
    return res.status(500).json({ error: 'Failed to initiate deployment' });
  }
});

app.get('/logs/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await clickhouseClient.query({
      query: `
        SELECT event_id, deployment_id, log, timestamp
        FROM log_events
        WHERE deployment_id = {deployment_id:String}
        ORDER BY timestamp DESC
        LIMIT 100
      `,
      query_params: { deployment_id: id },
      format: 'JSONEachRow'
    });

    const logs = await result.json();
    return res.json({ logs });
  } catch (err) {
    console.error('Log retrieval error:', err);
    return res.status(500).json({
      error: 'Failed to fetch logs',
      message: 'Log service temporarily unavailable'
    });
  }
});

app.get('/health', async (req, res) => {
  const checks = {
    database: true,
    kafka: !!producer,
    clickhouse: true,
    status: 'healthy'
  };

  try {
    await clickhouseClient.ping();
  } catch (err) {
    checks.clickhouse = false;
    checks.status = 'degraded';
  }

  return res.json(checks);
});

async function processKafkaMessages() {
  if (!consumer) return;

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        if (!message.value) return;
        const parsed = JSON.parse(message.value.toString());
        const { PROJECT_ID, DEPLOYEMENT_ID, log } = parsed;

        await clickhouseClient.insert({
          table: 'log_events',
          values: [{
            event_id: uuidv4(),
            deployment_id: DEPLOYEMENT_ID,
            log,
            timestamp: new Date().toISOString()
          }],
          format: 'JSONEachRow'
        });

        io.to(DEPLOYEMENT_ID).emit('log', {
          deploymentId: DEPLOYEMENT_ID,
          log,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        console.error('Kafka message processing error:', err);
      }
    }
  });
}

async function startServices() {
  try {
    await clickhouseClient.ping();
    console.log('ClickHouse connected');

    await initializeKafka();

    if (consumer) {
      await processKafkaMessages();
    }

    const apiServer = app.listen(PORT, () => {
      console.log(`API Server running on port ${PORT}`);
    });

    const proxyServer = proxyApp.listen(PROXY_PORT, () => {
      console.log(`Proxy Server running on port ${PROXY_PORT}`);
    });

    const socketServer = io.listen(9002, () => {
      console.log(`Socket Server running on port 9002`);
    });

    process.on('SIGTERM', async () => {
      console.log('Shutting down...');
      await Promise.all([
        producer?.disconnect(),
        consumer?.disconnect(),
        prisma.$disconnect(),
        new Promise(res => apiServer.close(res)),
        new Promise(res => proxyServer.close(res)),
        new Promise(res => socketServer.close(res))
      ]);
      process.exit(0);
    });
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
}

startServices();
