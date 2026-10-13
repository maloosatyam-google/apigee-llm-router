/**
 * ModelsEndpoint.js
 * Generates an OpenAI-compliant list of available models and aliases for GET /v1/models.
 */

(function () {
  var modelList = [
    // Multi-Cloud Claude Models (Default / Unprefixed -> GCP Vertex AI, or via x-cloud-provider header)
    { id: "claude-haiku-4-5", owned_by: "anthropic-multicloud", providers: ["gcp", "aws", "azure"] },
    { id: "claude-haiku-5-5", owned_by: "anthropic-multicloud", providers: ["gcp", "aws", "azure"] },
    { id: "claude-sonnet-4-6", owned_by: "anthropic-multicloud", providers: ["gcp", "aws", "azure"] },

    // GCP Vertex AI Claude Models
    { id: "gcp/claude-haiku-4-5", owned_by: "gcp-vertex-ai", root: "claude-haiku-4-5@20251001" },
    { id: "gcp/claude-haiku-5-5", owned_by: "gcp-vertex-ai", root: "claude-haiku-5-5" },
    { id: "gcp/claude-sonnet-4-6", owned_by: "gcp-vertex-ai", root: "claude-sonnet-4-6" },

    // AWS Bedrock Claude Models
    { id: "aws/claude-haiku-4-5", owned_by: "aws-bedrock", root: "us.anthropic.claude-haiku-4-5-20251001-v1:0" },
    { id: "aws/claude-haiku-5-5", owned_by: "aws-bedrock", root: "us.anthropic.claude-haiku-5-5-v1:0" },
    { id: "aws/claude-sonnet-4-6", owned_by: "aws-bedrock", root: "us.anthropic.claude-sonnet-4-6-v1:0" },

    // Azure AI Foundry Claude Models
    { id: "azure/claude-haiku-4-5", owned_by: "azure-ai-foundry", root: "claude-haiku-4-5" },
    { id: "azure/claude-haiku-5-5", owned_by: "azure-ai-foundry", root: "claude-haiku-5-5" },
    { id: "azure/claude-sonnet-4-6", owned_by: "azure-ai-foundry", root: "claude-sonnet-4-6" },

    // Direct Anthropic Models
    { id: "claude-3-5-sonnet-20241022", owned_by: "anthropic" },
    { id: "claude-3-5-sonnet", owned_by: "anthropic" },
    { id: "claude-3-5-haiku-20241022", owned_by: "anthropic" },
    { id: "claude-3-5-haiku", owned_by: "anthropic" },
    { id: "claude-3-opus-20240229", owned_by: "anthropic" },

    // OpenAI Models
    { id: "gpt-4o", owned_by: "openai" },
    { id: "gpt-4o-mini", owned_by: "openai" },
    { id: "o1", owned_by: "openai" },
    { id: "o3-mini", owned_by: "openai" },

    // Google Gemini Models
    { id: "gemini-2.0-flash", owned_by: "google" },
    { id: "gemini-2.0-flash-exp", owned_by: "google" },
    { id: "gemini-1.5-pro", owned_by: "google" },
    { id: "gemini-1.5-flash", owned_by: "google" },

    // Qwen Models (Alibaba Cloud)
    { id: "qwen-plus", owned_by: "alibaba" },
    { id: "qwen-max", owned_by: "alibaba" },
    { id: "qwen-turbo", owned_by: "alibaba" },
    { id: "qwen-2.5-72b-instruct", owned_by: "alibaba" },
    { id: "qwen-2.5-coder-32b-instruct", owned_by: "alibaba" },

    // GLM Models (Zhipu AI)
    { id: "glm-4-plus", owned_by: "zhipuai" },
    { id: "glm-4-air", owned_by: "zhipuai" },
    { id: "glm-4-flash", owned_by: "zhipuai" },

    // Router Logical Aliases
    { id: "fast", owned_by: "apigee-router", alias_for: "gemini-2.0-flash" },
    { id: "smart", owned_by: "apigee-router", alias_for: "gpt-4o" },
    { id: "coding", owned_by: "apigee-router", alias_for: "qwen-2.5-coder-32b-instruct" },
    { id: "cheap", owned_by: "apigee-router", alias_for: "glm-4-flash" },
    { id: "qwen", owned_by: "apigee-router", alias_for: "qwen-plus" },
    { id: "glm", owned_by: "apigee-router", alias_for: "glm-4-plus" },
    { id: "haiku-4-5", owned_by: "apigee-router", alias_for: "claude-haiku-4-5" },
    { id: "haiku-5-5", owned_by: "apigee-router", alias_for: "claude-haiku-5-5" },
    { id: "sonnet-4-6", owned_by: "apigee-router", alias_for: "claude-sonnet-4-6" },
    { id: "default", owned_by: "apigee-router", alias_for: "gemini-2.0-flash" }
  ];

  var baseTime = 1715558400;
  var data = [];

  for (var i = 0; i < modelList.length; i++) {
    var m = modelList[i];
    var entry = {
      id: m.id,
      object: "model",
      created: baseTime,
      owned_by: m.owned_by,
      permission: []
    };
    if (m.alias_for) {
      entry.root = m.alias_for;
    } else if (m.root) {
      entry.root = m.root;
    }
    if (m.providers) {
      entry.providers = m.providers;
    }
    data.push(entry);
  }

  var responseObj = {
    object: "list",
    data: data
  };

  context.setVariable("response.content", JSON.stringify(responseObj));
  context.setVariable("response.header.Content-Type", "application/json");
  context.setVariable("response.status.code", 200);
})();
