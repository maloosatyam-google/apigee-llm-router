#!/usr/bin/env bash
# Provision KVM in Apigee for LLM Provider Credentials
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ -f "${ROOT_DIR}/.env" ]; then
  source "${ROOT_DIR}/.env"
fi

ORG="${APIGEE_ORG:-${ORG:-}}"
ENV="${APIGEE_ENV:-${ENV:-prod}}"
KVM_NAME="llm-provider-credentials"

if [ -z "$ORG" ]; then
  echo "Usage: APIGEE_ORG=<ORG> [APIGEE_ENV=<ENV>] $0"
  exit 1
fi

TOKEN=$(gcloud auth application-default print-access-token 2>/dev/null || gcloud auth print-access-token)

echo "=== Provisioning KVM: ${KVM_NAME} in Org: ${ORG}, Env: ${ENV} ==="

# 1. Create KVM map if it doesn't exist
CREATE_RES=$(curl -s -X POST "https://apigee.googleapis.com/v1/organizations/${ORG}/environments/${ENV}/keyvaluemaps" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"${KVM_NAME}\", \"encrypted\": true}")

echo "KVM Map Status: ${CREATE_RES}"

# Function to upsert KVM entry
set_kvm_entry() {
  local KEY="$1"
  local VAL="$2"
  if [ -n "$VAL" ]; then
    echo "Upserting entry for key: ${KEY}..."
    local CODE
    CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "https://apigee.googleapis.com/v1/organizations/${ORG}/environments/${ENV}/keyvaluemaps/${KVM_NAME}/entries" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"name\": \"${KEY}\", \"value\": \"${VAL}\"}")
    if [ "${CODE}" = "409" ]; then
      curl -s -o /dev/null \
        -X PUT "https://apigee.googleapis.com/v1/organizations/${ORG}/environments/${ENV}/keyvaluemaps/${KVM_NAME}/entries/${KEY}" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"${KEY}\", \"value\": \"${VAL}\"}"
    fi
  fi
}

set_kvm_entry "openai_api_key" "${OPENAI_API_KEY}"
set_kvm_entry "anthropic_api_key" "${ANTHROPIC_API_KEY}"
set_kvm_entry "gemini_api_key" "${GEMINI_API_KEY}"
set_kvm_entry "qwen_api_key" "${QWEN_API_KEY}"
set_kvm_entry "glm_api_key" "${GLM_API_KEY}"
set_kvm_entry "aws_api_key" "${AWS_API_KEY}"
set_kvm_entry "aws_region" "${AWS_REGION:-us-east-1}"
set_kvm_entry "azure_api_key" "${AZURE_API_KEY}"
set_kvm_entry "azure_resource" "${AZURE_RESOURCE}"
set_kvm_entry "gcp_project_id" "${GCP_PROJECT_ID:-${ORG}}"
set_kvm_entry "gcp_location" "${GCP_LOCATION:-global}"

echo "=== KVM Provisioning Finished ==="
