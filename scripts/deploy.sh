#!/usr/bin/env bash
# MouserCV — Deploy to Cloud Run
# Prerequisites: billing linked to 'mousercv' GCP project
set -euo pipefail

PROJECT_ID="mousercv"
REGION="europe-west1"
SERVICE_NAME="mousercv-api"
REPO_NAME="mousercv"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/api"
GCS_BUCKET="mousercv-data"

echo "=== MouserCV Deploy ==="
echo "Project: $PROJECT_ID"
echo "Region:  $REGION"
echo "Service: $SERVICE_NAME"
echo ""

# Ensure correct project
gcloud config set project "$PROJECT_ID"

# Step 1: Enable required APIs
echo "--- Enabling APIs ---"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  --quiet

# Step 2: Create Artifact Registry repo (if not exists)
echo "--- Setting up Artifact Registry ---"
gcloud artifacts repositories describe "$REPO_NAME" \
  --location="$REGION" --format="value(name)" 2>/dev/null || \
gcloud artifacts repositories create "$REPO_NAME" \
  --repository-format=docker \
  --location="$REGION" \
  --description="MouserCV container images"

# Step 3: Create GCS bucket (if not exists)
echo "--- Setting up GCS bucket ---"
gcloud storage buckets describe "gs://$GCS_BUCKET" 2>/dev/null || \
gcloud storage buckets create "gs://$GCS_BUCKET" \
  --location="$REGION" \
  --uniform-bucket-level-access

# Step 4: Build and push Docker image
echo "--- Building Docker image ---"
TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")
docker build -t "$IMAGE:$TAG" -t "$IMAGE:latest" .

echo "--- Pushing to Artifact Registry ---"
docker push "$IMAGE:$TAG"
docker push "$IMAGE:latest"

# Step 5: Deploy to Cloud Run
echo "--- Deploying to Cloud Run ---"
gcloud run deploy "$SERVICE_NAME" \
  --image="$IMAGE:$TAG" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --set-env-vars="GCS_BUCKET=$GCS_BUCKET,GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --quiet

# Print URL
echo ""
echo "=== Deployed ==="
gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --format="value(status.url)"
