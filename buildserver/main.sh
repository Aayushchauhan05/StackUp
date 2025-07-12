#!/bin/bash


echo "📦 Cloning from: $GIT_REPO_URL"
echo "📁 Project ID: $PROJECT_ID"
echo "🚀 Deployment ID: $DEPLOYEMENT_ID"


git clone "$GIT_REPO_URL" /home/app/output


exec node script.js
