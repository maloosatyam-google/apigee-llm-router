/**
 * EstimatePromptTokens.js
 * Estimates prompt token count (~4 characters per token heuristic) and
 * pre-call cost in micro-USD (1,000,000 micro-USD = $1.00) to support both:
 *   1. Token Quota enforcement (Q-EnforceTokenQuota via flow.quota_weight)
 *   2. Cost Budget Quota enforcement (Q-EnforceCostQuota via flow.cost_quota_weight_micros)
 */

(function () {
  var reqContent = context.getVariable("request.content") || "";
  if (!reqContent) {
    context.setVariable("flow.estimated_prompt_tokens", "0");
    context.setVariable("flow.quota_weight", "1");
    context.setVariable("flow.cost_quota_weight_micros", "1");
    return;
  }

  // Input rate per 1M tokens in USD (= micro-USD per 1 token)
  var inputRates = {
    "claude-haiku-4-5": 1.00,
    "claude-haiku-5-5": 0.10,
    "claude-sonnet-4-6": 3.00,
    "gpt-4o": 2.50,
    "gpt-4o-mini": 0.15,
    "o1": 15.00,
    "o3-mini": 1.10,
    "claude-3-5-sonnet": 3.00,
    "claude-3-5-sonnet-20241022": 3.00,
    "claude-3-5-haiku": 0.80,
    "claude-3-5-haiku-20241022": 0.80,
    "claude-3-opus-20240229": 15.00,
    "gemini-2.0-flash": 0.10,
    "gemini-1.5-pro": 1.25,
    "gemini-1.5-flash": 0.075,
    "qwen-plus": 0.11,
    "qwen-max": 2.80,
    "qwen-turbo": 0.04,
    "qwen-2.5-72b-instruct": 0.50,
    "qwen-2.5-coder-32b-instruct": 0.25,
    "glm-4-plus": 1.40,
    "glm-4-air": 0.14,
    "glm-4-flash": 0.01
  };

  try {
    var payload = JSON.parse(reqContent);
    var totalChars = 0;

    if (payload.messages && Array.isArray(payload.messages)) {
      for (var i = 0; i < payload.messages.length; i++) {
        var msg = payload.messages[i];
        if (msg) {
          if (typeof msg.content === "string") {
            totalChars += msg.content.length;
          } else if (Array.isArray(msg.content)) {
            for (var j = 0; j < msg.content.length; j++) {
              if (msg.content[j] && msg.content[j].text) {
                totalChars += msg.content[j].text.length;
              }
            }
          }
        }
      }
    } else if (payload.prompt) {
      totalChars = typeof payload.prompt === "string" ? payload.prompt.length : JSON.stringify(payload.prompt).length;
    }

    // Heuristic: ~4 characters per token, minimum 1 token if content exists
    var estimatedTokens = totalChars > 0 ? Math.max(1, Math.ceil(totalChars / 4)) : 0;
    var tokenWeight = Math.max(1, estimatedTokens);

    var canonicalModel = (context.getVariable("flow.canonical_model") || "").toLowerCase().trim();
    var inputRate = inputRates[canonicalModel] !== undefined ? inputRates[canonicalModel] : 1.00;
    var costMicros = Math.max(1, Math.ceil(tokenWeight * inputRate));

    context.setVariable("flow.estimated_prompt_tokens", String(estimatedTokens));
    context.setVariable("flow.quota_weight", String(tokenWeight));
    context.setVariable("flow.cost_quota_weight_micros", String(costMicros));
  } catch (e) {
    context.setVariable("flow.estimated_prompt_tokens", "0");
    context.setVariable("flow.quota_weight", "1");
    context.setVariable("flow.cost_quota_weight_micros", "1");
  }
})();
