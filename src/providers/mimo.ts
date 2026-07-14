/**
 * MiMo provider compatibility layer.
 * @license MIT
 */
import {
  MODEL_AUDIO_TRANSPORTS, MODEL_VIDEO_TRANSPORTS,
  getReasoningProfile, isOfficialMimoEndpoint,
  resolveModelAudioInputTransport, resolveModelVideoInputTransport,
} from "../model-capabilities.ts";
import {
  ensureAssistantContentForToolCalls, ensureReasoningContentForToolCalls,
  stripReasoningContent,
} from "../utils/reasoning-content-replay.ts";
import { normalizeOpenAIInputAudioPayload } from "../utils/input-audio.ts";
import { normalizeOpenAIVideoUrlPayload } from "./openai-video-url.ts";

const hasOwn = (o: any, k: string) => Object.prototype.hasOwnProperty.call(o, k);
function isObj(v: unknown): v is Record<string, any> { return !!v && typeof v === "object" && !Array.isArray(v); }

export function matches(m: any): boolean {
  if (!m || typeof m !== "object") return false;
  return isOfficialMimoEndpoint(m) || getReasoningProfile(m) === "mimo-openai";
}

function isOff(l: unknown): boolean { return l === "off" || l === "none" || l === "disabled"; }

function shouldUse(p: any, m: any, rl: unknown): boolean {
  if (p.chat_template_kwargs?.enable_thinking === false) return false;
  if (isOff(rl)) return false;
  return Boolean(p.reasoning_effort || p.chat_template_kwargs?.enable_thinking === true || m?.reasoning === true);
}

function disable(p: any): void {
  delete p.reasoning_effort; if (hasOwn(p, "thinking")) delete p.thinking;
  const kw = isObj(p.chat_template_kwargs) ? p.chat_template_kwargs : {};
  p.chat_template_kwargs = { ...kw, enable_thinking: false };
  delete p.chat_template_kwargs.preserve_thinking;
  if (Array.isArray(p.messages)) { const s = stripReasoningContent(p.messages); if (s !== p.messages) p.messages = s; }
}

function enable(p: any): void {
  delete p.reasoning_effort;
  const kw = isObj(p.chat_template_kwargs) ? p.chat_template_kwargs : {};
  p.chat_template_kwargs = { ...kw, enable_thinking: true, preserve_thinking: true };
}

export function apply(p: any, m: any, o: { mode?: string; reasoningLevel?: string } = {}): any {
  if (!Array.isArray(p.messages)) return p;
  const mode = o.mode || "chat"; const rl = o.reasoningLevel;
  let base = p;
  if (resolveModelAudioInputTransport(m) === MODEL_AUDIO_TRANSPORTS.MIMO_INPUT_AUDIO) base = normalizeOpenAIInputAudioPayload(base);
  if (resolveModelVideoInputTransport(m) === MODEL_VIDEO_TRANSPORTS.OPENAI_VIDEO_URL) base = normalizeOpenAIVideoUrlPayload(base);
  let n = base;
  const ed = () => { if (n === base) n = { ...base }; return n; };
  if (isOff(rl) || p.chat_template_kwargs?.enable_thinking === false) { disable(ed()); return n; }
  if (mode === "utility") { disable(ed()); return n; }
  if (!shouldUse(n, m, rl)) return n;
  const np = ed(); enable(np);
  const ens = ensureReasoningContentForToolCalls(np.messages, { providerLabel: "MiMo" });
  if (ens !== np.messages) np.messages = ens;
  const ce = ensureAssistantContentForToolCalls(np.messages);
  if (ce !== np.messages) np.messages = ce;
  if (hasOwn(np, "thinking")) delete np.thinking;
  return n;
}
