const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');
const { Kafka } = require('kafkajs');
const { v4: uuidv4 } = require('uuid');

const PROJECT_ID = process.env.PROJECT_ID;
const DEPLOYEMENT_ID = process.env.DEPLOYEMENT_ID;

const s3Client = new S3Client({
  region: 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const kafka = new Kafka({
  clientId: `html-uploader-${DEPLOYEMENT_ID}`,
  brokers: [process.env.KAFKA_BROKER],
  ssl: {
    ca: [fs.readFileSync(path.join(__dirname, 'kafka.pem'), 'utf-8')],
  },
  sasl: {
    mechanism: 'plain',
    username: process.env.KAFKA_USERNAME,
    password: process.env.KAFKA_PASSWORD,
  },
});

const producer = kafka.producer();

async function publishLog(log) {
  try {
    await producer.send({
      topic: 'container-logs',
      messages: [{
        key: 'log',
        value: JSON.stringify({
          PROJECT_ID,
          DEPLOYEMENT_ID,
          log,
          event_id: uuidv4(),
          timestamp: new Date().toISOString(),
        }),
      }],
    });
  } catch (err) {
    console.error('Kafka log error:', err.message);
  }
}

async function uploadStaticFiles() {
  await producer.connect();

  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) {
    console.error('Output directory not found!');
    await publishLog('❌ Output directory not found!');
    return;
  }

  const files = fs.readdirSync(outputDir, { recursive: true });
  console.log(`📤 Uploading ${files.length} files from /output`);
  await publishLog(`Uploading ${files.length} files from /output`);

  for (const file of files) {
    const filePath = path.join(outputDir, file);
    if (fs.lstatSync(filePath).isDirectory()) continue;

    const key = `__outputs/${PROJECT_ID}/${file}`;
    const contentType = mime.lookup(filePath) || 'application/octet-stream';

    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: fs.createReadStream(filePath),
        ContentType: contentType,
      }));
      console.log(`✅ Uploaded: ${key}`);
      await publishLog(`✅ Uploaded: ${key}`);
    } catch (err) {
      console.error(`❌ Failed to upload ${file}:`, err.message);
      await publishLog(`❌ Failed to upload ${file}: ${err.message}`);
    }
  }

  await producer.disconnect();
}

uploadStaticFiles();
