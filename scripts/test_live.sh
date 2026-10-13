#!/usr/bin/env bash
# Live Smoke Test Suite for apigee-llm-router
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ -f "${ROOT_DIR}/.env" ]; then
  source "${ROOT_DIR}/.env"
fi

APIGEE_HOST="${APIGEE_HOST:-${APIGEE_HOST_PROD:-}}"

if [ -z "${APIGEE_HOST}" ]; then
  echo "[!] APIGEE_HOST is not set. Export APIGEE_HOST=<your-apigee-domain> before running."
  exit 1
fi

BASE_URL="https://${APIGEE_HOST}/v1"

if [ -z "${APIGEE_API_KEY}" ]; then
  echo "[!] APIGEE_API_KEY is not set. Run 'bash scripts/provision_product_and_app.sh' first and export APIGEE_API_KEY."
  exit 1
fi

echo "=========================================================="
echo "   Apigee LLM Router - Live Smoke Tests"
echo "   Target: ${BASE_URL}"
echo "=========================================================="

echo -e "\n[1/4] Testing GET /v1/health (unauthenticated health check)..."
curl -s "${BASE_URL}/health" | python3 -m json.tool

echo -e "\n[2/4] Testing GET /v1/models (authenticated model list)..."
curl -s "${BASE_URL}/models" \
  -H "Authorization: Bearer ${APIGEE_API_KEY}" | python3 -m json.tool | head -n 30

echo -e "\n[3/4] Testing POST /v1/chat/completions with gcp/claude-haiku-5-5 (Vertex AI via GoogleAccessToken)..."
curl -s -i -X POST "${BASE_URL}/chat/completions" \
  -H "Authorization: Bearer ${APIGEE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gcp/claude-haiku-5-5",
    "messages": [
      {"role": "user", "content": "Reply with exactly: Pong from Claude Haiku 5.5 on GCP!"}
    ],
    "max_tokens": 50
  }'

echo -e "\n\n[4/4] Testing POST /v1/chat/completions with gcp/claude-haiku-4-5..."
curl -s -i -X POST "${BASE_URL}/chat/completions" \
  -H "Authorization: Bearer ${APIGEE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gcp/claude-haiku-4-5",
    "messages": [
      {"role": "user", "content": "Reply with exactly: Pong from Claude Haiku 4.5 on GCP!"}
    ],
    "max_tokens": 50
  }'

echo -e "\n\n✅ Live smoke tests completed!"

