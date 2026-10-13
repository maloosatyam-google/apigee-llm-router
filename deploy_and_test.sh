#!/usr/bin/env bash
# ==============================================================================
# Apigee LLM Router - End-to-End gcloud Deployment & Testing Script
#
# Just update the variables in the "USER CONFIGURATION" section below and run:
#   ./deploy_and_test.sh
# ==============================================================================
set -e

# ==============================================================================
# 1. USER CONFIGURATION (Update these variables for your environment)
# ==============================================================================

# --- Google Cloud & Apigee X Settings ---
PROJECT_ID="YOUR_GCP_PROJECT_ID"
APIGEE_ORG="YOUR_APIGEE_ORG"
APIGEE_ENV="prod"
APIGEE_HOST="YOUR_APIGEE_HOST"   # e.g. api.example.com

# --- Proxy & Runtime Service Account Settings ---
PROXY_NAME="apigee-llm-router"
SERVICE_ACCOUNT_NAME="apigee-llm-router-sa"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
CREATE_SA_IF_MISSING="true"      # Creates the SA and binds roles/aiplatform.user if true

# --- API Product & Developer App Settings ---
DEVELOPER_EMAIL="developer@example.com"
PRODUCT_NAME="llm-router-product"
APP_NAME="llm-router-app"

# --- Multi-Cloud Claude (GCP / AWS / Azure) Configuration ---
GCP_PROJECT_ID="${PROJECT_ID}"
GCP_LOCATION="global"

AWS_REGION="us-east-1"
AWS_API_KEY=""                   # Optional: AWS Bedrock API Key / Bearer Token

AZURE_RESOURCE="your-azure-foundry-resource"
AZURE_API_KEY=""                 # Optional: Azure AI Foundry API Key

# --- Other LLM Provider API Keys (Optional - stored in Apigee Encrypted KVM) ---
OPENAI_API_KEY=""                # Optional: OpenAI API Key (sk-...)
ANTHROPIC_API_KEY=""             # Optional: Direct Anthropic API Key (sk-ant-...)
GEMINI_API_KEY=""                # Optional: Google AI Studio API Key (AIza...)
QWEN_API_KEY=""                  # Optional: Alibaba DashScope API Key
GLM_API_KEY=""                   # Optional: Zhipu AI BigModel API Key

# --- Execution Flags ---
WAIT_FOR_READY="true"            # Poll until Apigee revision is READY
RUN_LIVE_TESTS="true"            # Execute smoke tests after deployment

# ==============================================================================
# END OF USER CONFIGURATION
# ==============================================================================

if [ "${PROJECT_ID}" = "YOUR_GCP_PROJECT_ID" ] || [ "${APIGEE_ORG}" = "YOUR_APIGEE_ORG" ] || [ "${APIGEE_HOST}" = "YOUR_APIGEE_HOST" ]; then
  echo "❌ Please update PROJECT_ID, APIGEE_ORG, and APIGEE_HOST at the top of $0 before running."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="${SCRIPT_DIR}/dist"
BUNDLE_ZIP="${DIST_DIR}/${PROXY_NAME}.zip"
KVM_NAME="llm-provider-credentials"

echo "=================================================================="
echo "  Apigee LLM Router - Turnkey gcloud Deployment & Provisioning"
echo "  Project / Org : ${PROJECT_ID} / ${APIGEE_ORG}"
echo "  Environment   : ${APIGEE_ENV}"
echo "  Gateway Host  : https://${APIGEE_HOST}/v1"
echo "=================================================================="

# ------------------------------------------------------------------------------
# Step 1: Authenticate via gcloud
# ------------------------------------------------------------------------------
echo -e "\n[Step 1/7] Authenticating with Google Cloud (gcloud)..."
gcloud config set project "${PROJECT_ID}" --quiet >/dev/null 2>&1 || true
TOKEN=$(gcloud auth application-default print-access-token 2>/dev/null || gcloud auth print-access-token)

if [ -z "${TOKEN}" ]; then
  echo "❌ Error: Unable to obtain gcloud access token. Run 'gcloud auth login' first."
  exit 1
