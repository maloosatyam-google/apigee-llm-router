/**
 * TransformFromGemini.js
 * Translates a Google Gemini generateContent response back into standard OpenAI Chat Completion response.
 */

(function () {
  var resContent = context.getVariable("response.content") || "";
  if (!resContent) {
    return;
  }

  try {
    var geminiResp = JSON.parse(resContent);

    // If Gemini returned an error object
    if (geminiResp.error) {
      var errObj = geminiResp.error;
      var standardErr = {
        error: {
          message: errObj.message || "Gemini upstream error",
          type: "api_error",
          param: null,
          code: errObj.code || context.getVariable("response.status.code") || 500
        }
      };
      context.setVariable("response.content", JSON.stringify(standardErr));
      return;
    }

    var originalModel = context.getVariable("flow.original_model") || geminiResp.modelVersion || "gemini-2.0-flash";

    // 1. Extract generated text, reasoning thoughts, and finish reason
    var fullText = "";
    var reasoningText = "";
    var finishReason = "stop";

    if (geminiResp.candidates && Array.isArray(geminiResp.candidates) && geminiResp.candidates.length > 0) {
      var candidate = geminiResp.candidates[0];
      if (candidate.content && candidate.content.parts && Array.isArray(candidate.content.parts)) {
        for (var p = 0; p < candidate.content.parts.length; p++) {
          var part = candidate.content.parts[p];
          if (!part) continue;
          if (part.thought === true && part.text) {
            reasoningText += part.text;
          } else if (part.text) {
            fullText += part.text;
          }
        }
      }

      var rawReason = candidate.finishReason || "STOP";
      if (rawReason === "STOP") {
        finishReason = "stop";
      } else if (rawReason === "MAX_TOKENS") {
        finishReason = "length";
      } else if (rawReason === "SAFETY" || rawReason === "RECITATION") {
        finishReason = "content_filter";
      }
    }

    // 2. Extract token usage (including thoughtsTokenCount billed at output rate)
    var promptTokens = 0;
    var completionTokens = 0;
    var thoughtTokens = 0;
    var totalTokens = 0;

    if (geminiResp.usageMetadata) {
      promptTokens = geminiResp.usageMetadata.promptTokenCount || 0;
      thoughtTokens = geminiResp.usageMetadata.thoughtsTokenCount || 0;
      completionTokens = (geminiResp.usageMetadata.candidatesTokenCount || 0) + thoughtTokens;
      totalTokens = geminiResp.usageMetadata.totalTokenCount || (promptTokens + completionTokens);
    }

    // 3. Construct OpenAI-compliant response
    var msgObj = {
      role: "assistant",
      content: fullText
    };
    if (reasoningText) {
      msgObj.reasoning_content = reasoningText;
    }

    var openAIResp = {
      id: "chatcmpl-gemini-" + String(Date.now()),
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

    // 4. Populate context variables for downstream metering and cost policies
    context.setVariable("flow.prompt_tokens", String(promptTokens));
    context.setVariable("flow.completion_tokens", String(completionTokens));
    context.setVariable("flow.total_tokens", String(totalTokens));

    context.setVariable("response.content", JSON.stringify(openAIResp));
    context.setVariable("response.header.Content-Type", "application/json");
  } catch (e) {
    context.setVariable("flow.transform_error", e.message);
  }
})();
