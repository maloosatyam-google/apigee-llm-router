/**
 * HealthEndpoint.js
 * Generates JSON health response for /health and /v1/health endpoints.
 */

(function () {
  var health = {
    status: "healthy",
    service: "apigee-llm-router",
    version: "1.2.0",
    timestamp: new Date().toISOString(),
    providers: [
      "openai",
      "anthropic",
      "gcp-claude",
      "aws-claude",
      "azure-claude",
      "gemini",
      "qwen",
      "glm"
    ],
    clouds: ["gcp", "aws", "azure"],
    features: [
      "openai_compat_v1",
      "multicloud_claude_routing",
      "model_aliasing",
      "rate_limiting",
      "token_metering",
      "cost_calculation",
      "error_standardization"
    ]
  };

  context.setVariable("response.content", JSON.stringify(health));
  context.setVariable("response.header.Content-Type", "application/json");
  context.setVariable("response.status.code", 200);
})();
