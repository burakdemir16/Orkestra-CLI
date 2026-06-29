import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listKnownApiProviderIds, loadApiProviderAgents, loadApiProviderConfigs } from "./apiProviders";

describe("apiProviders", () => {
  it("loads env-configured OpenAI-compatible and Ollama agents", () => {
    const env = {
      ORKESTRA_API_PROVIDERS: "openrouter-planner,ollama-reviewer",
      ORKESTRA_API_PROVIDER_OPENROUTER_PLANNER_PROVIDER: "openrouter",
      ORKESTRA_API_PROVIDER_OPENROUTER_PLANNER_ROLE: "planner",
      ORKESTRA_API_PROVIDER_OPENROUTER_PLANNER_MODEL: "openai/gpt-4o-mini",
      ORKESTRA_API_PROVIDER_OPENROUTER_PLANNER_API_KEY: "or-key",
      ORKESTRA_API_PROVIDER_OLLAMA_REVIEWER_PROVIDER: "ollama",
      ORKESTRA_API_PROVIDER_OLLAMA_REVIEWER_ROLE: "reviewer",
      ORKESTRA_API_PROVIDER_OLLAMA_REVIEWER_MODEL: "llama3.1"
    };

    const configs = loadApiProviderConfigs(env);
    assert.equal(configs.length, 2);
    assert.equal(configs[0].id, "openrouter-planner");
    assert.equal(configs[0].kind, "openai-compatible");
    assert.equal(configs[0].apiBase, "https://openrouter.ai/api/v1");
    assert.equal(configs[0].apiKey, "or-key");
    assert.equal(configs[1].kind, "ollama");
    assert.equal(configs[1].apiBase, "http://127.0.0.1:11434");

    const agents = loadApiProviderAgents(env);
    assert.deepEqual(
      agents.map((agent) => [agent.id, agent.role, agent.command]),
      [
        ["api-openrouter-planner", "planner", "api:openrouter-planner"],
        ["api-ollama-reviewer", "reviewer", "api:ollama-reviewer"]
      ]
    );
  });

  it("falls back to provider-specific API key env vars", () => {
    const configs = loadApiProviderConfigs({
      ORKESTRA_API_PROVIDERS: "groq-builder",
      ORKESTRA_API_PROVIDER_GROQ_BUILDER_PROVIDER: "groq",
      ORKESTRA_API_PROVIDER_GROQ_BUILDER_MODEL: "llama-3.1-70b-versatile",
      GROQ_API_KEY: "groq-key"
    });

    assert.equal(configs[0].apiKey, "groq-key");
    assert.equal(configs[0].apiBase, "https://api.groq.com/openai/v1");
  });

  it("exposes Continue-style provider shortcuts", () => {
    const known = listKnownApiProviderIds();
    for (const id of ["anthropic", "gemini", "openai", "openrouter", "mistral", "groq", "ollama", "xai"]) {
      assert.ok(known.includes(id), `${id} should be a known provider`);
    }
  });
});
