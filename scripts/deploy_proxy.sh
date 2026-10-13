#!/usr/bin/env bash
# Deploy apigee-llm-router proxy bundle to Apigee X
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ -f "${ROOT_DIR}/.env" ]; then
  source "${ROOT_DIR}/.env"
fi

ORG="${APIGEE_ORG:-${ORG:-}}"
ENV="${APIGEE_ENV:-${ENV:-prod}}"
PROXY_NAME="${PROXY_NAME:-apigee-llm-router}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-}"
NO_WAIT="false"

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --org) ORG="$2"; shift ;;
        --env) ENV="$2"; shift ;;
        --proxy) PROXY_NAME="$2"; shift ;;
        --service-account) SERVICE_ACCOUNT="$2"; shift ;;
        --no-wait) NO_WAIT="true" ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

if [ -z "$ORG" ]; then
  echo "Usage: $0 --org <APIGEE_ORG> [--env <APIGEE_ENV>] [--service-account <SA_EMAIL>] [--no-wait]"
  exit 1
fi

echo "=== Packaging Bundle for ${PROXY_NAME} ==="
bash "${SCRIPT_DIR}/package_bundle.sh"

BUNDLE_ZIP="${ROOT_DIR}/dist/${PROXY_NAME}.zip"

echo "=== Deploying ${PROXY_NAME} to Org: ${ORG}, Env: ${ENV} ==="
TOKEN=$(gcloud auth application-default print-access-token 2>/dev/null || gcloud auth print-access-token)

# 1. Import proxy revision
echo "Importing proxy revision..."
IMPORT_RES=$(curl -s -X POST "https://apigee.googleapis.com/v1/organizations/${ORG}/apis?name=${PROXY_NAME}&action=import" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @"${BUNDLE_ZIP}")

REVISION=$(echo "$IMPORT_RES" | grep -o '"revision": "[0-9]*"' | head -1 | cut -d'"' -f4)

if [ -z "$REVISION" ]; then
  echo "Import failed or returned unexpected response:"
  echo "$IMPORT_RES"
  exit 1
fi

echo "Imported Revision: $REVISION"

# 2. Deploy revision to environment
echo "Deploying Revision $REVISION to environment $ENV..."
DEPLOY_URL="https://apigee.googleapis.com/v1/organizations/${ORG}/environments/${ENV}/apis/${PROXY_NAME}/revisions/${REVISION}/deployments?override=true"
if [ -n "$SERVICE_ACCOUNT" ]; then
  DEPLOY_URL="${DEPLOY_URL}&serviceAccount=${SERVICE_ACCOUNT}"
fi

DEPLOY_RES=$(curl -s -X POST "${DEPLOY_URL}" \
  -H "Authorization: Bearer ${TOKEN}")

echo "$DEPLOY_RES"

if [ "${NO_WAIT:-false}" = "true" ]; then
  echo "=== Deployment submitted (wait skipped via --no-wait) ==="
  exit 0
fi

echo "Waiting for revision ${REVISION} to reach READY state..."
STATUS_URL="https://apigee.googleapis.com/v1/organizations/${ORG}/environments/${ENV}/apis/${PROXY_NAME}/revisions/${REVISION}/deployments"

for i in {1..30}; do
  STATUS_RES=$(curl -s -H "Authorization: Bearer ${TOKEN}" "${STATUS_URL}")
  STATE=$(echo "$STATUS_RES" | grep -o '"state": "[^"]*"' | head -1 | cut -d'"' -f4)
  echo "  Attempt $i: state = ${STATE:-UNKNOWN}"
  if [ "$STATE" = "READY" ]; then
    echo "Deployment is READY."
    echo "Allowing 15s propagation margin for message processors..."
    sleep 15
    echo "=== Deployment complete! Revision ${REVISION} is now serving traffic. ==="
    exit 0
  fi
  sleep 5
done

echo "Warning: Timed out waiting for READY state. Please verify via Apigee console."
