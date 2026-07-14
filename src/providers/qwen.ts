/**
 * Qwen-style provider compatibility layer.
 * @license MIT
 */
import { modelSupportsVideoInput } from "../model-capabilities.ts";
import { normalizeOpenAIVideoUrlPayload } from "./openai-video-url.ts";

export function matches(m: any): boolean {
  if (!m || typeof m !== "object") return false;
  if (isDashScope(m) && modelSupportsVideoInput(m)) return true;
  return Array.isArray(m.quirks) && m.quirks.includes("enable_thinking");
}

export function apply(p: any, m: any, o: any = {}): any {
  let r = isDashScopeVideo(m) ? normalizeOpenAIVideoUrlPayload(p) : p;
  if (shouldDisable(m, o)) return { ...r, enable_thinking: false };
  return r;
}

function shouldDisable(m: any, o: any): boolean {
  if (o?.mode === "utility") return true;
  if (o?.mode !== "chat") return false;
  return isDisabled(o?.reasoningLevel) || m?.reasoning === false;
}

function isDisabled(v: unknown): boolean {
  if (v === false) return true; if (v == null) return false;
  const n = typeof v === "string" ? v.trim().toLowerCase() : "";
  return n === "" || n === "none" || n === "off" || n === "disabled";
}

function isDashScopeVideo(m: any): boolean {
  return isDashScope(m) && modelSupportsVideoInput(m);
}

function isDashScope(m: any): boolean {
  const p = typeof m?.provider === "string" ? m.provider.toLowerCase() : "";
  const b = typeof m?.baseUrl === "string" ? m.baseUrl.toLowerCase() : "";
  return p === "dashscope" || b.includes("dashscope");
}