fi
echo "✅ Obtained gcloud access token."

# ------------------------------------------------------------------------------
# Step 2: Optional Service Account Creation & Vertex AI IAM Binding
# ------------------------------------------------------------------------------
echo -e "\n[Step 2/7] Checking Runtime Service Account (${SERVICE_ACCOUNT_EMAIL})..."
if [ "${CREATE_SA_IF_MISSING}" = "true" ]; then
  if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT_EMAIL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    echo "Creating service account ${SERVICE_ACCOUNT_EMAIL}..."
    gcloud iam service-accounts create "${SERVICE_ACCOUNT_NAME}" \
      --display-name="Apigee LLM Router Runtime SA" \
      --project="${PROJECT_ID}"
  fi
  echo "Ensuring roles/aiplatform.user on ${PROJECT_ID} for ${SERVICE_ACCOUNT_EMAIL}..."
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/aiplatform.user" \
    --condition=None \
    --quiet >/dev/null
fi
echo "✅ Runtime Service Account ready: ${SERVICE_ACCOUNT_EMAIL}"

# ------------------------------------------------------------------------------
# Step 3: Provision Analytics DataCollectors
# ------------------------------------------------------------------------------
echo -e "\n[Step 3/7] Ensuring Apigee Analytics DataCollectors..."
ensure_collector() {
  local DC_NAME="$1"
  local DC_TYPE="$2"
  curl -s -X POST "https://apigee.googleapis.com/v1/organizations/${APIGEE_ORG}/datacollectors" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"${DC_NAME}\", \"type\": \"${DC_TYPE}\"}" >/dev/null || true
}
ensure_collector "dc_model_name" "STRING"
ensure_collector "dc_prompt_token_count" "INTEGER"
ensure_collector "dc_candidates_token_count" "INTEGER"
ensure_collector "dc_total_token_count" "INTEGER"
echo "✅ Analytics DataCollectors verified."

# ------------------------------------------------------------------------------
# Step 4: Provision Encrypted KVM & Upsert Provider Credentials
# ------------------------------------------------------------------------------
echo -e "\n[Step 4/7] Provisioning KVM '${KVM_NAME}' in environment '${APIGEE_ENV}'..."
curl -s -X POST "https://apigee.googleapis.com/v1/organizations/${APIGEE_ORG}/environments/${APIGEE_ENV}/keyvaluemaps" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"${KVM_NAME}\", \"encrypted\": true}" >/dev/null || true

upsert_kvm_entry() {
  local KEY="$1"
  local VAL="$2"
  if [ -n "${VAL}" ]; then
    echo "  -> Upserting KVM key: ${KEY}"
    local CODE
    CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "https://apigee.googleapis.com/v1/organizations/${APIGEE_ORG}/environments/${APIGEE_ENV}/keyvaluemaps/${KVM_NAME}/entries" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"name\": \"${KEY}\", \"value\": \"${VAL}\"}")
    if [ "${CODE}" = "409" ]; then
      curl -s -o /dev/null \
        -X PUT "https://apigee.googleapis.com/v1/organizations/${APIGEE_ORG}/environments/${APIGEE_ENV}/keyvaluemaps/${KVM_NAME}/entries/${KEY}" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"${KEY}\", \"value\": \"${VAL}\"}"
    fi
  fi
}

upsert_kvm_entry "gcp_project_id" "${GCP_PROJECT_ID}"
upsert_kvm_entry "gcp_location" "${GCP_LOCATION}"
upsert_kvm_entry "aws_region" "${AWS_REGION}"
upsert_kvm_entry "aws_api_key" "${AWS_API_KEY}"
upsert_kvm_entry "azure_resource" "${AZURE_RESOURCE}"
upsert_kvm_entry "azure_api_key" "${AZURE_API_KEY}"
upsert_kvm_entry "openai_api_key" "${OPENAI_API_KEY}"
upsert_kvm_entry "anthropic_api_key" "${ANTHROPIC_API_KEY}"
upsert_kvm_entry "gemini_api_key" "${GEMINI_API_KEY}"
upsert_kvm_entry "qwen_api_key" "${QWEN_API_KEY}"
upsert_kvm_entry "glm_api_key" "${GLM_API_KEY}"
echo "✅ KVM '${KVM_NAME}' updated."

