/**
 * ExtractAndRouteModel.js
 * Parses standard OpenAI chat completion payload, resolves model aliases,
 * extracts prompts, and routes to appropriate LLM provider:
 * - Multi-Cloud Claude (claude-haiku-4-5, claude-haiku-5-5, claude-sonnet-4-6):
 *   * GCP Vertex AI (gcp-claude): gcp/claude-*, vertex_ai/claude-*
 *   * AWS Bedrock (aws-claude): aws/claude-*, bedrock/claude-*
 *   * Azure AI Foundry (azure-claude): azure/claude-*, azure_ai/claude-*
 * - Direct Anthropic (anthropic): claude-3-* or anthropic/claude-*
 * - OpenAI (gpt-4o, o1, o3, etc.)
 * - Google Gemini (gemini-2.0-flash, gemini-1.5-pro, etc.)
 * - Qwen / DashScope (qwen-max, qwen-plus, qwen-2.5-*, etc.)
 * - GLM / Zhipu AI (glm-4-plus, glm-4-air, glm-4-flash, etc.)
 */

(function () {
  var reqContent = context.getVariable("request.content") || "";
  if (!reqContent) {
    return;
  }

  try {
    var payload = JSON.parse(reqContent);
    var requestedModel = payload.model || "";

    // 1. Alias Resolution Map
    var aliases = {
      "fast": "gemini-2.0-flash",
      "smart": "gpt-4o",
      "coding": "qwen-2.5-coder-32b-instruct",
      "cheap": "glm-4-flash",
      "default": "gemini-2.0-flash",
      "qwen": "qwen-plus",
      "glm": "glm-4-plus",
      "haiku-4-5": "claude-haiku-4-5",
      "haiku-5-5": "claude-haiku-5-5",
      "sonnet-4-6": "claude-sonnet-4-6"
    };

    if (!requestedModel || typeof requestedModel !== "string" || requestedModel.trim() === "") {
      context.setVariable("flow.invalid_model", "true");
      return;
    }

    var resolvedModel = requestedModel.trim();
    if (aliases[resolvedModel]) {
      resolvedModel = aliases[resolvedModel];
    }

    // Check optional cloud provider header or payload hint
    var headerCloud = (
      context.getVariable("request.header.x-cloud-provider") ||
      context.getVariable("request.header.x-provider") ||
      payload.provider ||
      ""
    ).toLowerCase().trim();

    // Multi-cloud upstream model mapping for claude-haiku-4-5, claude-haiku-5-5, claude-sonnet-4-6
    var multiCloudClaudeModels = {
      "claude-haiku-4-5": {
        gcp: "claude-haiku-4-5@20251001",
        aws: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
        azure: "claude-haiku-4-5"
      },
      "claude-haiku-5-5": {
        gcp: "claude-haiku-5-5",
        aws: "us.anthropic.claude-haiku-5-5-v1:0",
        azure: "claude-haiku-5-5"
      },
      "claude-sonnet-4-6": {
        gcp: "claude-sonnet-4-6",
        aws: "us.anthropic.claude-sonnet-4-6-v1:0",
        azure: "claude-sonnet-4-6"
      }
    };

    var provider = "openai";
    var cloudProvider = "";
    var upstreamModel = resolvedModel;
    var canonicalModel = resolvedModel;

    // 2. Check for explicit provider prefix (e.g. aws/claude-haiku-4-5, azure/claude-sonnet-4-6, gcp/claude-haiku-5-5)
    var prefixMatch = resolvedModel.match(/^(gcp|vertex_ai|vertex|aws|bedrock|azure|azure_ai|anthropic)\/(.+)$/i);
    if (prefixMatch) {
      var rawPrefix = prefixMatch[1].toLowerCase();
      canonicalModel = prefixMatch[2];

      if (rawPrefix === "gcp" || rawPrefix === "vertex_ai" || rawPrefix === "vertex") {
        cloudProvider = "gcp";
      } else if (rawPrefix === "aws" || rawPrefix === "bedrock") {
        cloudProvider = "aws";
      } else if (rawPrefix === "azure" || rawPrefix === "azure_ai") {
        cloudProvider = "azure";
      } else if (rawPrefix === "anthropic") {
        cloudProvider = "anthropic";
      }
    } else if (headerCloud) {
      if (headerCloud === "gcp" || headerCloud === "vertex" || headerCloud === "vertex_ai") {
        cloudProvider = "gcp";
      } else if (headerCloud === "aws" || headerCloud === "bedrock") {
        cloudProvider = "aws";
      } else if (headerCloud === "azure" || headerCloud === "azure_ai") {
        cloudProvider = "azure";
      } else if (headerCloud === "anthropic") {
        cloudProvider = "anthropic";
      }
    }

    // Normalize @version suffix for lookup if caller passed claude-haiku-4-5@20251001
    var baseModelKey = canonicalModel.split("@")[0].toLowerCase();

    // 3. Route Multi-Cloud Claude 4.5 / 5.5 / 4.6 models
    if (multiCloudClaudeModels[baseModelKey]) {
      var targetCloud = cloudProvider || "gcp"; // Default to GCP Vertex AI when unprefixed
      var cloudMap = multiCloudClaudeModels[baseModelKey];

      if (targetCloud === "aws") {
        provider = "aws-claude";
        cloudProvider = "aws";
        upstreamModel = cloudMap.aws;
      } else if (targetCloud === "azure") {
        provider = "azure-claude";
        cloudProvider = "azure";
        upstreamModel = cloudMap.azure;
      } else if (targetCloud === "anthropic") {
        provider = "anthropic";
        cloudProvider = "anthropic";
        upstreamModel = canonicalModel;
      } else {
        provider = "gcp-claude";
        cloudProvider = "gcp";
        upstreamModel = canonicalModel.indexOf("@") !== -1 ? canonicalModel : cloudMap.gcp;
      }
    }
    // Check direct AWS Bedrock model IDs (e.g. us.anthropic.claude-* or anthropic.claude-*)
    else if (/^(us\.)?anthropic\.claude/i.test(canonicalModel)) {
      provider = "aws-claude";
      cloudProvider = "aws";
      upstreamModel = canonicalModel;
    }
    // Check other Claude models
    else if (/^claude/i.test(canonicalModel)) {
      if (cloudProvider === "gcp") {
        provider = "gcp-claude";
        upstreamModel = canonicalModel;
      } else if (cloudProvider === "aws") {
        provider = "aws-claude";
        upstreamModel = canonicalModel;
      } else if (cloudProvider === "azure") {
        provider = "azure-claude";
        upstreamModel = canonicalModel;
      } else {
        provider = "anthropic";
        cloudProvider = "anthropic";
        upstreamModel = canonicalModel;
      }
    } else if (/^gemini/i.test(canonicalModel)) {
      provider = "gemini";
      cloudProvider = "gcp";
      upstreamModel = canonicalModel;
    } else if (/^qwen/i.test(canonicalModel)) {
      provider = "qwen";
      cloudProvider = "alibaba";
      upstreamModel = canonicalModel;
    } else if (/^glm/i.test(canonicalModel)) {
      provider = "glm";
      cloudProvider = "zhipuai";
      upstreamModel = canonicalModel;
    } else if (/^(gpt|o1|o3|text-embedding|chatgpt)/i.test(canonicalModel)) {
      provider = "openai";
      cloudProvider = "openai";
      upstreamModel = canonicalModel;
    } else {
      provider = "openai";
      cloudProvider = "openai";
      upstreamModel = canonicalModel;
    }

    // 4. Extract Prompt Text from Messages (for logging, analytics, token estimation)
    var prompt = "";
    if (payload.messages && Array.isArray(payload.messages) && payload.messages.length > 0) {
      for (var i = payload.messages.length - 1; i >= 0; i--) {
        var msg = payload.messages[i];
        if (msg && msg.role === "user") {
          if (typeof msg.content === "string") {
            prompt = msg.content;
          } else if (Array.isArray(msg.content)) {
            var parts = [];
            for (var p = 0; p < msg.content.length; p++) {
              if (msg.content[p] && msg.content[p].text) {
                parts.push(msg.content[p].text);
              }
            }
            prompt = parts.join(" ");
          }
          break;
        }
      }
    }

    // 5. Update the payload model with resolved upstream model
    if (payload.model !== upstreamModel) {
      payload.model = upstreamModel;
      context.setVariable("request.content", JSON.stringify(payload));
    }

    // 6. Populate Apigee Flow Variables
    context.setVariable("flow.original_model", requestedModel || "unknown");
    context.setVariable("flow.canonical_model", baseModelKey || canonicalModel || "unknown");
    context.setVariable("flow.upstream_model", upstreamModel || "unknown");
    context.setVariable("flow.provider", provider);
    context.setVariable("flow.cloud_provider", cloudProvider);
    context.setVariable("flow.userPrompt", prompt);
    context.setVariable("flow.is_stream", payload.stream ? "true" : "false");

    if (payload.temperature !== undefined && payload.temperature !== null) {
      context.setVariable("flow.temperature", String(payload.temperature));
    }
    if (payload.max_tokens !== undefined && payload.max_tokens !== null) {
      context.setVariable("flow.max_tokens", String(payload.max_tokens));
    }
  } catch (e) {
    context.setVariable("flow.parse_error", e.message || "Invalid JSON payload");
  }
})();
