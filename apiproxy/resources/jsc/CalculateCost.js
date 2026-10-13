/**
 * CalculateCost.js
 * Calculates exact call cost in USD from input/output tokens using rate cards per 1M tokens.
 */

(function () {
  var promptTokensStr = context.getVariable("flow.prompt_tokens");
  var completionTokensStr = context.getVariable("flow.completion_tokens");
  var rawModel = (
    context.getVariable("flow.canonical_model") ||
    context.getVariable("flow.upstream_model") ||
    context.getVariable("flow.original_model") ||
    ""
  ).toLowerCase().trim();

  // Strip provider prefix (e.g. gcp/, aws/, azure/, us.anthropic., anthropic.) and @version suffix
  var model = rawModel
    .replace(/^(gcp|vertex_ai|vertex|aws|bedrock|azure|azure_ai|anthropic)\//, "")
    .replace(/^(us\.)?anthropic\./, "")
    .split("@")[0]
    .replace(/-202\d{5}-v\d+:\d+$/, "")
    .replace(/-v\d+:\d+$/, "");

  var promptTokens = parseInt(promptTokensStr, 10);
  var completionTokens = parseInt(completionTokensStr, 10);

  if (isNaN(promptTokens)) promptTokens = 0;
  if (isNaN(completionTokens)) completionTokens = 0;
  var totalTokens = promptTokens + completionTokens;

  // Rate card: [inputRatePerMillion, outputRatePerMillion] in USD
  var rateCards = {
    // Multi-Cloud Claude (GCP Vertex AI, AWS Bedrock, Azure AI Foundry)
    "claude-haiku-4-5": [1.00, 5.00],
    "claude-haiku-5-5": [0.10, 0.50],
    "claude-sonnet-4-6": [3.00, 15.00],

    // OpenAI
    "gpt-4o": [2.50, 10.00],
    "gpt-4o-mini": [0.15, 0.60],
    "o1": [15.00, 60.00],
    "o3-mini": [1.10, 4.40],

    // Anthropic Direct
    "claude-3-5-sonnet": [3.00, 15.00],
    "claude-3-5-sonnet-20241022": [3.00, 15.00],
    "claude-3-5-haiku": [0.80, 4.00],
    "claude-3-5-haiku-20241022": [0.80, 4.00],
    "claude-3-opus-20240229": [15.00, 75.00],

    // Google Gemini
    "gemini-2.0-flash": [0.10, 0.40],
    "gemini-2.0-flash-exp": [0.00, 0.00],
    "gemini-1.5-pro": [1.25, 5.00],
    "gemini-1.5-flash": [0.075, 0.30],

    // Qwen
    "qwen-plus": [0.11, 0.28],
    "qwen-max": [2.80, 8.40],
    "qwen-turbo": [0.04, 0.08],
    "qwen-2.5-72b-instruct": [0.50, 1.50],
    "qwen2.5-72b-instruct": [0.50, 1.50],
    "qwen-2.5-coder-32b-instruct": [0.25, 0.75],
    "qwen2.5-coder-32b-instruct": [0.25, 0.75],

    // GLM
    "glm-4-plus": [1.40, 1.40],
    "glm-4-air": [0.14, 0.14],
    "glm-4-flash": [0.00, 0.00]
  };

  var defaultRates = [1.00, 3.00];
  var rates = defaultRates;

  // Match model or model prefix
  if (rateCards[model]) {
    rates = rateCards[model];
  } else {
    for (var key in rateCards) {
      if (model.indexOf(key) === 0) {
        rates = rateCards[key];
        break;
      }
    }
  }

  var promptCost = (promptTokens / 1000000.0) * rates[0];
  var completionCost = (completionTokens / 1000000.0) * rates[1];
  var totalCost = promptCost + completionCost;

  context.setVariable("flow.total_tokens", String(totalTokens));
  context.setVariable("flow.cost_usd", totalCost.toFixed(6));
  context.setVariable("flow.prompt_cost_usd", promptCost.toFixed(6));
  context.setVariable("flow.completion_cost_usd", completionCost.toFixed(6));
})();
