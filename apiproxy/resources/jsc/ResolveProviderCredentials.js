/**
 * ResolveProviderCredentials.js
 * Resolves upstream API keys and cloud config from KVM variables or request headers,
 * and flags flow.missing_provider_key if the target provider requires an API key that is absent.
 */

(function () {
  var openaiKey = context.getVariable("private.openai_key") || context.getVariable("request.header.x-upstream-openai-key") || "";
  var anthropicKey = context.getVariable("private.anthropic_key") || context.getVariable("request.header.x-upstream-anthropic-key") || "";
  var geminiKey = context.getVariable("private.gemini_key") || context.getVariable("request.header.x-upstream-gemini-key") || "";
  var qwenKey = context.getVariable("private.qwen_key") || context.getVariable("request.header.x-upstream-qwen-key") || "";
  var glmKey = context.getVariable("private.glm_key") || context.getVariable("request.header.x-upstream-glm-key") || "";

  // AWS Bedrock parameters
  var awsKey = context.getVariable("private.aws_key") || context.getVariable("request.header.x-upstream-aws-key") || "";
  var awsRegion = context.getVariable("private.aws_region") || context.getVariable("request.header.x-aws-region") || "us-east-1";

  // Azure AI Foundry parameters
  var azureKey = context.getVariable("private.azure_key") || context.getVariable("request.header.x-upstream-azure-key") || "";
  var azureResource = context.getVariable("private.azure_resource") || context.getVariable("request.header.x-azure-resource") || "azure-ai-foundry";

  // GCP Vertex AI parameters (defaults to the Apigee X organization/project name)
  var gcpProjectId = (
    context.getVariable("private.gcp_project_id") ||
    context.getVariable("request.header.x-gcp-project-id") ||
    context.getVariable("organization.name") ||
    ""
  );
  var gcpLocation = context.getVariable("private.gcp_location") || context.getVariable("request.header.x-gcp-location") || "global";

  context.setVariable("flow.openai_api_key", openaiKey);
  context.setVariable("flow.anthropic_api_key", anthropicKey);
  context.setVariable("flow.gemini_api_key", geminiKey);
  context.setVariable("flow.qwen_api_key", qwenKey);
  context.setVariable("flow.glm_api_key", glmKey);

  context.setVariable("flow.aws_api_key", awsKey);
  context.setVariable("flow.aws_region", awsRegion);

  context.setVariable("flow.azure_api_key", azureKey);
  context.setVariable("flow.azure_resource", azureResource);

  context.setVariable("flow.gcp_project_id", gcpProjectId);
  context.setVariable("flow.gcp_location", gcpLocation);

  // Check if selected provider requires an API key that is missing (gcp-claude uses GoogleAccessToken)
  var provider = context.getVariable("flow.provider") || "";
  var missingKey = false;
  if (provider === "openai" && !openaiKey) missingKey = true;
  else if (provider === "anthropic" && !anthropicKey) missingKey = true;
  else if (provider === "gemini" && !geminiKey) missingKey = true;
  else if (provider === "qwen" && !qwenKey) missingKey = true;
  else if (provider === "glm" && !glmKey) missingKey = true;
  else if (provider === "aws-claude" && !awsKey) missingKey = true;
  else if (provider === "azure-claude" && !azureKey) missingKey = true;

  context.setVariable("flow.missing_provider_key", missingKey ? "true" : "false");
})();
