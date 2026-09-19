#!/usr/bin/env bash
# Bash script to deploy Saathi to Google Cloud Run
set -euo pipefail

REGION="${REGION:-us-central1}"
PROJECT="${PROJECT:-}"

echo "=== Deploying Saathi to Google Cloud Run ==="

if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed."
    echo "Tip: Run this command in Google Cloud Shell (https://shell.cloud.google.com) which has gcloud pre-configured!"
    exit 1
fi

CMD="gcloud run deploy saathi --source . --region $REGION --allow-unauthenticated"
if [ -n "$PROJECT" ]; then
    CMD="$CMD --project $PROJECT"
fi

echo "Running: $CMD"
eval "$CMD"
