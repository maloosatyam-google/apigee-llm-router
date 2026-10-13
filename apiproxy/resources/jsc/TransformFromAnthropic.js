/**
 * TransformFromAnthropic.js
 * Translates an Anthropic Claude response back into standard OpenAI Chat Completion response.
 */

(function () {
  var resContent = context.getVariable("response.content") || "";
  if (!resContent) {
    return;
  }

  try {
    var anthropicResp = JSON.parse(resContent);

    // If Anthropic returned an error object
    if (anthropicResp.error || anthropicResp.type === "error") {
      var errObj = anthropicResp.error || anthropicResp;
      var standardErr = {
        error: {
          message: errObj.message || "Anthropic upstream error",
          type: errObj.type || "api_error",
          param: null,
          code: context.getVariable("response.status.code") || 500
        }
      };
      context.setVariable("response.content", JSON.stringify(standardErr));
      return;
    }

    var originalModel = context.getVariable("flow.original_model") || anthropicResp.model || "claude-haiku-4-5";

    // 1. Extract content text, thinking blocks, and tool calls from Anthropic content blocks
    var fullText = "";
    var reasoningText = "";
    var toolCalls = [];

    if (anthropicResp.content && Array.isArray(anthropicResp.content)) {
      for (var i = 0; i < anthropicResp.content.length; i++) {
        var part = anthropicResp.content[i];
        if (!part) continue;
        if (part.type === "text" && part.text) {
          fullText += part.text;
        } else if (part.type === "thinking" && part.thinking) {
          reasoningText += part.thinking;
        } else if (part.type === "tool_use") {
          toolCalls.push({
            id: part.id || ("call_" + i),
            type: "function",
            function: {
              name: part.name || "",
              arguments: JSON.stringify(part.input || {})
            }
          });
        }
      }
    }

    // 2. Map stop reason
    var finishReason = "stop";
    if (anthropicResp.stop_reason === "max_tokens") {
      finishReason = "length";
    } else if (anthropicResp.stop_reason === "stop_sequence") {
      finishReason = "stop";
    } else if (anthropicResp.stop_reason === "tool_use" || toolCalls.length > 0) {
      finishReason = "tool_calls";
    } else if (anthropicResp.stop_reason === "refusal") {
      finishReason = "content_filter";
    }

    // 3. Extract usage tokens
    var promptTokens = 0;
    var completionTokens = 0;
    if (anthropicResp.usage) {
      promptTokens = anthropicResp.usage.input_tokens || 0;
      completionTokens = anthropicResp.usage.output_tokens || 0;
    }
    var totalTokens = promptTokens + completionTokens;

    // 4. Construct OpenAI-compliant response
    var msgObj = {
      role: "assistant",
      content: fullText
    };
    if (reasoningText) {
      msgObj.reasoning_content = reasoningText;
    }
    if (toolCalls.length > 0) {
      msgObj.tool_calls = toolCalls;
    }

    var openAIResp = {
      id: "chatcmpl-claude-" + (anthropicResp.id || String(Date.now())),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: originalModel,
      choices: [
        {
          index: 0,
          message: msgObj,
          finish_reason: finishReason
        }
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens
      }
    };

    // 5. Populate context variables for downstream metering and cost policies
    context.setVariable("flow.prompt_tokens", String(promptTokens));
    context.setVariable("flow.completion_tokens", String(completionTokens));
    context.setVariable("flow.total_tokens", String(totalTokens));

    context.setVariable("response.content", JSON.stringify(openAIResp));
    context.setVariable("response.header.Content-Type", "application/json");
  } catch (e) {
    context.setVariable("flow.transform_error", e.message);
  }
})();
