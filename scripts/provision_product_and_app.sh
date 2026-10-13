#!/usr/bin/env bash
# Provision API Product and Developer App for apigee-llm-router in Apigee X
# Outputs a ready-to-use Consumer Key (APIGEE_API_KEY) for testing.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ -f "${ROOT_DIR}/.env" ]; then
  source "${ROOT_DIR}/.env"
fi

ORG="${APIGEE_ORG:-${ORG:-}}"
ENV="${APIGEE_ENV:-${ENV:-prod}}"
DEV_EMAIL="${APIGEE_DEVELOPER:-developer@example.com}"
PROXY_NAME="apigee-llm-router"
PRODUCT_NAME="llm-router-product"
APP_NAME="llm-router-app"

if [ -z "$ORG" ]; then
  echo "Usage: APIGEE_ORG=<ORG> [APIGEE_ENV=<ENV>] [APIGEE_DEVELOPER=<EMAIL>] $0"
  exit 1
fi

TOKEN=$(gcloud auth application-default print-access-token 2>/dev/null || gcloud auth print-access-token)

echo "=== 1. Provisioning API Product: ${PRODUCT_NAME} (Org: ${ORG}, Env: ${ENV}) ==="
PRODUCT_PAYLOAD=$(cat <<EOF
{
  "name": "${PRODUCT_NAME}",
  "displayName": "Apigee LLM Router Product",
  "ApprovalType": "auto",
  "description": "Entitles access to apigee-llm-router (/v1/chat/completions, /v1/models)",
  "environments": ["${ENV}"],
  "operationGroup": {
    "operationConfigs": [
      {
        "apiSource": "${PROXY_NAME}",
        "operations": [
          { "resource": "/" },
          { "resource": "/**" },
          { "resource": "/models" },
          { "resource": "/chat/completions" }
        ]
      }
    ],
    "operationConfigType": "proxy"
  }
}
EOF
)

HTTP_CODE=$(curl -s -o /tmp/apigee_prod.json -w "%{http_code}" \
  -X PUT "https://apigee.googleapis.com/v1/organizations/${ORG}/apiproducts/${PRODUCT_NAME}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${PRODUCT_PAYLOAD}")

if [ "$HTTP_CODE" = "404" ]; then
  curl -s -X POST "https://apigee.googleapis.com/v1/organizations/${ORG}/apiproducts" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "${PRODUCT_PAYLOAD}" > /tmp/apigee_prod.json
fi
echo "API Product '${PRODUCT_NAME}' ready."

echo "=== 2. Ensuring Developer: ${DEV_EMAIL} ==="
curl -s -X POST "https://apigee.googleapis.com/v1/organizations/${ORG}/developers" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"${DEV_EMAIL}\", \"firstName\": \"LLM\", \"lastName\": \"Router\", \"userName\": \"llmrouter\"}" > /dev/null || true

echo "=== 3. Provisioning Developer App: ${APP_NAME} ==="
APP_CHECK=$(curl -s -o /tmp/apigee_app.json -w "%{http_code}" \
  "https://apigee.googleapis.com/v1/organizations/${ORG}/developers/${DEV_EMAIL}/apps/${APP_NAME}" \
  -H "Authorization: Bearer ${TOKEN}")

if [ "$APP_CHECK" = "404" ]; then
  curl -s -X POST "https://apigee.googleapis.com/v1/organizations/${ORG}/developers/${DEV_EMAIL}/apps" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"${APP_NAME}\", \"apiProducts\": [\"${PRODUCT_NAME}\"]}" > /tmp/apigee_app.json
fi

CONSUMER_KEY=$(python3 -c 'import json; d=json.load(open("/tmp/apigee_app.json")); print(d.get("credentials",[{}])[0].get("consumerKey",""))' 2>/dev/null || true)

if [ -n "$CONSUMER_KEY" ]; then
  curl -s -X POST "https://apigee.googleapis.com/v1/organizations/${ORG}/developers/${DEV_EMAIL}/apps/${APP_NAME}/keys/${CONSUMER_KEY}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"apiProducts\": [\"${PRODUCT_NAME}\"]}" > /dev/null || true
fi

echo ""
echo "✅ Provisioning Complete!"
echo "   API Product : ${PRODUCT_NAME}"
echo "   Developer   : ${DEV_EMAIL}"
echo "   App Name    : ${APP_NAME}"
echo "   Consumer Key: ${CONSUMER_KEY}"
echo ""
echo "Export for testing:"
echo "  export APIGEE_API_KEY=\"${CONSUMER_KEY}\""
