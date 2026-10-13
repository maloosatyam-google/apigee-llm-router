/**
 * TransformToAnthropic.js
 * Translates an OpenAI Chat Completion request into Anthropic Claude Messages schema
 * across all supported Claude providers:
 * - gcp-claude (Vertex AI :rawPredict -> anthropic_version: "vertex-2023-10-16" in body, no model in body)
 * - aws-claude (AWS Bedrock /invoke   -> anthropic_version: "bedrock-2023-05-31" in body, no model in body)
 * - azure-claude (Azure AI Foundry    -> model in body, anthropic-version in header)
 * - anthropic (Direct Anthropic API   -> model in body, anthropic-version in header)
 */

(function () {
  var reqContent = context.getVariable("request.content") || "";
  if (!reqContent) {
    return;
  }

  try {
    var openAIPayload = JSON.parse(reqContent);
    var provider = context.getVariable("flow.provider") || "anthropic";
    var upstreamModel = context.getVariable("flow.upstream_model") || openAIPayload.model || "claude-haiku-4-5";

    var systemPrompts = [];
    var rawMessages = openAIPayload.messages || [];
    var anthropicMessages = [];

    // 1. Separate system/developer message and user/assistant messages
    for (var i = 0; i < rawMessages.length; i++) {
      var msg = rawMessages[i];
      if (!msg) continue;

      if (msg.role === "system" || msg.role === "developer") {
        if (typeof msg.content === "string") {
          systemPrompts.push(msg.content);
        } else if (Array.isArray(msg.content)) {
          for (var s = 0; s < msg.content.length; s++) {
            if (msg.content[s] && msg.content[s].text) {
              systemPrompts.push(msg.content[s].text);
            }
          }
        }
      } else if (msg.role === "user" || msg.role === "assistant") {
        var role = msg.role;
        var content = msg.content;

        // Ensure string or Anthropic content block format
        if (typeof content === "string") {
          anthropicMessages.push({
            role: role,
            content: content
          });
        } else if (Array.isArray(content)) {
          var blocks = [];
          for (var c = 0; c < content.length; c++) {
            var item = content[c];
            if (item.type === "text") {
              blocks.push({ type: "text", text: item.text });
            } else if (item.type === "image_url" && item.image_url) {
              var url = item.image_url.url || "";
              if (url.indexOf("data:") === 0) {
                var parts = url.split(",");
                var meta = parts[0];
                var data = parts[1];
                var mediaType = "image/jpeg";
                var match = meta.match(/data:([^;]+);/);
                if (match && match[1]) {
                  mediaType = match[1];
                }
                blocks.push({
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType,
                    data: data
                  }
                });
              } else {
                blocks.push({ type: "text", text: "[Image URL: " + url + "]" });
              }
            }
          }
          anthropicMessages.push({
            role: role,
            content: blocks
          });
        }
      }
    }

    // 2. Anthropic requires alternating user/assistant turns starting with user
    var normalizedMessages = [];
    for (var m = 0; m < anthropicMessages.length; m++) {
      var current = anthropicMessages[m];
      if (normalizedMessages.length === 0) {
        if (current.role === "assistant") {
          normalizedMessages.push({ role: "user", content: "Continue" });
        }
        normalizedMessages.push(current);
      } else {
        var prev = normalizedMessages[normalizedMessages.length - 1];
        if (prev.role === current.role) {
          if (typeof prev.content === "string" && typeof current.content === "string") {
            prev.content = prev.content + "\n\n" + current.content;
          } else {
            var prevArr = typeof prev.content === "string" ? [{ type: "text", text: prev.content }] : prev.content;
            var currArr = typeof current.content === "string" ? [{ type: "text", text: current.content }] : current.content;
            prev.content = prevArr.concat(currArr);
          }
        } else {
          normalizedMessages.push(current);
        }
      }
    }

    if (normalizedMessages.length === 0) {
      normalizedMessages.push({ role: "user", content: "Hello" });
    }

    var resolvedMaxTokens = openAIPayload.max_tokens || openAIPayload.max_completion_tokens || 2048;

    // 3. Construct Anthropic payload tailored to the target cloud provider
    var anthropicPayload = {
      messages: normalizedMessages,
      max_tokens: Number(resolvedMaxTokens)
    };

    if (provider === "gcp-claude") {
      // Vertex AI :rawPredict requires anthropic_version in body and forbids model in body
      anthropicPayload.anthropic_version = "vertex-2023-10-16";
      if (/claude-haiku-5/.test(upstreamModel) && !openAIPayload.thinking) {
        anthropicPayload.thinking = { type: "disabled" };
      }
    } else if (provider === "aws-claude") {
      // AWS Bedrock /invoke requires anthropic_version in body and forbids model in body
      anthropicPayload.anthropic_version = "bedrock-2023-05-31";
    } else {
      // Azure AI Foundry & Direct Anthropic API require model in body
      anthropicPayload.model = upstreamModel;
    }

    if (systemPrompts.length > 0) {
      anthropicPayload.system = systemPrompts.join("\n\n");
    }

    if (openAIPayload.temperature !== undefined && openAIPayload.temperature !== null) {
      anthropicPayload.temperature = Number(openAIPayload.temperature);
    }

    if (openAIPayload.top_p !== undefined && openAIPayload.top_p !== null) {
      anthropicPayload.top_p = Number(openAIPayload.top_p);
    }

    if (openAIPayload.stop) {
      if (Array.isArray(openAIPayload.stop)) {
        anthropicPayload.stop_sequences = openAIPayload.stop;
      } else if (typeof openAIPayload.stop === "string") {
        anthropicPayload.stop_sequences = [openAIPayload.stop];
      }
    }

    // 4. Map OpenAI tools to Anthropic tools if present
    if (openAIPayload.tools && Array.isArray(openAIPayload.tools)) {
      var claudeTools = [];
      for (var t = 0; t < openAIPayload.tools.length; t++) {
        var tool = openAIPayload.tools[t];
        if (tool && tool.type === "function" && tool.function && tool.function.name) {
          claudeTools.push({
            name: tool.function.name,
            description: tool.function.description || "",
            input_schema: tool.function.parameters || { type: "object", properties: {} }
          });
        }
      }
      if (claudeTools.length > 0) {
        anthropicPayload.tools = claudeTools;
      }
    }

    context.setVariable("request.content", JSON.stringify(anthropicPayload));
  } catch (e) {
    context.setVariable("flow.transform_error", e.message);
  }
})();
