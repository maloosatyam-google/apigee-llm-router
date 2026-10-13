/**
 * FormatErrorResponse.js
 * Formats any fault or error condition into standard OpenAI JSON error envelope:
 * { "error": { "message": "...", "type": "...", "param": null, "code": ... } }
 * Preserves descriptive upstream or RaiseFault error messages when present.
 */

(function () {
  var faultName = context.getVariable("fault.name") || "";
  var statusCode = (
    context.getVariable("error.status.code") ||
    context.getVariable("response.status.code") ||
    context.getVariable("message.status.code") ||
    500
  );
  statusCode = parseInt(statusCode, 10);
  if (isNaN(statusCode) || statusCode < 400) {
    statusCode = 500;
  }

  // Extract descriptive message from upstream / fault JSON payload if available
  var rawBody = context.getVariable("error.content") || context.getVariable("response.content") || "";
  var bodyMessage = "";
  var bodyType = "";
  var bodyParam = null;

  if (rawBody) {
    try {
      var parsed = JSON.parse(rawBody);
      if (parsed && parsed.error) {
        if (typeof parsed.error === "string") {
          bodyMessage = parsed.error;
        } else if (typeof parsed.error === "object") {
          bodyMessage = parsed.error.message || "";
          bodyType = parsed.error.type || "";
          if (parsed.error.param !== undefined) {
            bodyParam = parsed.error.param;
          }
        }
      } else if (parsed && parsed.message) {
        bodyMessage = parsed.message;
      }
    } catch (e) {
      // Non-JSON error body; ignore
    }
  }

  var rawFaultMsg = context.getVariable("flow.error_message") || context.getVariable("error.message") || "";
  // Ignore generic Apigee target fault strings when we have a real upstream message
  if (/^ResponseCode \d+ is treated as error/i.test(rawFaultMsg) || /^HTTPResponseError$/i.test(rawFaultMsg)) {
    rawFaultMsg = "";
  }

  var message = bodyMessage || rawFaultMsg;
  var errType = bodyType || "api_error";

  if (faultName === "FailedToResolveAPIKey" || faultName === "InvalidApiKey" || faultName === "InvalidApiKeyForGivenResource" || statusCode === 401) {
    errType = "authentication_error";
    statusCode = 401;
    if (!message) message = "Incorrect API key provided or unauthorized request.";
  } else if (faultName === "SpikeArrestViolation" || faultName === "QuotaViolation" || statusCode === 429) {
    errType = "rate_limit_error";
    statusCode = 429;
    if (!message) message = "You have exceeded your request rate limit or token quota.";
  } else if (statusCode === 400) {
    if (!bodyType) errType = "invalid_request_error";
    if (!message) message = "Invalid request payload or unsupported model.";
  } else if (statusCode === 404) {
    if (!bodyType) errType = "invalid_request_error";
    if (!message) message = "The requested endpoint or model does not exist.";
  } else {
    if (!message) message = "An error occurred while processing your request through Apigee LLM Router.";
  }

  var openAIErr = {
    error: {
      message: message,
      type: errType,
      param: bodyParam,
      code: statusCode
    }
  };

  var serialized = JSON.stringify(openAIErr);
  context.setVariable("error.content", serialized);
  context.setVariable("error.header.Content-Type", "application/json");
  context.setVariable("error.status.code", statusCode);

  context.setVariable("response.content", serialized);
  context.setVariable("response.header.Content-Type", "application/json");
  context.setVariable("response.status.code", statusCode);
})();
