/**
 * model-capabilities.ts — Model capability detection and protocol resolution
 *
 * Resolves thinking formats, reasoning profiles, media transport protocols,
 * and vision capabilities from model metadata. All provider-specific protocol
 * detection is centralized here so the dispatcher and sub-modules can consume
 * consistent, typed values.
 *
 * @license MIT
 */

function lower(v: unknown): string { return typeof v === "string" ? v.toLowerCase() : ""; }
function isObj(v: unknown): v is Record<string, any> { return !!v && typeof v === "object" && !Array.isArray(v); }
function getApi(m: any, c: any = {}): string { return lower(m?.api || c.api); }
function getProvider(m: any, c: any = {}): string { return lower(m?.provider || c.provider); }
function getBaseUrl(m: any, c: any = {}): string { return lower(m?.baseUrl || m?.base_url || c.baseUrl || c.base_url); }
function getBaseHost(m: any, c: any = {}): string {
  const r = m?.baseUrl || m?.base_url || c.baseUrl || c.base_url;
  if (typeof r !== "string" || r.length === 0) return "";
  try { return new URL(r.trim()).hostname.toLowerCase(); } catch { try { return new URL("https://"+r.trim()).hostname.toLowerCase(); } catch { return lower(r).split(/[/?#]/)[0].replace(/:\d+$/, ""); } }
}
function getModelId(m: any, c: any = {}): string { return lower(m?.id || c.id || c.modelId || c.model); }
function getModelText(m: any, c: any = {}): string { return [m?.id, m?.name, m?.model, m?.modelId, c.id, c.name, c.model, c.modelId].map(lower).filter(Boolean).join(" "); }

function isOfficialDS(m: any, c: any = {}): boolean { return getProvider(m, c) === "deepseek" || getBaseUrl(m, c).includes("api.deepseek.com"); }
function isOpenRouter(m: any, c: any = {}): boolean { if (getProvider(m, c) === "openrouter") return true; const h = getBaseHost(m, c); return h === "openrouter.ai" || h.endsWith(".openrouter.ai"); }

const MIMO_PROVIDERS = new Set(["mimo","mimo-token-plan","xiaomi","xiaomi-token","xiaomi-token-plan-cn","xiaomi-token-plan-sgp","xiaomi-token-plan-cn-ams","xiaomi-token-plan-sgp-ams"]);
const THINKING_FORMATS = new Set(["anthropic","qwen","qwen-chat-template","zhipu","deepseek","openrouter","kimi","volcengine"]);
const REASONING_PROFILES = new Set(["anthropic-adaptive-only","deepseek-v4-anthropic","deepseek-v4-openai","mimo-openai","openrouter-anthropic-adaptive","zhipu-openai","kimi-openai"]);
const TOOL_DIALECTS = new Set(["openai","anthropic","gemini","mistral","none"]);
const TOOL_RESULT_FORMATS = new Set(["message","content_block","part"]);
const OUTPUT_CAP_FIELDS = new Set(["max_tokens","max_completion_tokens","max_output_tokens","maxOutputTokens"]);

export function normalizeModelProtocolCompat(v: any): Record<string, any> | null {
  if (!isObj(v)) return null;
  const out: Record<string, any> = {};
  const tf = lower(v.thinkingFormat); if (THINKING_FORMATS.has(tf)) out.thinkingFormat = tf;
  const rp = lower(v.reasoningProfile || v.thinkingProfile); if (REASONING_PROFILES.has(rp)) out.reasoningProfile = rp;
  if (v.customVideoInput === true) out.customVideoInput = true;
  if (v.customAudioInput === true) out.customAudioInput = true;
  if (v.outputCapRequired === true) out.outputCapRequired = true;
  if (typeof v.outputCapField === "string" && OUTPUT_CAP_FIELDS.has(v.outputCapField)) out.outputCapField = v.outputCapField;
  return Object.keys(out).length > 0 ? out : null;
}

export function normalizeToolUseContract(v: any): Record<string, any> | null {
  if (!isObj(v)) return null;
  if (typeof v.supportsTools !== "boolean") return null;
  const d = lower(v.dialect); if (!TOOL_DIALECTS.has(d)) return null;
  const trf = lower(v.toolResultFormat); if (!TOOL_RESULT_FORMATS.has(trf)) return null;
  const out: Record<string, any> = { supportsTools: v.supportsTools, dialect: d, toolResultFormat: trf };
  if (typeof v.supportsParallelToolCalls === "boolean") out.supportsParallelToolCalls = v.supportsParallelToolCalls;
  if (typeof v.supportsForcedToolChoice === "boolean") out.supportsForcedToolChoice = v.supportsForcedToolChoice;
  if (typeof v.supportsServerTools === "boolean") out.supportsServerTools = v.supportsServerTools;
  return out;
}

export function isOfficialMimoEndpoint(m: any, c: any = {}): boolean {
  if (MIMO_PROVIDERS.has(getProvider(m, c))) return true;
  const h = getBaseHost(m, c); return h === "xiaomimimo.com" || h.endsWith(".xiaomimimo.com");
}

function isOfficialZhipu(m: any, c: any = {}): boolean {
  if (getProvider(m, c) === "zhipu") return true;
  const h = getBaseHost(m, c); const b = getBaseUrl(m, c);
  return h === "open.bigmodel.cn" || h.endsWith(".open.bigmodel.cn") || (h === "api.z.ai" && (b.includes("/api/paas/v4") || b.includes("/api/coding/paas/v4")));
}

function isDSv4(id: string): boolean { return id === "deepseek-v4" || id.startsWith("deepseek-v4-") || id.startsWith("deepseek-v4."); }
function isAdaptiveOnly(id: string): boolean { return id === "claude-fable-5" || id === "claude-mythos-5" || id === "anthropic/claude-fable-5" || id === "anthropic/claude-mythos-5"; }
function isDSThink(id: string): boolean { return id === "deepseek-reasoner" || isDSv4(id); }
function isOAIR(m: any, c: any = {}): boolean { const a = getApi(m, c); return a === "openai-completions" || a === "openai-responses" || a === ""; }

function isOfficialKimi(m: any, c: any = {}): boolean {
  if (!isOAIR(m, c)) return false;
  const p = getProvider(m, c); if (p === "kimi-coding" || p === "moonshot") return true;
  const h = getBaseHost(m, c); const b = getBaseUrl(m, c);
  return (h === "api.kimi.com" && b.includes("/coding/v1")) || h === "api.moonshot.cn";
}

function isOfficialVolc(m: any, c: any = {}): boolean {
  if (!isOAIR(m, c)) return false;
  const p = getProvider(m, c); if (p === "volcengine" || p === "volcengine-coding") return true;
  const h = getBaseHost(m, c); return h === "ark.cn-beijing.volces.com" || h.endsWith(".volces.com");
}

function isMimoFamily(m: any, c: any = {}): boolean { const t = getModelText(m, c); return /\bmimo[-_]?v\d/.test(t) && !/\bmimo[-_]?v\d+(?:[._-]\d+)?[-_]tts\b/.test(t); }

function isMimoOpenAI(m: any, c: any = {}): boolean {
  if (!isOAIR(m, c)) return false;
  if (isOpenRouter(m, c) || isOfficialDS(m, c) || isOfficialZhipu(m, c)) return false;
  return isMimoFamily(m, c);
}

export function isDeepSeekFamilyModel(m: any, c: any = {}): boolean {
  if (!isObj(m)) return false;
  const p = getProvider(m, c); const b = getBaseUrl(m, c); const t = getModelText(m, c);
  return p === "deepseek" || p.includes("deepseek") || b.includes("api.deepseek.com") || t.includes("deepseek-ai/") || t.includes("deepseek/") || t.includes("deepseek-");
}

export function isDeepSeekReasoningModel(m: any, c: any = {}): boolean {
  if (!isDeepSeekFamilyModel(m, c)) return false;
  if (m.reasoning === true) return true;
  if (getThinkingFormat(m, c) || getReasoningProfile(m, c)) return true;
  return getModelText(m, c).includes("deepseek-reasoner") || getModelText(m, c).includes("deepseek-r1") || getModelText(m, c).includes("deepseek-v4");
}

export function getThinkingFormat(m: any, c: any = {}): string | null {
  if (!isObj(m)) return null;
  const ex = lower(m.compat?.thinkingFormat); if (ex) return ex;
  const quirks = Array.isArray(m.quirks) ? m.quirks : []; if (quirks.includes("enable_thinking")) return "qwen";
  const api = getApi(m, c); const prov = getProvider(m, c); const mid = getModelId(m, c);
  if (m.reasoning === true && api === "anthropic-messages") return "anthropic";
  if (prov === "anthropic" && m.reasoning !== false) return "anthropic";
  if (isOpenRouter(m, c) && m.reasoning === true && (api === "openai-completions" || api === "")) return "openrouter";
  if (isOfficialKimi(m, c) && m.reasoning === true) return "kimi";
  if (isOfficialVolc(m, c) && m.reasoning === true) return "volcengine";
  if (isOfficialDS(m, c) && (m.reasoning === true || isDSThink(mid))) return "deepseek";
  if (isOfficialMimoEndpoint(m, c) && m.reasoning === true) return "qwen-chat-template";
  if (isOfficialZhipu(m, c) && m.reasoning === true && (api === "openai-completions" || api === "openai-responses" || api === "")) return "zhipu";
  if (isMimoOpenAI(m, c)) return "qwen-chat-template";
  return null;
}

export function getReasoningProfile(m: any, c: any = {}): string | null {
  if (!isObj(m)) return null;
  const ex = lower(m.compat?.reasoningProfile || m.compat?.thinkingProfile); if (ex) return ex;
  const mid = getModelId(m, c);
  if (isOpenRouter(m, c)) { if (m.reasoning === true && isAdaptiveOnly(mid)) return "openrouter-anthropic-adaptive"; return null; }
  if (m.reasoning === true && isAdaptiveOnly(mid) && getThinkingFormat(m, c) === "anthropic") return "anthropic-adaptive-only";
  if (isOfficialMimoEndpoint(m, c) && m.reasoning === true) { const a = getApi(m, c); if (a === "openai-completions" || a === "openai-responses" || a === "") return "mimo-openai"; }
  if (isOfficialZhipu(m, c) && m.reasoning === true) { const a = getApi(m, c); if (a === "openai-completions" || a === "openai-responses" || a === "") return "zhipu-openai"; }
  if (isOfficialKimi(m, c) && m.reasoning === true) return "kimi-openai";
  if (isOfficialDS(m, c)) { if (!isDSv4(mid)) return null; const a = getApi(m, c); if (a === "anthropic-messages") return "deepseek-v4-anthropic"; if (a === "openai-completions" || a === "openai-responses" || a === "") return "deepseek-v4-openai"; }
  return isMimoOpenAI(m, c) ? "mimo-openai" : null;
}

export function withThinkingFormatCompat(m: any, c: any = {}): any {
  if (!isObj(m)) return m;
  const f = getThinkingFormat(m, c); const p = getReasoningProfile(m, c);
  if (!f && !p) return m;
  const compat = isObj(m.compat) ? m.compat : {};
  if ((!f || lower(compat.thinkingFormat) === f) && (!p || lower(compat.reasoningProfile) === p)) return m;
  return { ...m, compat: { ...compat, ...(f ? { thinkingFormat: f } : {}), ...(p ? { reasoningProfile: p } : {}) } };
}

// Media transports
export const MODEL_IMAGE_TRANSPORTS = Object.freeze({ NONE: "none", OPENAI_IMAGE_URL: "openai-image-url", OPENAI_INPUT_IMAGE: "openai-input-image", ANTHROPIC_IMAGE: "anthropic-image", UNSUPPORTED: "unsupported" });
export const MODEL_AUDIO_TRANSPORTS = Object.freeze({ NONE: "none", MIMO_INPUT_AUDIO: "mimo-input-audio", OPENAI_INPUT_AUDIO: "openai-input-audio", UNSUPPORTED: "unsupported" });
export const MODEL_VIDEO_TRANSPORTS = Object.freeze({ NONE: "none", GEMINI_INLINE_DATA: "gemini-inline-data", OPENAI_VIDEO_URL: "openai-video-url", UNSUPPORTED: "unsupported" });

export function modelSupportsImageInput(m: any): boolean { return isObj(m) && Array.isArray(m.input) && m.input.includes("image"); }
export function modelSupportsVideoInput(m: any): boolean { if (!isObj(m)) return false; if (m.video === true) return true; if (m.compat?.customVideoInput === true) return true; return Array.isArray(m.input) && m.input.includes("video"); }
export function modelSupportsAudioInput(m: any): boolean { if (!isObj(m)) return false; if (m.audio === true) return true; if (m.compat?.customAudioInput === true) return true; if (isOfficialMimoAudio(m)) return true; return Array.isArray(m.input) && m.input.includes("audio"); }

export function resolveModelImageInputTransport(m: any, c: any = {}): string {
  if (!modelSupportsImageInput(m)) return MODEL_IMAGE_TRANSPORTS.NONE;
  if ((() => { const h = getBaseHost(m, c); return h ? h === "api.deepseek.com" : getProvider(m, c) === "deepseek"; })()) return MODEL_IMAGE_TRANSPORTS.UNSUPPORTED;
  const a = getApi(m, c); if (a === "anthropic-messages") return MODEL_IMAGE_TRANSPORTS.ANTHROPIC_IMAGE;
  if (a === "openai-responses" || a === "openai-codex-responses") return MODEL_IMAGE_TRANSPORTS.OPENAI_INPUT_IMAGE;
  return MODEL_IMAGE_TRANSPORTS.OPENAI_IMAGE_URL;
}

export function modelSupportsDirectImageInput(m: any, c: any = {}): boolean { const t = resolveModelImageInputTransport(m, c); return t !== MODEL_IMAGE_TRANSPORTS.NONE && t !== MODEL_IMAGE_TRANSPORTS.UNSUPPORTED; }

export function resolveModelAudioInputTransport(m: any, c: any = {}): string {
  if (!modelSupportsAudioInput(m)) return MODEL_AUDIO_TRANSPORTS.NONE;
  const ex = lower(m?.compat?.audioTransport || m?.compat?.customAudioTransport);
  if (ex) return (Object.values(MODEL_AUDIO_TRANSPORTS) as string[]).includes(ex) ? ex : MODEL_AUDIO_TRANSPORTS.UNSUPPORTED;
  if (isOfficialMimoAudio(m, c)) return MODEL_AUDIO_TRANSPORTS.MIMO_INPUT_AUDIO;
  if (getApi(m, c) === "openai-completions" && getProvider(m, c) === "openai") return MODEL_AUDIO_TRANSPORTS.OPENAI_INPUT_AUDIO;
  return MODEL_AUDIO_TRANSPORTS.UNSUPPORTED;
}

export function modelSupportsDirectAudioInput(m: any, c: any = {}): boolean { const t = resolveModelAudioInputTransport(m, c); return t === MODEL_AUDIO_TRANSPORTS.MIMO_INPUT_AUDIO || t === MODEL_AUDIO_TRANSPORTS.OPENAI_INPUT_AUDIO; }

function isOfficialMimoAudio(m: any, c: any = {}): boolean { if (!isOfficialMimoEndpoint(m, c)) return false; const id = getModelId(m, c); return id === "mimo-v2.5" || id === "mimo-v2-omni"; }

export function resolveModelVideoInputTransport(m: any, c: any = {}): string {
  if (!modelSupportsVideoInput(m)) return MODEL_VIDEO_TRANSPORTS.NONE;
  if (getApi(m, c) === "google-generative-ai") return MODEL_VIDEO_TRANSPORTS.GEMINI_INLINE_DATA;
  if (getApi(m, c) === "openai-completions" && usesVideoUrl(m, c)) return MODEL_VIDEO_TRANSPORTS.OPENAI_VIDEO_URL;
  return MODEL_VIDEO_TRANSPORTS.UNSUPPORTED;
}

export function modelSupportsDirectVideoInput(m: any, c: any = {}): boolean { const t = resolveModelVideoInputTransport(m, c); return t === MODEL_VIDEO_TRANSPORTS.GEMINI_INLINE_DATA || t === MODEL_VIDEO_TRANSPORTS.OPENAI_VIDEO_URL; }

function usesVideoUrl(m: any, c: any = {}): boolean { return isDashScope(m, c) || isMoonshot(m, c) || isOfficialMimoEndpoint(m, c); }
function isDashScope(m: any, c: any = {}): boolean { const p = getProvider(m, c); return p === "dashscope" || p === "dashscope-coding" || getBaseUrl(m, c).includes("dashscope"); }
function isMoonshot(m: any, c: any = {}): boolean { const p = getProvider(m, c); return p === "moonshot" || p === "kimi" || getBaseUrl(m, c).includes("moonshot.cn") || getBaseUrl(m, c).includes("moonshot.ai"); }

export function withCustomVideoInputCompat(m: any, enabled: unknown): any {
  if (!isObj(m) || enabled !== true) return m;
  const compat = isObj(m.compat) ? m.compat : {};
  if (compat.customVideoInput === true) return m;
  return { ...m, compat: { ...compat, customVideoInput: true } };
}

export function withCustomAudioInputCompat(m: any, enabled: unknown): any {
  if (!isObj(m) || enabled !== true) return m;
  const compat = isObj(m.compat) ? m.compat : {};
  if (compat.customAudioInput === true) return m;
  return { ...m, compat: { ...compat, customAudioInput: true } };
}

export function normalizeVisionCapabilities(v: any): Record<string, any> | null {
  if (!isObj(v)) return null;
  if (!(v.grounding === true || v.visualGrounding === true)) return null;
  const cs = v.coordinateSpace === undefined || v.coordinateSpace === "norm-1000" ? "norm-1000" : null;
  let bo: string | null = null;
  if (v.boxOrder === undefined || v.boxOrder === "xyxy") bo = "xyxy";
  if (v.boxOrder === "yxyx") bo = "yxyx";
  const boxes = v.boxes === false ? false : true;
  const points = v.points === true;
  const of = ["gemini","qwen","anchor","compat"].includes(lower(v.outputFormat)) ? lower(v.outputFormat) : "compat";
  const gm = ["native","prompted"].includes(lower(v.groundingMode)) ? lower(v.groundingMode) : "native";
  if (!cs || !bo) return null;
  if (!boxes && !points) return null;
  return { grounding: true, boxes, points, coordinateSpace: cs, boxOrder: bo, outputFormat: of, groundingMode: gm };
}

export function getVisionCapabilities(m: any): Record<string, any> | null { return isObj(m) ? normalizeVisionCapabilities(m.visionCapabilities) : null; }
export function modelSupportsVisualGrounding(m: any): boolean { return getVisionCapabilities(m)?.grounding === true; }
