/**
 * TransformToGemini.js
 * Translates an OpenAI Chat Completion request into Google Gemini generateContent schema.
 * Target API: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 */

(function () {
  var reqContent = context.getVariable("request.content") || "";
  if (!reqContent) {
    return;
  }

  try {
    var openAIPayload = JSON.parse(reqContent);
    var rawMessages = openAIPayload.messages || [];

    var systemParts = [];
    var rawContents = [];

    // 1. Separate system/developer prompt and chat messages
    for (var i = 0; i < rawMessages.length; i++) {
      var msg = rawMessages[i];
      if (!msg) continue;

      if (msg.role === "system" || msg.role === "developer") {
        if (typeof msg.content === "string") {
          systemParts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
          for (var s = 0; s < msg.content.length; s++) {
            if (msg.content[s] && msg.content[s].text) {
              systemParts.push({ text: msg.content[s].text });
            }
          }
        }
      } else {
        // Map OpenAI role to Gemini role: "user" -> "user", "assistant" -> "model"
        var geminiRole = msg.role === "assistant" ? "model" : "user";
        var parts = [];

        if (typeof msg.content === "string") {
          parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
          for (var c = 0; c < msg.content.length; c++) {
            var item = msg.content[c];
            if (item.type === "text") {
              parts.push({ text: item.text });
            } else if (item.type === "image_url" && item.image_url) {
              var url = item.image_url.url || "";
              if (url.indexOf("data:") === 0) {
                var urlParts = url.split(",");
                var meta = urlParts[0];
                var data = urlParts[1];
                var mimeType = "image/jpeg";
                var match = meta.match(/data:([^;]+);/);
                if (match && match[1]) {
                  mimeType = match[1];
                }
                parts.push({
                  inlineData: {
                    mimeType: mimeType,
                    data: data
                  }
                });
              } else {
                parts.push({ text: "[Image URL: " + url + "]" });
              }
            }
          }
        }

        if (parts.length === 0) {
          parts.push({ text: "" });
        }

        rawContents.push({
          role: geminiRole,
          parts: parts
        });
      }
    }

    // 2. Merge consecutive messages with the same Gemini role so multi-turn alternation is strictly respected
    var contents = [];
    for (var m = 0; m < rawContents.length; m++) {
      var current = rawContents[m];
      if (contents.length === 0) {
        if (current.role === "model") {
          contents.push({ role: "user", parts: [{ text: "Continue" }] });
        }
        contents.push(current);
      } else {
        var prev = contents[contents.length - 1];
        if (prev.role === current.role) {
          prev.parts = prev.parts.concat(current.parts);
        } else {
          contents.push(current);
        }
      }
    }

    if (contents.length === 0) {
      contents.push({
        role: "user",
        parts: [{ text: "Hello" }]
      });
    }

    // 3. Build Gemini payload
    var geminiPayload = {
      contents: contents
    };

    if (systemParts.length > 0) {
      geminiPayload.systemInstruction = {
        parts: systemParts
      };
    }

    var generationConfig = {};
    var hasGenConfig = false;

    if (openAIPayload.temperature !== undefined && openAIPayload.temperature !== null) {
      generationConfig.temperature = Number(openAIPayload.temperature);
      hasGenConfig = true;
    }
    if (openAIPayload.top_p !== undefined && openAIPayload.top_p !== null) {
      generationConfig.topP = Number(openAIPayload.top_p);
      hasGenConfig = true;
    }
    var maxTokens = openAIPayload.max_tokens !== undefined ? openAIPayload.max_tokens : openAIPayload.max_completion_tokens;
    if (maxTokens !== undefined && maxTokens !== null) {
      generationConfig.maxOutputTokens = Number(maxTokens);
      hasGenConfig = true;
    }
    if (openAIPayload.stop) {
      if (Array.isArray(openAIPayload.stop)) {
        generationConfig.stopSequences = openAIPayload.stop;
        hasGenConfig = true;
      } else if (typeof openAIPayload.stop === "string") {
        generationConfig.stopSequences = [openAIPayload.stop];
        hasGenConfig = true;
      }
    }

    if (hasGenConfig) {
      geminiPayload.generationConfig = generationConfig;
    }

    context.setVariable("request.content", JSON.stringify(geminiPayload));
  } catch (e) {
    context.setVariable("flow.transform_error", e.message);
  }
})();
