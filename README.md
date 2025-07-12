

```markdown
# 🚀 StackUp - Cloud Code Deployment Platform

StackUp is a scalable, developer-friendly platform that allows users to deploy static projects directly from GitHub repositories to AWS infrastructure using Fargate, S3, Kafka, and ClickHouse. It also supports real-time log tracking via WebSockets and data ingestion for analytics.

## 🧠 Features

- ⚙️ **GitHub Integration**: Create and deploy projects from GitHub URLs.
- 🗂️ **Subdomain Routing**: Each project gets a unique subdomain.
- ☁️ **AWS Fargate + S3**: Serverless container execution and static hosting on S3.
- 📊 **Kafka + ClickHouse**: Stream logs and analytics to a fast OLAP database.
- 🔌 **Reverse Proxy**: Smart routing based on subdomain to serve the correct project.
- 📡 **Socket.IO Logs**: Real-time log streaming to clients during deployments.
- 🧪 **Health Monitoring**: Status endpoint for checking service health.

## 📁 Folder Structure

```

StackUp/
├── output/                # Static files to be uploaded (HTML/CSS/JS)
├── kafka.pem              # SSL certificate for Kafka connection
├── .env                   # Environment variables (AWS, Kafka, DB)
├── server.js              # Main API and proxy server
├── deploy.js              # File upload and log publishing logic
└── README.md              # You're reading it!

````

## 🔧 Tech Stack

- **Backend**: Node.js + Express
- **Deployment**: AWS Fargate, ECS
- **Storage**: Amazon S3
- **Queue**: Apache Kafka (via Aiven)
- **Analytics**: ClickHouse
- **Database**: Prisma + PostgreSQL
- **Logs**: Socket.IO + Kafka streaming

## 📦 .env Example

```dotenv
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
S3_BUCKET=stackup-bucket-11

KAFKA_BROKER=your_kafka_broker:port
KAFKA_USERNAME=your_kafka_username
KAFKA_PASSWORD=your_kafka_password

CLICKHOUSE_URL=https://your-clickhouse-url
CLICKHOUSE_USERNAME=your_clickhouse_user
CLICKHOUSE_PASSWORD=your_clickhouse_pass

ECS_CLUSTER=your_ecs_cluster_name
ECS_TASK=your_ecs_task_definition

PROJECT_ID=your_project_id
DEPLOYEMENT_ID=your_deployment_id
````

## 🛠️ Usage

1. Clone the repo:

   ```bash
   git clone https://github.com/Aayushchauhan05/StackUp.git
   cd StackUp
   ```

2. Create a `.env` file with required credentials.

3. Deploy a project via:

   ```bash
   POST /project
   Body: { "name": "MyApp", "gitURL": "https://github.com/username/repo" }
   ```

4. Trigger deployment:

   ```bash
   POST /deploy
   Body: { "projectId": "your_project_id" }
   ```

5. Watch logs:

   ```bash
   GET /logs/:deploymentId
   ```

6. Check service health:

   ```bash
   GET /health
   ```

## ✅ To Do

* GitHub Webhook support
* Deployment history page
* UI Dashboard
* SSL/TLS support for custom domains
* Rate limiting and auth

## 👨‍💻 Author

**Aayush Chauhan**
[GitHub](https://github.com/Aayushchauhan05)
[LinkedIn](https://www.linkedin.com/in/aayushchauhan05)

---

> StackUp is a project built with a deep focus on performance, scalability, and developer simplicity. Contributions are welcome!

```

