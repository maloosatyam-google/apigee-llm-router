/**
 * EstimatePromptTokens.js
 * Estimates prompt token count (~4 characters per token heuristic)
 * to support pre-call token quota enforcement and telemetry.
 */

(function () {
  var reqContent = context.getVariable("request.content") || "";
  if (!reqContent) {
    context.setVariable("flow.estimated_prompt_tokens", "0");
    context.setVariable("flow.quota_weight", "1");
    return;
  }

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
    context.setVariable("flow.estimated_prompt_tokens", String(estimatedTokens));
    context.setVariable("flow.quota_weight", String(Math.max(1, estimatedTokens)));
  } catch (e) {
    context.setVariable("flow.estimated_prompt_tokens", "0");
    context.setVariable("flow.quota_weight", "1");
  }
})();
