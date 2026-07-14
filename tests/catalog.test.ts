import { describe, it, expect } from "vitest";
import {
  PROVIDER_CATALOG,
  getProvider,
  listProviders,
  listProvidersByTier,
  getCompatModule,
  isSupportedProvider,
} from "../src/catalog.ts";

describe("Provider Catalog", () => {
  it("has all 37 providers", () => {
    expect(Object.keys(PROVIDER_CATALOG).length).toBe(39);
  });

  it("has 22 Tier-1 (dedicated compat) providers", () => {
    const t1 = listProvidersByTier("dedicated");
    expect(t1.length).toBe(22);
  });

  it("has 17 Tier-2 (standard OpenAI-compatible) providers", () => {
    const t2 = listProvidersByTier("standard");
    expect(t2.length).toBe(17);
  });

  // ── Tier 1 verification ──

  const tier1Cases: [string, string, string, string][] = [
    ["agnes", "Agnes AI", "api-key", "openai-completions"],
    ["anthropic", "Anthropic", "api-key", "anthropic-messages"],
    ["deepseek", "DeepSeek", "api-key", "openai-completions"],
    ["kimi-coding", "Kimi Coding Plan", "api-key", "openai-completions"],
    ["moonshot", "Moonshot (Kimi)", "api-key", "openai-completions"],
    ["dashscope", "阿里云百炼", "api-key", "openai-completions"],
    ["dashscope-coding", "百炼 Coding Plan", "api-key", "openai-completions"],
    ["siliconflow", "SiliconFlow", "api-key", "openai-completions"],
    ["modelscope", "魔搭", "api-key", "openai-completions"],
    ["infini", "无问芯穹", "api-key", "openai-completions"],
    ["zhipu", "智谱 AI", "api-key", "openai-completions"],
    ["zhipu-coding", "智谱 GLM Coding Plan", "api-key", "openai-completions"],
    ["opencode-go", "OpenCode Go", "api-key", "openai-completions"],
    ["mimo", "Xiaomi", "api-key", "openai-completions"],
    ["mimo-token-plan", "Xiaomi MiMo Token Plan", "api-key", "openai-completions"],
    ["openrouter", "OpenRouter", "api-key", "openai-completions"],
    ["volcengine", "火山引擎", "api-key", "openai-completions"],
    ["volcengine-coding", "火山引擎 Coding Plan", "api-key", "openai-completions"],
    ["longcat", "LongCat AI", "api-key", "openai-completions"],
    ["minimax", "MiniMax", "api-key", "anthropic-messages"],
    ["minimax-token-plan", "MiniMax Token Plan", "api-key", "anthropic-messages"],
    ["openai-codex-oauth", "OpenAI Codex", "oauth", "openai-codex-responses"],
  ];

  for (const [id, displayName, authType, defaultApi] of tier1Cases) {
    it(`Tier-1: ${id} → ${displayName}`, () => {
      const p = getProvider(id);
      expect(p).toBeDefined();
      expect(p!.compatTier).toBe("dedicated");
      expect(p!.displayName).toContain(displayName.slice(0, 4));
      expect(p!.authType).toBe(authType);
      expect(p!.defaultApi).toBe(defaultApi);
    });
  }

  // ── Tier 2 verification ──

  const tier2Providers = [
    "openai", "xai", "gemini", "groq", "cohere", "mistral",
    "perplexity", "together", "fireworks", "baichuan",
    "baidu-cloud", "hunyuan", "stepfun", "ollama",
    "xai-oauth", "volcengine-speech", "system-speech",
  ];

  for (const id of tier2Providers) {
    it(`Tier-2: ${id} is standard OpenAI-compatible`, () => {
      const p = getProvider(id);
      expect(p).toBeDefined();
      expect(p!.compatTier).toBe("standard");
    });
  }

  // ── xAI coverage ──

  it("xAI API key provider is supported", () => {
    const xai = getProvider("xai");
    expect(xai).toBeDefined();
    expect(xai!.displayName).toBe("xAI (Grok)");
    expect(xai!.defaultBaseUrl).toBe("https://api.x.ai/v1");
    expect(xai!.defaultApi).toBe("openai-completions");
    expect(xai!.compatTier).toBe("standard");
  });

  it("xAI OAuth provider is supported", () => {
    const xaiOAuth = getProvider("xai-oauth");
    expect(xaiOAuth).toBeDefined();
    expect(xaiOAuth!.authType).toBe("oauth");
  });

  // ── Helpers ──

  it("listProviders returns all ids", () => {
    expect(listProviders()).toHaveLength(39);
  });

  it("getCompatModule returns correct modules", () => {
    expect(getCompatModule("deepseek")).toBe("deepseek");
    expect(getCompatModule("zhipu")).toBe("zhipu");
    expect(getCompatModule("openai")).toBeNull();
    expect(getCompatModule("xai")).toBeNull();
  });

  it("isSupportedProvider works", () => {
    expect(isSupportedProvider("openai")).toBe(true);
    expect(isSupportedProvider("xai")).toBe(true);
    expect(isSupportedProvider("unknown-vendor")).toBe(false);
  });
});