# ------------------------------------------------------------------------------
# Step 5: Validate, Package, Import & Deploy Proxy Bundle
# ------------------------------------------------------------------------------
echo -e "\n[Step 5/7] Validating, Packaging & Deploying '${PROXY_NAME}'..."
python3 "${SCRIPT_DIR}/scripts/validate_bundle.py"

mkdir -p "${DIST_DIR}"
rm -f "${BUNDLE_ZIP}"
(cd "${SCRIPT_DIR}" && zip -q -r "${BUNDLE_ZIP}" apiproxy -x "*.DS_Store*" "*__pycache__*")
echo "✅ Packaged ${BUNDLE_ZIP}"

IMPORT_RES=$(curl -s -X POST "https://apigee.googleapis.com/v1/organizations/${APIGEE_ORG}/apis?name=${PROXY_NAME}&action=import" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @"${BUNDLE_ZIP}")

REVISION=$(echo "${IMPORT_RES}" | grep -o '"revision": "[0-9]*"' | head -1 | cut -d'"' -f4)
if [ -z "${REVISION}" ]; then
  echo "❌ Proxy import failed:"
  echo "${IMPORT_RES}"
  exit 1
fi
echo "✅ Imported Revision: ${REVISION}"

DEPLOY_URL="https://apigee.googleapis.com/v1/organizations/${APIGEE_ORG}/environments/${APIGEE_ENV}/apis/${PROXY_NAME}/revisions/${REVISION}/deployments?override=true"
if [ -n "${SERVICE_ACCOUNT_EMAIL}" ]; then
  DEPLOY_URL="${DEPLOY_URL}&serviceAccount=${SERVICE_ACCOUNT_EMAIL}"
fi

curl -s -X POST "${DEPLOY_URL}" -H "Authorization: Bearer ${TOKEN}" >/dev/null

