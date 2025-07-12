FROM ubuntu:focal

RUN apt-get update && \
    apt-get install -y curl git && \
    curl -sL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean

WORKDIR /home/app


COPY main.sh main.sh
COPY script.js script.js
COPY kafka.pem kafka.pem


RUN npm install @aws-sdk/client-s3 mime-types kafkajs

RUN chmod +x main.sh

ENTRYPOINT ["/home/app/main.sh"]
