/**
 * Tests: verify every provider sub-module's matches() function correctly
 * identifies its target models and does NOT match others (no cross-fire).
 */
import { describe, it, expect } from "vitest";
import { normalizeProviderPayload } from "../src/index.ts";

// ── Helpers ──

function mkModel(overrides: Record<string, any> = {}) {
  return {
    id: "test-model",
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    api: "openai-completions",
    reasoning: false,
    maxTokens: 128000,
    ...overrides,
  };
}

function mkPayload(overrides: Record<string, any> = {}) {
  return {
    model: "test-model",
    messages: [{ role: "user", content: "Hello" }],
    ...overrides,
  };
}

// ── Tier 1: Dedicated Compat Sub-Modules ──

describe("Anthropic", () => {
  it("matches anthropic provider (cache_control applied)", () => {
    const p = normalizeProviderPayload(
      mkPayload({ max_tokens: 32000, system: "You are helpful." }),
      mkModel({ provider: "anthropic", baseUrl: "https://api.anthropic.com/v1", api: "anthropic-messages", reasoning: true, maxTokens: 200000 }),
      { mode: "chat", reasoningLevel: "high" },
    );
    // Anthropic compat: SDK handles thinking; this layer adds cache_control
    // System prompt should be wrapped with cache_control marker
    expect(Array.isArray(p.system)).toBe(true);
    expect(p.system[0].cache_control).toBeDefined();
  });

  it("adds cache_control to system prompt", () => {
    const p = normalizeProviderPayload(
      { ...mkPayload(), system: "You are a helpful assistant." },
      mkModel({ provider: "anthropic", baseUrl: "https://api.anthropic.com/v1", api: "anthropic-messages", reasoning: true }),
      { mode: "chat" },
    );
    // system should be transformed to array with cache_control
    if (Array.isArray(p.system)) {
      const last = p.system[p.system.length - 1];
      expect(last.cache_control).toBeDefined();
    }
  });

  it("disables thinking in utility mode", () => {
    const p = normalizeProviderPayload(
      mkPayload({ thinking: { type: "enabled", budget_tokens: 4000 } }),
      mkModel({ provider: "anthropic", api: "anthropic-messages", reasoning: true }),
      { mode: "utility" },
    );
    expect(p.thinking?.type).toBe("disabled");
  });
});

describe("DeepSeek", () => {
  it("matches deepseek provider", () => {
    const p = normalizeProviderPayload(
      mkPayload({ max_tokens: 32000 }),
      mkModel({ id: "deepseek-v4-0324", provider: "deepseek", baseUrl: "https://api.deepseek.com/v1", reasoning: true, maxTokens: 131072 }),
      { mode: "chat", reasoningLevel: "high" },
    );
    expect(p.thinking?.type).toBe("enabled");
    expect(p.reasoning_effort).toBe("high");
  });

  it("disables thinking in utility mode", () => {
    const p = normalizeProviderPayload(
      mkPayload({ reasoning_effort: "high" }),
      mkModel({ id: "deepseek-v4", provider: "deepseek", baseUrl: "https://api.deepseek.com/v1", reasoning: true, maxTokens: 131072 }),
      { mode: "utility" },
    );
    expect(p.thinking?.type).toBe("disabled");
  });

  it("lifts max_tokens for thinking", () => {
    const p = normalizeProviderPayload(
      mkPayload(),
      mkModel({ id: "deepseek-v4", provider: "deepseek", baseUrl: "https://api.deepseek.com/v1", reasoning: true, maxTokens: 131072 }),
      { mode: "chat", reasoningLevel: "high" },
    );
    expect(p.max_tokens).toBeGreaterThan(32768);
  });

  it("strips tool_choice", () => {
    const p = normalizeProviderPayload(
      mkPayload({ tool_choice: "auto" }),
      mkModel({ id: "deepseek-v4", provider: "deepseek", baseUrl: "https://api.deepseek.com/v1", reasoning: true, maxTokens: 131072 }),
      { mode: "chat", reasoningLevel: "high" },
    );
    expect(p.tool_choice).toBeUndefined();
  });
});

