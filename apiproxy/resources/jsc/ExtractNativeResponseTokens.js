/**
 * ExtractNativeResponseTokens.js
 * Extracts token usage from native OpenAI-compatible responses (OpenAI, Qwen, GLM)
 * to populate standardized flow variables for cost calculation and analytics.
 */

(function () {
  var resContent = context.getVariable("response.content") || "";
  if (!resContent) {
    return;
  }

  try {
    var resp = JSON.parse(resContent);
    if (resp.usage) {
      var promptTokens = resp.usage.prompt_tokens || 0;
      var completionTokens = resp.usage.completion_tokens || 0;
      var totalTokens = resp.usage.total_tokens || (promptTokens + completionTokens);

      context.setVariable("flow.prompt_tokens", String(promptTokens));
      context.setVariable("flow.completion_tokens", String(completionTokens));
      context.setVariable("flow.total_tokens", String(totalTokens));
    }
  } catch (e) {
    // Non-JSON or error; ignore
  }
})();
