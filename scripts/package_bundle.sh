#!/usr/bin/env bash
# Package apigee-llm-router into deployable ZIP archive
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
PROXY_NAME="apigee-llm-router"
BUNDLE_ZIP="${DIST_DIR}/${PROXY_NAME}.zip"

echo "=== Running Proxy Bundle Validation ==="
python3 "${SCRIPT_DIR}/validate_bundle.py"

mkdir -p "$DIST_DIR"
rm -f "$BUNDLE_ZIP"

echo "=== Packaging Bundle into ${BUNDLE_ZIP} ==="
(cd "${ROOT_DIR}" && zip -r "${BUNDLE_ZIP}" apiproxy -x "*.DS_Store*" "*__pycache__*")

echo "✅ Successfully packaged: ${BUNDLE_ZIP} ($(du -h "${BUNDLE_ZIP}" | cut -f1))"