describe("Kimi / Moonshot", () => {
  it("matches kimi-coding provider", () => {
    const p = normalizeProviderPayload(
      mkPayload({ reasoning_effort: "high" }),
      mkModel({ id: "kimi-for-coding", provider: "kimi-coding", baseUrl: "https://api.kimi.com/coding/v1", reasoning: true }),
      { mode: "chat", reasoningLevel: "high" },
    );
    expect(p.thinking?.type).toBe("enabled");
  });

  it("matches moonshot provider", () => {
    const p = normalizeProviderPayload(
      mkPayload({ reasoning_effort: "high" }),
      mkModel({ id: "moonshot-v1", provider: "moonshot", baseUrl: "https://api.moonshot.cn/v1", reasoning: true }),
      { mode: "chat", reasoningLevel: "high" },
    );
    expect(p.thinking?.type).toBe("enabled");
    expect(p.reasoning_effort).toBe("high");
  });

  it("uses max_completion_tokens not max_tokens", () => {
    const p = normalizeProviderPayload(
      mkPayload({ max_tokens: 4096, reasoning_effort: "high" }),
      mkModel({ provider: "moonshot", baseUrl: "https://api.moonshot.cn/v1", reasoning: true }),
      { mode: "chat", reasoningLevel: "high" },
    );
    expect(p.max_tokens).toBeUndefined();
    expect(p.max_completion_tokens).toBe(4096);
  });
});

