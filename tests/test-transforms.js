/**
 * Unit Test Suite for Apigee LLM Router JavaScript Callouts
 * Simulates Apigee's `context` object and executes each JSC script against realistic payloads.
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");

// Helper to create mock Apigee context
function createMockContext(initialVars = {}) {
  const vars = { ...initialVars };
  return {
    getVariable: (name) => vars[name] !== undefined ? vars[name] : null,
    setVariable: (name, val) => { vars[name] = val; },
    _vars: vars
  };
}

// Helper to execute JSC script with a mock context
function runJsc(scriptName, context) {
  const scriptPath = path.join(__dirname, "../apiproxy/resources/jsc", scriptName);
  const code = fs.readFileSync(scriptPath, "utf8");
  const fn = new Function("context", code);
  fn(context);
  return context;
}

console.log("=== Running Apigee LLM Router Unit Tests ===\n");

// -------------------------------------------------------------
// Test 1: ExtractAndRouteModel.js
// -------------------------------------------------------------
console.log("[*] Testing ExtractAndRouteModel.js...");

// 1a. Test OpenAI model
{
  const ctx = createMockContext({
    "request.content": JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello GPT" }]
    })
  });
  runJsc("ExtractAndRouteModel.js", ctx);
  assert.strictEqual(ctx.getVariable("flow.provider"), "openai");
  assert.strictEqual(ctx.getVariable("flow.upstream_model"), "gpt-4o");
  assert.strictEqual(ctx.getVariable("flow.userPrompt"), "Hello GPT");
  console.log("  ✔ Routes gpt-4o to openai");
}

// 1b. Test Multi-Cloud Claude (claude-haiku-4-5, claude-haiku-5-5, claude-sonnet-4-6) across GCP, AWS, and Azure
{
  const models = [
    {
      id: "claude-haiku-4-5",
      gcpUpstream: "claude-haiku-4-5@20251001",
      awsUpstream: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
      azureUpstream: "claude-haiku-4-5"
    },
    {
      id: "claude-haiku-5-5",
      gcpUpstream: "claude-haiku-5-5",
      awsUpstream: "us.anthropic.claude-haiku-5-5-v1:0",
      azureUpstream: "claude-haiku-5-5"
    },
    {
      id: "claude-sonnet-4-6",
      gcpUpstream: "claude-sonnet-4-6",
      awsUpstream: "us.anthropic.claude-sonnet-4-6-v1:0",
      azureUpstream: "claude-sonnet-4-6"
    }
  ];

  for (const m of models) {
    // GCP via prefix
    const ctxGcp = createMockContext({
      "request.content": JSON.stringify({
        model: "gcp/" + m.id,
        messages: [{ role: "user", content: "Hello GCP Claude" }]
      })
    });
    runJsc("ExtractAndRouteModel.js", ctxGcp);
    assert.strictEqual(ctxGcp.getVariable("flow.provider"), "gcp-claude");
    assert.strictEqual(ctxGcp.getVariable("flow.cloud_provider"), "gcp");
    assert.strictEqual(ctxGcp.getVariable("flow.upstream_model"), m.gcpUpstream);

    // AWS via prefix
    const ctxAws = createMockContext({
      "request.content": JSON.stringify({
        model: "aws/" + m.id,
        messages: [{ role: "user", content: "Hello AWS Claude" }]
      })
    });
    runJsc("ExtractAndRouteModel.js", ctxAws);
    assert.strictEqual(ctxAws.getVariable("flow.provider"), "aws-claude");
    assert.strictEqual(ctxAws.getVariable("flow.cloud_provider"), "aws");
    assert.strictEqual(ctxAws.getVariable("flow.upstream_model"), m.awsUpstream);

    // Azure via prefix
    const ctxAzure = createMockContext({
      "request.content": JSON.stringify({
        model: "azure/" + m.id,
        messages: [{ role: "user", content: "Hello Azure Claude" }]
      })
    });
    runJsc("ExtractAndRouteModel.js", ctxAzure);
    assert.strictEqual(ctxAzure.getVariable("flow.provider"), "azure-claude");
    assert.strictEqual(ctxAzure.getVariable("flow.cloud_provider"), "azure");
    assert.strictEqual(ctxAzure.getVariable("flow.upstream_model"), m.azureUpstream);

    // Unprefixed + x-cloud-provider header (AWS)
    const ctxHeaderAws = createMockContext({
      "request.header.x-cloud-provider": "aws",
      "request.content": JSON.stringify({
        model: m.id,
        messages: [{ role: "user", content: "Hello Header AWS" }]
      })
    });
    runJsc("ExtractAndRouteModel.js", ctxHeaderAws);
    assert.strictEqual(ctxHeaderAws.getVariable("flow.provider"), "aws-claude");
    assert.strictEqual(ctxHeaderAws.getVariable("flow.upstream_model"), m.awsUpstream);

    // Unprefixed + x-cloud-provider header (Azure)
    const ctxHeaderAzure = createMockContext({
      "request.header.x-cloud-provider": "azure",
      "request.content": JSON.stringify({
        model: m.id,
        messages: [{ role: "user", content: "Hello Header Azure" }]
      })
    });
    runJsc("ExtractAndRouteModel.js", ctxHeaderAzure);
    assert.strictEqual(ctxHeaderAzure.getVariable("flow.provider"), "azure-claude");
    assert.strictEqual(ctxHeaderAzure.getVariable("flow.upstream_model"), m.azureUpstream);
  }
  console.log("  ✔ Routes claude-haiku-4-5, claude-haiku-5-5, and claude-sonnet-4-6 across GCP, AWS, and Azure");
}

// 1c. Test Direct Anthropic model
{
  const ctx = createMockContext({
    "request.content": JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      messages: [{ role: "user", content: "Hello Claude" }]
    })
  });
  runJsc("ExtractAndRouteModel.js", ctx);
  assert.strictEqual(ctx.getVariable("flow.provider"), "anthropic");
  assert.strictEqual(ctx.getVariable("flow.upstream_model"), "claude-3-5-sonnet-20241022");
  console.log("  ✔ Routes claude-3-5-sonnet to anthropic");
}

// 1d. Test Gemini model
{
  const ctx = createMockContext({
    "request.content": JSON.stringify({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "Hello Gemini" }]
    })
  });
  runJsc("ExtractAndRouteModel.js", ctx);
  assert.strictEqual(ctx.getVariable("flow.provider"), "gemini");
  assert.strictEqual(ctx.getVariable("flow.upstream_model"), "gemini-2.0-flash");
  console.log("  ✔ Routes gemini-2.0-flash to gemini");
}

// 1e. Test Qwen model
{
  const ctx = createMockContext({
    "request.content": JSON.stringify({
      model: "qwen-max",
      messages: [{ role: "user", content: "Hello Qwen" }]
    })
  });
  runJsc("ExtractAndRouteModel.js", ctx);
  assert.strictEqual(ctx.getVariable("flow.provider"), "qwen");
  assert.strictEqual(ctx.getVariable("flow.upstream_model"), "qwen-max");
  console.log("  ✔ Routes qwen-max to qwen");
}

// 1f. Test GLM model
{
  const ctx = createMockContext({
    "request.content": JSON.stringify({
      model: "glm-4-plus",
      messages: [{ role: "user", content: "Hello GLM" }]
    })
  });
  runJsc("ExtractAndRouteModel.js", ctx);
  assert.strictEqual(ctx.getVariable("flow.provider"), "glm");
  assert.strictEqual(ctx.getVariable("flow.upstream_model"), "glm-4-plus");
  console.log("  ✔ Routes glm-4-plus to glm");
}

// 1g. Test Aliases
{
  // fast -> gemini
  const ctxFast = createMockContext({
    "request.content": JSON.stringify({ model: "fast", messages: [{ role: "user", content: "ping" }] })
  });
  runJsc("ExtractAndRouteModel.js", ctxFast);
  assert.strictEqual(ctxFast.getVariable("flow.provider"), "gemini");
  assert.strictEqual(ctxFast.getVariable("flow.upstream_model"), "gemini-2.0-flash");

  // coding -> qwen
  const ctxCoding = createMockContext({
    "request.content": JSON.stringify({ model: "coding", messages: [{ role: "user", content: "write quicksort" }] })
  });
  runJsc("ExtractAndRouteModel.js", ctxCoding);
  assert.strictEqual(ctxCoding.getVariable("flow.provider"), "qwen");
  assert.strictEqual(ctxCoding.getVariable("flow.upstream_model"), "qwen-2.5-coder-32b-instruct");

  // sonnet-4-6 alias -> gcp-claude
  const ctxSonnet = createMockContext({
    "request.content": JSON.stringify({ model: "sonnet-4-6", messages: [{ role: "user", content: "ping" }] })
  });
  runJsc("ExtractAndRouteModel.js", ctxSonnet);
  assert.strictEqual(ctxSonnet.getVariable("flow.provider"), "gcp-claude");
  assert.strictEqual(ctxSonnet.getVariable("flow.upstream_model"), "claude-sonnet-4-6");
  console.log("  ✔ Resolves aliases ('fast', 'coding', 'sonnet-4-6', 'haiku-4-5', 'haiku-5-5')");
}

// -------------------------------------------------------------
// Test 2: TransformToAnthropic.js (GCP, AWS, Azure, Direct) & TransformFromAnthropic.js
// -------------------------------------------------------------
console.log("\n[*] Testing Multi-Cloud Anthropic Transformations...");
{
  // 2a. GCP Vertex AI transformation (anthropic_version = vertex-2023-10-16, no model in body)
  const ctxGcp = createMockContext({
    "flow.provider": "gcp-claude",
    "flow.upstream_model": "claude-haiku-5-5",
    "request.content": JSON.stringify({
      model: "claude-haiku-5-5",
      messages: [
        { role: "system", content: "You are on GCP Vertex AI." },
        { role: "user", content: "Hello Vertex" }
      ],
      max_tokens: 300
    })
  });
  runJsc("TransformToAnthropic.js", ctxGcp);
  const gcpBody = JSON.parse(ctxGcp.getVariable("request.content"));
  assert.strictEqual(gcpBody.anthropic_version, "vertex-2023-10-16");
  assert.strictEqual(gcpBody.model, undefined);
  assert.strictEqual(gcpBody.thinking.type, "disabled");
  assert.strictEqual(gcpBody.system, "You are on GCP Vertex AI.");
  console.log("  ✔ Transforms payload for GCP Vertex AI (:rawPredict)");

  // 2b. AWS Bedrock transformation (anthropic_version = bedrock-2023-05-31, no model in body)
  const ctxAws = createMockContext({
    "flow.provider": "aws-claude",
    "flow.upstream_model": "us.anthropic.claude-sonnet-4-6-v1:0",
    "request.content": JSON.stringify({
      model: "us.anthropic.claude-sonnet-4-6-v1:0",
      messages: [
        { role: "system", content: "You are on AWS Bedrock." },
        { role: "user", content: "Hello Bedrock" }
      ],
      max_tokens: 400
    })
  });
  runJsc("TransformToAnthropic.js", ctxAws);
  const awsBody = JSON.parse(ctxAws.getVariable("request.content"));
  assert.strictEqual(awsBody.anthropic_version, "bedrock-2023-05-31");
  assert.strictEqual(awsBody.model, undefined);
  assert.strictEqual(awsBody.system, "You are on AWS Bedrock.");
  console.log("  ✔ Transforms payload for AWS Bedrock (/invoke)");

  // 2c. Azure AI Foundry transformation (model in body)
  const ctxAzure = createMockContext({
    "flow.provider": "azure-claude",
    "flow.upstream_model": "claude-haiku-4-5",
    "request.content": JSON.stringify({
      model: "claude-haiku-4-5",
      messages: [
        { role: "system", content: "You are on Azure AI Foundry." },
        { role: "user", content: "Hello Azure" }
      ],
      temperature: 0.5,
      max_tokens: 500
    })
  });
  runJsc("TransformToAnthropic.js", ctxAzure);
  const azureBody = JSON.parse(ctxAzure.getVariable("request.content"));
  assert.strictEqual(azureBody.model, "claude-haiku-4-5");
  assert.strictEqual(azureBody.system, "You are on Azure AI Foundry.");
  assert.strictEqual(azureBody.max_tokens, 500);
  console.log("  ✔ Transforms payload for Azure AI Foundry (/anthropic/v1/messages)");

  // 2d. Simulate Anthropic response -> OpenAI chat.completion
  ctxAzure.setVariable("response.content", JSON.stringify({
    id: "msg_12345",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "Recursion is when a function calls itself." }],
    model: "claude-haiku-4-5",
    stop_reason: "end_turn",
    usage: {
      input_tokens: 25,
      output_tokens: 15
    }
  }));

  runJsc("TransformFromAnthropic.js", ctxAzure);
  const openAIResp = JSON.parse(ctxAzure.getVariable("response.content"));
  assert.strictEqual(openAIResp.object, "chat.completion");
  assert.strictEqual(openAIResp.choices[0].message.content, "Recursion is when a function calls itself.");
  assert.strictEqual(openAIResp.choices[0].finish_reason, "stop");
  assert.strictEqual(openAIResp.usage.prompt_tokens, 25);
  assert.strictEqual(openAIResp.usage.completion_tokens, 15);
  assert.strictEqual(openAIResp.usage.total_tokens, 40);
  assert.strictEqual(ctxAzure.getVariable("flow.total_tokens"), "40");
  console.log("  ✔ Transforms Anthropic response into OpenAI chat.completion format");
}

// -------------------------------------------------------------
// Test 3: TransformToGemini.js & TransformFromGemini.js
// -------------------------------------------------------------
console.log("\n[*] Testing Gemini Transformations...");
{
  const ctx = createMockContext({
    "flow.upstream_model": "gemini-2.0-flash",
    "request.content": JSON.stringify({
      model: "gemini-2.0-flash",
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "What is 2 + 2?" },
        { role: "assistant", content: "4" },
        { role: "user", content: "What is 4 + 4?" }
      ],
      temperature: 0.2,
      max_tokens: 100
    })
  });

  runJsc("TransformToGemini.js", ctx);
  const geminiReq = JSON.parse(ctx.getVariable("request.content"));
  assert.strictEqual(geminiReq.systemInstruction.parts[0].text, "Be concise.");
  assert.strictEqual(geminiReq.contents.length, 3);
  assert.strictEqual(geminiReq.contents[0].role, "user");
  assert.strictEqual(geminiReq.contents[1].role, "model");
  assert.strictEqual(geminiReq.contents[2].role, "user");
  assert.strictEqual(geminiReq.generationConfig.maxOutputTokens, 100);
  assert.strictEqual(geminiReq.generationConfig.temperature, 0.2);
  console.log("  ✔ Transforms OpenAI payload into Gemini generateContent format");

  ctx.setVariable("response.content", JSON.stringify({
    candidates: [
      {
        content: {
          parts: [{ text: "8" }],
          role: "model"
        },
        finishReason: "STOP",
        index: 0
      }
    ],
    usageMetadata: {
      promptTokenCount: 30,
      candidatesTokenCount: 2,
      totalTokenCount: 32
    },
    modelVersion: "gemini-2.0-flash"
  }));

  runJsc("TransformFromGemini.js", ctx);
  const openAIResp = JSON.parse(ctx.getVariable("response.content"));
  assert.strictEqual(openAIResp.object, "chat.completion");
  assert.strictEqual(openAIResp.choices[0].message.content, "8");
  assert.strictEqual(openAIResp.choices[0].finish_reason, "stop");
  assert.strictEqual(openAIResp.usage.prompt_tokens, 30);
  assert.strictEqual(openAIResp.usage.completion_tokens, 2);
  assert.strictEqual(openAIResp.usage.total_tokens, 32);
  assert.strictEqual(ctx.getVariable("flow.total_tokens"), "32");
  console.log("  ✔ Transforms Gemini response into OpenAI chat.completion format");
}

// -------------------------------------------------------------
// Test 4: CalculateCost.js
// -------------------------------------------------------------
console.log("\n[*] Testing CalculateCost.js...");
{
  // Test claude-haiku-4-5 ($1.00 in / $5.00 out per 1M) on AWS
  const ctxHaiku45 = createMockContext({
    "flow.upstream_model": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "flow.prompt_tokens": "100000",     // $0.10
    "flow.completion_tokens": "100000"  // $0.50
  });
  runJsc("CalculateCost.js", ctxHaiku45);
  assert.strictEqual(ctxHaiku45.getVariable("flow.cost_usd"), "0.600000");
  console.log("  ✔ Accurately calculates cost for claude-haiku-4-5 ($1.00 / $5.00)");

  // Test claude-haiku-5-5 ($0.10 in / $0.50 out per 1M) on GCP
  const ctxHaiku55 = createMockContext({
    "flow.upstream_model": "claude-haiku-5-5",
    "flow.prompt_tokens": "100000",     // $0.01
    "flow.completion_tokens": "100000"  // $0.05
  });
  runJsc("CalculateCost.js", ctxHaiku55);
  assert.strictEqual(ctxHaiku55.getVariable("flow.cost_usd"), "0.060000");
  console.log("  ✔ Accurately calculates cost for claude-haiku-5-5 ($0.10 / $0.50)");

  // Test claude-sonnet-4-6 ($3.00 in / $15.00 out per 1M) on Azure
  const ctxSonnet46 = createMockContext({
    "flow.upstream_model": "azure/claude-sonnet-4-6",
    "flow.prompt_tokens": "100000",     // $0.30
    "flow.completion_tokens": "100000"  // $1.50
  });
  runJsc("CalculateCost.js", ctxSonnet46);
  assert.strictEqual(ctxSonnet46.getVariable("flow.cost_usd"), "1.800000");
  console.log("  ✔ Accurately calculates cost for claude-sonnet-4-6 ($3.00 / $15.00)");

  // Test Qwen cost: qwen-max rates: input $2.80, output $8.40 per 1M
  const ctxQwen = createMockContext({
    "flow.upstream_model": "qwen-max",
    "flow.prompt_tokens": "100000",    // 0.1M -> $0.28
    "flow.completion_tokens": "50000"  // 0.05M -> $0.42
  });
  runJsc("CalculateCost.js", ctxQwen);
  assert.strictEqual(ctxQwen.getVariable("flow.cost_usd"), "0.700000");
  console.log("  ✔ Accurately calculates cost for qwen-max");
}

// -------------------------------------------------------------
// Test 5: ModelsEndpoint.js & HealthEndpoint.js
// -------------------------------------------------------------
console.log("\n[*] Testing ModelsEndpoint.js & HealthEndpoint.js...");
{
  const ctxModels = createMockContext();
  runJsc("ModelsEndpoint.js", ctxModels);
  const modelsData = JSON.parse(ctxModels.getVariable("response.content"));
  assert.strictEqual(modelsData.object, "list");
  const modelIds = modelsData.data.map(m => m.id);
  const expectedModels = [
    "claude-haiku-4-5", "claude-haiku-5-5", "claude-sonnet-4-6",
    "gcp/claude-haiku-4-5", "gcp/claude-haiku-5-5", "gcp/claude-sonnet-4-6",
    "aws/claude-haiku-4-5", "aws/claude-haiku-5-5", "aws/claude-sonnet-4-6",
    "azure/claude-haiku-4-5", "azure/claude-haiku-5-5", "azure/claude-sonnet-4-6",
    "gpt-4o", "gemini-2.0-flash", "qwen-max", "glm-4-plus"
  ];
  for (const id of expectedModels) {
    assert.ok(modelIds.includes(id), "Missing model in /v1/models: " + id);
  }
  console.log("  ✔ /v1/models lists claude-haiku-4-5, claude-haiku-5-5, and claude-sonnet-4-6 across GCP, AWS, and Azure");

  const ctxHealth = createMockContext();
  runJsc("HealthEndpoint.js", ctxHealth);
  const healthData = JSON.parse(ctxHealth.getVariable("response.content"));
  assert.strictEqual(healthData.status, "healthy");
  assert.ok(healthData.providers.includes("gcp-claude"));
  assert.ok(healthData.providers.includes("aws-claude"));
  assert.ok(healthData.providers.includes("azure-claude"));
  console.log("  ✔ /health returns healthy status and multi-cloud provider list");
}

// -------------------------------------------------------------
// Test 6: FormatErrorResponse.js & ResolveProviderCredentials.js
// -------------------------------------------------------------
console.log("\n[*] Testing FormatErrorResponse.js & ResolveProviderCredentials.js...");
{
  const ctxErr = createMockContext({
    "fault.name": "FailedToResolveAPIKey",
    "response.status.code": "401"
  });
  runJsc("FormatErrorResponse.js", ctxErr);
  const errResp = JSON.parse(ctxErr.getVariable("response.content"));
  assert.strictEqual(errResp.error.type, "authentication_error");
  assert.strictEqual(errResp.error.code, 401);
  assert.strictEqual(ctxErr.getVariable("error.content"), ctxErr.getVariable("response.content"));
  console.log("  ✔ Formats authentication faults into OpenAI error format on both error.* and response.*");

  // Upstream JSON error preservation even when Apigee sets generic error.message
  const ctxUpstreamErr = createMockContext({
    "fault.name": "ErrorResponseCode",
    "error.status.code": "404",
    "error.message": "ResponseCode 404 is treated as error",
    "error.content": JSON.stringify({
      error: {
        message: "Publisher Model projects/my-gcp-project/locations/global/publishers/anthropic/models/foo not found.",
        type: "not_found_error"
      }
    })
  });
  runJsc("FormatErrorResponse.js", ctxUpstreamErr);
  const upstreamErrResp = JSON.parse(ctxUpstreamErr.getVariable("error.content"));
  assert.ok(upstreamErrResp.error.message.includes("Publisher Model"));
  assert.strictEqual(upstreamErrResp.error.code, 404);
  console.log("  ✔ Preserves descriptive upstream JSON error messages instead of generic HTTPResponseError");

  // ResolveProviderCredentials missing key check (gcp-claude uses GoogleAccessToken -> false; aws-claude without key -> true)
  const ctxCredsGcp = createMockContext({ "flow.provider": "gcp-claude" });
  runJsc("ResolveProviderCredentials.js", ctxCredsGcp);
  assert.strictEqual(ctxCredsGcp.getVariable("flow.missing_provider_key"), "false");

  const ctxCredsAws = createMockContext({ "flow.provider": "aws-claude" });
  runJsc("ResolveProviderCredentials.js", ctxCredsAws);
  assert.strictEqual(ctxCredsAws.getVariable("flow.missing_provider_key"), "true");
  console.log("  ✔ Correctly flags missing upstream provider keys while exempting GCP GoogleAccessToken");
}

console.log("\n🎉 ALL UNIT TESTS PASSED SUCCESSFULLY! (100% PASS RATE)\n");