if [ "${WAIT_FOR_READY}" = "true" ]; then
  echo "Waiting for revision ${REVISION} to reach READY state in '${APIGEE_ENV}'..."
  STATUS_URL="https://apigee.googleapis.com/v1/organizations/${APIGEE_ORG}/environments/${APIGEE_ENV}/apis/${PROXY_NAME}/revisions/${REVISION}/deployments"
  for i in {1..30}; do
    STATUS_RES=$(curl -s -H "Authorization: Bearer ${TOKEN}" "${STATUS_URL}")
    STATE=$(echo "${STATUS_RES}" | grep -o '"state": "[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  Attempt ${i}/30: state = ${STATE:-UNKNOWN}"
    if [ "${STATE}" = "READY" ]; then
      echo "✅ Deployment is READY! Holding 10s for message processor propagation..."
      sleep 10
      break
    fi
    sleep 5
  done
fi

# ------------------------------------------------------------------------------
# Step 6: Provision API Product, Developer & App Key
# ------------------------------------------------------------------------------
echo -e "\n[Step 6/7] Provisioning API Product (${PRODUCT_NAME}) & Developer App (${APP_NAME})..."
PRODUCT_PAYLOAD=$(cat <<EOF
{
  "name": "${PRODUCT_NAME}",
  "displayName": "Apigee LLM Router Product",
  "approvalType": "auto",
  "description": "Entitles access to ${PROXY_NAME} (/v1/chat/completions, /v1/models)",
  "environments": ["${APIGEE_ENV}"],
  "quota": "10000",
  "quotaInterval": "1",
  "quotaTimeUnit": "minute",
  "attributes": [
    {
      "name": "llm_cost_quota_micros",
      "value": "10000000"
    },
    {
      "name": "llm_cost_quota_interval",
      "value": "1"
    },
    {
      "name": "llm_cost_quota_timeunit",
      "value": "month"
    }
  ],
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
  -X PUT "https://apigee.googleapis.com/v1/organizations/${APIGEE_ORG}/apiproducts/${PRODUCT_NAME}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${PRODUCT_PAYLOAD}")

if [ "${HTTP_CODE}" = "404" ]; then
  curl -s -X POST "https://apigee.googleapis.com/v1/organizations/${APIGEE_ORG}/apiproducts" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "${PRODUCT_PAYLOAD}" >/tmp/apigee_prod.json
fi

curl -s -X POST "https://apigee.googleapis.com/v1/organizations/${APIGEE_ORG}/developers" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"${DEVELOPER_EMAIL}\", \"firstName\": \"LLM\", \"lastName\": \"Router\", \"userName\": \"llmrouter\"}" >/dev/null || true

APP_CHECK=$(curl -s -o /tmp/apigee_app.json -w "%{http_code}" \
  "https://apigee.googleapis.com/v1/organizations/${APIGEE_ORG}/developers/${DEVELOPER_EMAIL}/apps/${APP_NAME}" \
  -H "Authorization: Bearer ${TOKEN}")

if [ "${APP_CHECK}" = "404" ]; then
  curl -s -X POST "https://apigee.googleapis.com/v1/organizations/${APIGEE_ORG}/developers/${DEVELOPER_EMAIL}/apps" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"${APP_NAME}\", \"apiProducts\": [\"${PRODUCT_NAME}\"]}" >/tmp/apigee_app.json
fi

APIGEE_API_KEY=$(python3 -c 'import json; d=json.load(open("/tmp/apigee_app.json")); print(d.get("credentials",[{}])[0].get("consumerKey",""))' 2>/dev/null || true)

if [ -n "${APIGEE_API_KEY}" ]; then
  curl -s -X POST "https://apigee.googleapis.com/v1/organizations/${APIGEE_ORG}/developers/${DEVELOPER_EMAIL}/apps/${APP_NAME}/keys/${APIGEE_API_KEY}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"apiProducts\": [\"${PRODUCT_NAME}\"]}" >/dev/null || true
fi

echo "✅ Consumer Key Ready: ${APIGEE_API_KEY}"

# ------------------------------------------------------------------------------
# Step 7: Run Live Verification Tests
# ------------------------------------------------------------------------------
BASE_URL="https://${APIGEE_HOST}/v1"

if [ "${RUN_LIVE_TESTS}" = "true" ] && [ -n "${APIGEE_API_KEY}" ]; then
  echo -e "\n[Step 7/7] Running Live Smoke Tests against ${BASE_URL}..."

  echo -e "\n--- 1. GET ${BASE_URL}/health ---"
  curl -s "${BASE_URL}/health" | python3 -m json.tool || true

  echo -e "\n--- 2. GET ${BASE_URL}/models (first 25 lines) ---"
  curl -s "${BASE_URL}/models" \
    -H "Authorization: Bearer ${APIGEE_API_KEY}" | python3 -m json.tool | head -n 25 || true

  echo -e "\n--- 3. POST ${BASE_URL}/chat/completions (gcp/claude-haiku-5-5 on Vertex AI) ---"
  curl -s -X POST "${BASE_URL}/chat/completions" \
    -H "Authorization: Bearer ${APIGEE_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "gcp/claude-haiku-5-5",
      "messages": [{"role": "user", "content": "Say: Hello from Claude Haiku 5.5 on GCP!"}],
      "max_tokens": 40
    }' | python3 -m json.tool || true

  echo -e "\n--- 4. POST ${BASE_URL}/chat/completions (gcp/claude-haiku-4-5 on Vertex AI) ---"
  curl -s -X POST "${BASE_URL}/chat/completions" \
    -H "Authorization: Bearer ${APIGEE_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "gcp/claude-haiku-4-5",
      "messages": [{"role": "user", "content": "Say: Hello from Claude Haiku 4.5 on GCP!"}],
      "max_tokens": 40
    }' | python3 -m json.tool || true
fi

echo ""
echo "=================================================================="
echo "  Deployment & Setup Complete!"
echo "  Gateway Base URL : ${BASE_URL}"
echo "  Apigee API Key   : ${APIGEE_API_KEY}"
echo "=================================================================="