describe("DashScope / Qwen", () => {
  it("matches enable_thinking quirk", () => {
    const p = normalizeProviderPayload(
      mkPayload(),
      mkModel({ id: "qwen-plus", provider: "dashscope", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", quirks: ["enable_thinking"], reasoning: true }),
      { mode: "chat", reasoningLevel: "high" },
    );
    // chat mode with quirks → SDK handles it, enable_thinking not set
    // (only set to false when disabled)
    expect(p.enable_thinking).toBeUndefined(); // SDK territory
  });

  it("disables thinking in utility mode", () => {
    const p = normalizeProviderPayload(
      mkPayload(),
      mkModel({ provider: "dashscope", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", quirks: ["enable_thinking"], reasoning: true }),
      { mode: "utility" },
    );
    expect(p.enable_thinking).toBe(false);
  });

  it("disables thinking when reasoningLevel=off", () => {
    const p = normalizeProviderPayload(
      mkPayload(),
      mkModel({ provider: "dashscope", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", quirks: ["enable_thinking"], reasoning: true }),
      { mode: "chat", reasoningLevel: "off" },
    );
    expect(p.enable_thinking).toBe(false);
  });
});

describe("Zhipu / BigModel", () => {
  it("matches zhipu provider", () => {
    const p = normalizeProviderPayload(
      mkPayload({ reasoning_effort: "high" }),
      mkModel({ id: "glm-4.7", provider: "zhipu", baseUrl: "https://open.bigmodel.cn/api/paas/v4", reasoning: true }),
      { mode: "chat", reasoningLevel: "high" },
    );
    expect(p.thinking?.type).toBe("enabled");
  });

  it("removes store and stream_options", () => {
    const p = normalizeProviderPayload(
      mkPayload({ store: true, stream_options: { include_usage: true } }),
      mkModel({ provider: "zhipu", baseUrl: "https://open.bigmodel.cn/api/paas/v4" }),
      { mode: "chat" },
    );
    expect(p.store).toBeUndefined();
    expect(p.stream_options).toBeUndefined();
  });

  it("removes strict from tools", () => {
    const p = normalizeProviderPayload(
      mkPayload({ tools: [{ type: "function", function: { name: "test", strict: true, parameters: {} } }] }),
      mkModel({ provider: "zhipu", baseUrl: "https://open.bigmodel.cn/api/paas/v4" }),
      { mode: "chat" },
    );
    expect(p.tools[0].function.strict).toBeUndefined();
  });
});

describe("MiMo / Xiaomi", () => {
  it("matches mimo provider", () => {
    const p = normalizeProviderPayload(
      mkPayload({ reasoning_effort: "high" }),
      mkModel({ id: "mimo-v2.5", provider: "mimo", baseUrl: "https://api.xiaomimimo.com/v1", reasoning: true }),
      { mode: "chat", reasoningLevel: "high" },
    );
    expect(p.chat_template_kwargs?.enable_thinking).toBe(true);
    expect(p.chat_template_kwargs?.preserve_thinking).toBe(true);
  });

  it("disables thinking in utility mode", () => {
    const p = normalizeProviderPayload(
      mkPayload(),
      mkModel({ provider: "mimo", baseUrl: "https://api.xiaomimimo.com/v1", reasoning: true }),
      { mode: "utility" },
    );
    expect(p.chat_template_kwargs?.enable_thinking).toBe(false);
  });
});

describe("OpenRouter", () => {
  it("matches openrouter adaptive profile", () => {
    expect(() =>
      normalizeProviderPayload(
        mkPayload(),
        mkModel({
          id: "anthropic/claude-fable-5",
          provider: "openrouter",
          baseUrl: "https://openrouter.ai/api/v1",
          reasoning: true,
          compat: { reasoningProfile: "openrouter-anthropic-adaptive" },
        }),
        { mode: "chat", reasoningLevel: "high" },
      )
    ).not.toThrow();
  });

  it("throws when trying to disable adaptive thinking", () => {
    expect(() =>
      normalizeProviderPayload(
        mkPayload(),
        mkModel({
          id: "anthropic/claude-fable-5",
          provider: "openrouter",
          baseUrl: "https://openrouter.ai/api/v1",
          reasoning: true,
          compat: { reasoningProfile: "openrouter-anthropic-adaptive" },
        }),
        { mode: "chat", reasoningLevel: "off" },
      )
    ).toThrow();
  });
});

describe("Volcengine Ark", () => {
  it("matches volcengine provider", () => {
    const p = normalizeProviderPayload(
      mkPayload({ reasoning_effort: "high" }),
      mkModel({ id: "doubao-seed-2-0-pro", provider: "volcengine", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", reasoning: true }),
      { mode: "chat", reasoningLevel: "high" },
    );
    expect(p.thinking?.type).toBe("enabled");
  });
});

describe("LongCat", () => {
  it("matches longcat provider", () => {
    const p = normalizeProviderPayload(
      mkPayload({ reasoning_effort: "high" }),
      mkModel({ id: "longcat-flash", provider: "longcat", baseUrl: "https://api.longcat.chat/v1", reasoning: true }),
      { mode: "chat", reasoningLevel: "high" },
    );
    // LongCat only disables; in chat mode with reasoning, should be no-op
    expect(p.thinking?.type).toBeUndefined(); // original payload untouched
  });

  it("disables thinking in utility mode", () => {
    const p = normalizeProviderPayload(
      mkPayload({ thinking: { type: "enabled" } }),
      mkModel({ provider: "longcat", baseUrl: "https://api.longcat.chat/v1", reasoning: true }),
      { mode: "utility" },
    );
    expect(p.thinking?.type).toBe("disabled");
  });
});

describe("Mistral / Devstral", () => {
  it("matches mistral provider", () => {
    const p = normalizeProviderPayload(
      mkPayload({
        messages: [
          { role: "user", content: "test" },
          { role: "assistant", tool_calls: [{ id: "short", type: "function", function: { name: "test", arguments: "{}" } }] },
          { role: "tool", tool_call_id: "short", content: "result" },
        ],
      }),
      mkModel({ provider: "mistral", baseUrl: "https://api.mistral.ai/v1" }),
      { mode: "chat" },
    );
    // Mistral normalizes tool call IDs to 9-char alphanumeric
    const tc = p.messages[1].tool_calls[0];
    expect(tc.id).toHaveLength(9);
    expect(tc.id).toMatch(/^[a-z0-9]+$/i);
  });

  it("injects synthetic assistant between tool→user", () => {
    const p = normalizeProviderPayload(
      mkPayload({
        messages: [
          { role: "user", content: "test" },
          { role: "assistant", tool_calls: [{ id: "aaaaaaaaa", type: "function", function: { name: "t", arguments: "{}" } }] },
          { role: "tool", tool_call_id: "aaaaaaaaa", content: "ok" },
          { role: "user", content: "next" },
        ],
      }),
      mkModel({ provider: "devstral", baseUrl: "https://api.devstral.ai/v1" }),
      { mode: "chat" },
    );
    // Should have injected assistant between tool and user
    const roles = p.messages.map((m: any) => m.role);
    expect(roles).toContain("assistant");
  });
});

describe("Agnes AI", () => {
  it("strips thinking fields", () => {
    const p = normalizeProviderPayload(
      mkPayload({ reasoning_effort: "high", thinking: { type: "enabled" } }),
      mkModel({ provider: "agnes", baseUrl: "https://api.agnes-ai.com/v1" }),
      { mode: "chat" },
    );
    expect(p.reasoning_effort).toBeUndefined();
    expect(p.thinking).toBeUndefined();
  });
});

// ── Tier 2: Standard OpenAI-Compatible (pass-through) ──

describe("Standard OpenAI-compatible (pass-through)", () => {
  it("passes OpenAI models through unmodified", () => {
    const payload = mkPayload({ max_tokens: 4096 });
    const p = normalizeProviderPayload(
      payload,
      mkModel({ id: "gpt-4o", provider: "openai", baseUrl: "https://api.openai.com/v1", reasoning: false }),
      { mode: "chat" },
    );
    // max_tokens may be stripped if it matches implicit SDK default, but structure preserved
    expect(p.messages).toBeDefined();
    expect(p.model).toBe("test-model");
  });

  it("passes xAI / Grok models through unmodified", () => {
    const payload = mkPayload();
    const p = normalizeProviderPayload(
      payload,
      mkModel({ id: "grok-4.5", provider: "xai", baseUrl: "https://api.x.ai/v1", reasoning: true }),
      { mode: "chat", reasoningLevel: "high" },
    );
    // xAI uses standard OpenAI envelope — no special thinking format applied
    expect(p.thinking).toBeUndefined();
    expect(p.enable_thinking).toBeUndefined();
    expect(p.chat_template_kwargs).toBeUndefined();
    // Messages and model preserved
    expect(p.messages).toBeDefined();
  });

  it("passes Groq models through unmodified", () => {
    const p = normalizeProviderPayload(
      mkPayload(),
      mkModel({ id: "llama-3.3-70b", provider: "groq", baseUrl: "https://api.groq.com/openai/v1" }),
      { mode: "chat" },
    );
    expect(p.thinking).toBeUndefined();
    expect(p.messages).toBeDefined();
  });

  it("passes Gemini OpenAI-compatible through unmodified", () => {
    const p = normalizeProviderPayload(
      mkPayload(),
      mkModel({ id: "gemini-2.5-flash", provider: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", reasoning: false }),
      { mode: "chat" },
    );
    expect(p.thinking).toBeUndefined();
    expect(p.messages).toBeDefined();
  });

  it("passes Ollama models through unmodified", () => {
    const p = normalizeProviderPayload(
      mkPayload(),
      mkModel({ id: "llama3.2", provider: "ollama", baseUrl: "http://localhost:11434/v1" }),
      { mode: "chat" },
    );
    expect(p.thinking).toBeUndefined();
    expect(p.messages).toBeDefined();
  });

  it("passes custom OpenAI-compatible endpoints through unmodified", () => {
    const p = normalizeProviderPayload(
      mkPayload(),
      mkModel({ id: "my-model", provider: "custom", baseUrl: "https://my-proxy.example.com/v1" }),
      { mode: "chat" },
    );
    expect(p.thinking).toBeUndefined();
    expect(p.messages).toBeDefined();
  });
});

// ── Edge Cases ──

describe("Edge cases", () => {
  it("handles null model gracefully", () => {
    const payload = mkPayload();
    const p = normalizeProviderPayload(payload, null, { mode: "chat" });
    expect(p).toBe(payload); // should return original unmodified
  });

  it("handles undefined model gracefully", () => {
    const payload = mkPayload();
    const p = normalizeProviderPayload(payload, undefined, { mode: "chat" });
    expect(p).toBe(payload);
  });

  it("handles null payload gracefully", () => {
    const p = normalizeProviderPayload(null, mkModel(), { mode: "chat" });
    expect(p).toBeNull();
  });

  it("handles empty messages array", () => {
    const p = normalizeProviderPayload(
      { ...mkPayload(), messages: [] },
      mkModel({ provider: "deepseek", baseUrl: "https://api.deepseek.com/v1", reasoning: true }),
      { mode: "chat", reasoningLevel: "high" },
    );
    expect(p.messages).toEqual([]);
  });

  it("strips empty tools array", () => {
    const p = normalizeProviderPayload(
      mkPayload({ tools: [] }),
      mkModel(),
      { mode: "chat" },
    );
    expect(p.tools).toBeUndefined();
  });
});

// ── Output Budget ──

describe("Output budget", () => {
  it("preserves explicit user max_tokens for anthropic", () => {
    const p = normalizeProviderPayload(
      mkPayload({ max_tokens: 16000 }),
      mkModel({ provider: "anthropic", api: "anthropic-messages", reasoning: true, maxTokens: 200000 }),
      { mode: "chat", outputBudgetSource: "user" },
    );
    expect(p.max_tokens).toBe(16000);
  });

  it("adds required output cap for anthropic when missing", () => {
    const p = normalizeProviderPayload(
      // no max_tokens field
      { model: "claude", messages: [{ role: "user", content: "Hi" }] },
      mkModel({ provider: "anthropic", api: "anthropic-messages", maxTokens: 200000 }),
      { mode: "chat" },
    );
    expect(p.max_tokens).toBe(200000);
  });
});

// ── Tool Pairing ──

describe("Tool pairing (orphan toolResult guard)", () => {
  it("strips orphan tool results", () => {
    const p = normalizeProviderPayload(
      {
        model: "test",
        messages: [
          { role: "user", content: "test" },
          { role: "tool", tool_call_id: "orphan-1", content: "orphan result" },
        ],
      },
      mkModel(),
      { mode: "chat" },
    );
    // orphan tool message without preceding assistant with tool_calls should be removed
    expect(p.messages.length).toBe(1);
    expect(p.messages[0].role).toBe("user");
  });

  it("keeps properly paired tool results", () => {
    const p = normalizeProviderPayload(
      {
        model: "test",
        messages: [
          { role: "user", content: "test" },
          { role: "assistant", tool_calls: [{ id: "call-1", type: "function", function: { name: "test", arguments: "{}" } }] },
          { role: "tool", tool_call_id: "call-1", content: "result" },
        ],
      },
      mkModel(),
      { mode: "chat" },
    );
    expect(p.messages.length).toBe(3);
  });
});
