#!/usr/bin/env bash
# MouserCV — One-time GCP project setup
# Run this AFTER linking billing to the 'mousercv' project
set -euo pipefail

PROJECT_ID="mousercv"
REGION="europe-west1"
GCS_BUCKET="mousercv-data"

echo "=== MouserCV GCP Setup ==="
gcloud config set project "$PROJECT_ID"

# Enable all required APIs
echo "--- Enabling APIs ---"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  --quiet

# Create Artifact Registry repo
echo "--- Creating Artifact Registry repo ---"
gcloud artifacts repositories create mousercv \
  --repository-format=docker \
  --location="$REGION" \
  --description="MouserCV container images" \
  2>/dev/null || echo "  (already exists)"

# Configure Docker auth for Artifact Registry
echo "--- Configuring Docker auth ---"
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet

# Create GCS bucket
echo "--- Creating GCS bucket ---"
gcloud storage buckets create "gs://$GCS_BUCKET" \
  --location="$REGION" \
  --uniform-bucket-level-access \
  2>/dev/null || echo "  (already exists)"

# Create GCS directory structure
echo "--- Creating GCS directory structure ---"
echo '{}' | gcloud storage cp - "gs://$GCS_BUCKET/metadata/.keep"
echo '{}' | gcloud storage cp - "gs://$GCS_BUCKET/videos/.keep"
echo '{}' | gcloud storage cp - "gs://$GCS_BUCKET/results/.keep"
echo '{}' | gcloud storage cp - "gs://$GCS_BUCKET/exports/.keep"

# Grant Cloud Run service account access to GCS
echo "--- Setting IAM permissions ---"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding "gs://$GCS_BUCKET" \
  --member="serviceAccount:$SA" \
  --role="roles/storage.objectAdmin" \
  --quiet

echo ""
echo "=== Setup Complete ==="
echo "Project:  $PROJECT_ID"
echo "Region:   $REGION"
echo "Bucket:   gs://$GCS_BUCKET"
echo "Registry: $REGION-docker.pkg.dev/$PROJECT_ID/mousercv"
echo ""
echo "Next: run ./scripts/deploy.sh to build and deploy"
