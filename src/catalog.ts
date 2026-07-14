/**
 * catalog.ts — Complete Provider Catalog
 *
 * Maps every supported provider to its metadata: baseUrl, auth type,
 * default API protocol, display name, and which compat sub-module
 * handles it (if any).
 *
 * This is the single source of truth for "what providers are supported."
 * Tier-1 providers route through dedicated compat sub-modules
 * (src/providers/<id>.ts); Tier-2 providers use the standard
 * OpenAI-compatible default pathway.
 *
 * @license MIT
 */

// ── Types ──

export type AuthType = "api-key" | "oauth" | "none";

export interface ProviderDefinition {
  /** Unique provider id (used as provider field in model objects) */
  id: string;
  /** Human-readable display name */
  displayName: string;
  /** Authentication type */
  authType: AuthType;
  /** Default base URL for the Chat Completions (or equivalent) endpoint */
  defaultBaseUrl: string;
  /** Default API protocol */
  defaultApi: string;
  /** Which compat tier handles this provider */
  compatTier: "dedicated" | "standard";
  /** If compatTier is "dedicated", which sub-module handles it (filename without .ts) */
  compatModule?: string;
  /** OAuth JSON key (only for authType: "oauth") */
  authJsonKey?: string;
}

// ── Catalog ──

export const PROVIDER_CATALOG: Record<string, ProviderDefinition> = {
  // ═══ Tier 1 — Dedicated compat sub-modules ═══

  agnes: {
    id: "agnes",
    displayName: "Agnes AI",
    authType: "api-key",
    defaultBaseUrl: "https://apihub.agnes-ai.com/v1",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "agnes",
  },

  anthropic: {
    id: "anthropic",
    displayName: "Anthropic",
    authType: "api-key",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultApi: "anthropic-messages",
    compatTier: "dedicated",
    compatModule: "anthropic",
  },

  deepseek: {
    id: "deepseek",
    displayName: "DeepSeek",
    authType: "api-key",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "deepseek",
  },

  "kimi-coding": {
    id: "kimi-coding",
    displayName: "Kimi Coding Plan",
    authType: "api-key",
    defaultBaseUrl: "https://api.kimi.com/coding/v1",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "kimi",
  },

  moonshot: {
    id: "moonshot",
    displayName: "Moonshot (Kimi)",
    authType: "api-key",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "kimi",
  },

  dashscope: {
    id: "dashscope",
    displayName: "阿里云百炼 (DashScope)",
    authType: "api-key",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "qwen",
  },

  "dashscope-coding": {
    id: "dashscope-coding",
    displayName: "百炼 Coding Plan",
    authType: "api-key",
    defaultBaseUrl: "https://coding.dashscope.aliyuncs.com/v1",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "qwen",
  },

  siliconflow: {
    id: "siliconflow",
    displayName: "SiliconFlow (硅基流动)",
    authType: "api-key",
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "qwen",
  },

  modelscope: {
    id: "modelscope",
    displayName: "魔搭 (ModelScope)",
    authType: "api-key",
    defaultBaseUrl: "https://api-inference.modelscope.cn/v1",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "qwen",
  },

  infini: {
    id: "infini",
    displayName: "无问芯穹 (Infini)",
    authType: "api-key",
    defaultBaseUrl: "https://cloud.infini-ai.com/maas/v1",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "qwen",
  },

  zhipu: {
    id: "zhipu",
    displayName: "智谱 AI (GLM)",
    authType: "api-key",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "zhipu",
  },

  "zhipu-coding": {
    id: "zhipu-coding",
    displayName: "智谱 GLM Coding Plan",
    authType: "api-key",
    defaultBaseUrl: "https://api.z.ai/api/coding/paas/v4",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "zhipu",
  },

  "opencode-go": {
    id: "opencode-go",
    displayName: "OpenCode Go",
    authType: "api-key",
    defaultBaseUrl: "https://opencode.ai/zen/go/v1",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "zhipu",
  },

  mimo: {
    id: "mimo",
    displayName: "Xiaomi (MiMo)",
    authType: "api-key",
    defaultBaseUrl: "https://api.xiaomimimo.com/v1",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "mimo",
  },

  "mimo-token-plan": {
    id: "mimo-token-plan",
    displayName: "Xiaomi MiMo Token Plan",
    authType: "api-key",
    defaultBaseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "mimo",
  },

  openrouter: {
    id: "openrouter",
    displayName: "OpenRouter",
    authType: "api-key",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "openrouter",
  },

  volcengine: {
    id: "volcengine",
    displayName: "火山引擎 (豆包)",
    authType: "api-key",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "volcengine",
  },

  "volcengine-coding": {
    id: "volcengine-coding",
    displayName: "火山引擎 Coding Plan",
    authType: "api-key",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/coding/v3",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "volcengine",
  },

  longcat: {
    id: "longcat",
    displayName: "LongCat AI",
    authType: "api-key",
    defaultBaseUrl: "https://api.longcat.chat/v1",
    defaultApi: "openai-completions",
    compatTier: "dedicated",
    compatModule: "longcat",
  },

  minimax: {
    id: "minimax",
    displayName: "MiniMax",
    authType: "api-key",
    defaultBaseUrl: "https://api.minimaxi.com/anthropic",
    defaultApi: "anthropic-messages",
    compatTier: "dedicated",
    compatModule: "anthropic",
  },

  "minimax-token-plan": {
    id: "minimax-token-plan",
    displayName: "MiniMax Token Plan",
    authType: "api-key",
    defaultBaseUrl: "https://api.minimaxi.com/anthropic",
    defaultApi: "anthropic-messages",
    compatTier: "dedicated",
    compatModule: "anthropic",
  },

  "openai-codex-oauth": {
    id: "openai-codex-oauth",
    displayName: "OpenAI Codex (OAuth)",
    authType: "oauth",
    defaultBaseUrl: "https://chatgpt.com/backend-api",
    defaultApi: "openai-codex-responses",
    compatTier: "dedicated",
    compatModule: "codex-responses",
    authJsonKey: "openai-codex",
  },

  // ═══ Tier 2 — Standard OpenAI-compatible ═══

  openai: {
    id: "openai",
    displayName: "OpenAI",
    authType: "api-key",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultApi: "openai-completions",
    compatTier: "standard",
  },

  xai: {
    id: "xai",
    displayName: "xAI (Grok)",
    authType: "api-key",
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultApi: "openai-completions",
    compatTier: "standard",
  },

  gemini: {
    id: "gemini",
    displayName: "Google Gemini",
    authType: "api-key",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultApi: "google-generative-ai",
    compatTier: "standard",
  },

  groq: {
    id: "groq",
    displayName: "Groq",
    authType: "api-key",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultApi: "openai-completions",
    compatTier: "standard",
  },

  cohere: {
    id: "cohere",
    displayName: "Cohere",
    authType: "api-key",
    defaultBaseUrl: "https://api.cohere.com/v1",
    defaultApi: "openai-completions",
    compatTier: "standard",
  },

  mistral: {
    id: "mistral",
    displayName: "Mistral AI",
    authType: "api-key",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    defaultApi: "openai-completions",
    compatTier: "standard",
  },

  perplexity: {
    id: "perplexity",
    displayName: "Perplexity",
    authType: "api-key",
    defaultBaseUrl: "https://api.perplexity.ai",
    defaultApi: "openai-completions",
    compatTier: "standard",
  },

  together: {
    id: "together",
    displayName: "Together AI",
    authType: "api-key",
    defaultBaseUrl: "https://api.together.xyz/v1",
    defaultApi: "openai-completions",
    compatTier: "standard",
  },

  fireworks: {
    id: "fireworks",
    displayName: "Fireworks AI",
    authType: "api-key",
    defaultBaseUrl: "https://api.fireworks.ai/inference/v1",
    defaultApi: "openai-completions",
    compatTier: "standard",
  },

  baichuan: {
    id: "baichuan",
    displayName: "百川智能",
    authType: "api-key",
    defaultBaseUrl: "https://api.baichuan-ai.com/v1",
    defaultApi: "openai-completions",
    compatTier: "standard",
  },

  "baidu-cloud": {
    id: "baidu-cloud",
    displayName: "百度智能云 (文心)",
    authType: "api-key",
    defaultBaseUrl: "https://qianfan.baidubce.com/v2",
    defaultApi: "openai-completions",
    compatTier: "standard",
  },

  hunyuan: {
    id: "hunyuan",
    displayName: "腾讯混元",
    authType: "api-key",
    defaultBaseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    defaultApi: "openai-completions",
    compatTier: "standard",
  },

  stepfun: {
    id: "stepfun",
    displayName: "阶跃星辰 (StepFun)",
    authType: "api-key",
    defaultBaseUrl: "https://api.stepfun.com/v1",
    defaultApi: "openai-completions",
    compatTier: "standard",
  },

  ollama: {
    id: "ollama",
    displayName: "Ollama (本地)",
    authType: "none",
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultApi: "openai-completions",
    compatTier: "standard",
  },

  // Special-purpose (non-chat) providers
  "xai-oauth": {
    id: "xai-oauth",
    displayName: "xAI Grok (OAuth)",
    authType: "oauth",
    defaultBaseUrl: "https://cli-chat-proxy.grok.com",
    defaultApi: "openai-responses",
    compatTier: "standard",
    authJsonKey: "xai-oauth",
  },

  "volcengine-speech": {
    id: "volcengine-speech",
    displayName: "火山引擎语音 (BigASR)",
    authType: "api-key",
    defaultBaseUrl: "https://openspeech.bytedance.com",
    defaultApi: "volcengine-bigasr",
    compatTier: "standard",
  },

  "system-speech": {
    id: "system-speech",
    displayName: "系统语音识别",
    authType: "none",
    defaultBaseUrl: "",
    defaultApi: "system-speech",
    compatTier: "standard",
  },
};

// ── Helpers ──

/** Get a provider definition by id */
export function getProvider(id: string): ProviderDefinition | undefined {
  return PROVIDER_CATALOG[id];
}

/** List all provider ids */
export function listProviders(): string[] {
  return Object.keys(PROVIDER_CATALOG);
}

/** List providers filtered by compat tier */
export function listProvidersByTier(tier: "dedicated" | "standard"): ProviderDefinition[] {
  return Object.values(PROVIDER_CATALOG).filter((p) => p.compatTier === tier);
}

/** Get the compat module name for a provider, or null if standard */
export function getCompatModule(providerId: string): string | null {
  return PROVIDER_CATALOG[providerId]?.compatModule ?? null;
}

/** Check if a provider is supported */
export function isSupportedProvider(providerId: string): boolean {
  return providerId in PROVIDER_CATALOG;
}
