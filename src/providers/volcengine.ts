/**
 * Volcengine Ark OpenAI-compatible thinking compatibility.
 * @license MIT
 */
import { stripReasoningContent } from "../utils/reasoning-content-replay.ts";

const hasOwn = (o: any, k: string) => Object.prototype.hasOwnProperty.call(o, k);
function lower(v: unknown): string { return typeof v === "string" ? v.toLowerCase() : ""; }
function baseHost(v: unknown): string {
  if (typeof v !== "string" || v.trim().length === 0) return "";
  try { return new URL(v.trim()).hostname.toLowerCase(); } catch {
    try { return new URL("https://"+v.trim()).hostname.toLowerCase(); } catch { return lower(v).split(/[/?#]/)[0].replace(/:\d+$/, ""); }
  }
}

export function matches(m: any): boolean {
  if (!m || typeof m !== "object") return false;
  if (lower(m.compat?.thinkingFormat) === "volcengine") return true;
  const p = lower(m.provider);
  if (p === "volcengine" || p === "volcengine-coding") return true;
  const h = baseHost(m.baseUrl || m.base_url);
  return h === "ark.cn-beijing.volces.com" || h.endsWith(".volces.com");
}

function isOff(v: unknown): boolean {
  if (v === false) return true; if (v == null) return false;
  const n = lower(v); return n === "" || n === "none" || n === "off" || n === "disabled";
}

function effortForLevel(l: unknown): string | null {
  const n = lower(l);
  if (n === "minimal") return "minimal"; if (n === "low") return "low";
  if (n === "medium" || n === "auto") return "medium";
  if (n === "high" || n === "xhigh" || n === "max") return "high";
  return null;
}

function hasTC(p: any): boolean { return hasOwn(p, "thinking") || hasOwn(p, "reasoning_effort") || hasOwn(p, "enable_thinking"); }

function shouldDisable(p: any, m: any, o: any): boolean {
  if (o?.mode === "utility") return true;
  if (isOff(o?.reasoningLevel)) return true;
  if (p.thinking?.type === "disabled") return true;
  if (p.enable_thinking === false) return true;
  return m?.reasoning === false && hasTC(p);
}

function shouldEnable(p: any, m: any, o: any): boolean {
  return Boolean(m?.reasoning === true || p.thinking?.type === "enabled" || p.enable_thinking === true || hasOwn(p, "reasoning_effort") || effortForLevel(o?.reasoningLevel));
}

function disable(p: any): any {
  const n = { ...p }; delete n.reasoning_effort; delete n.enable_thinking; n.thinking = { type: "disabled" };
  if (Array.isArray(n.messages)) { const s = stripReasoningContent(n.messages); if (s !== n.messages) n.messages = s; }
  return n;
}

function enable(p: any, o: any): any {
  const n = { ...p }; delete n.enable_thinking; n.thinking = { type: "enabled" };
  const e = effortForLevel(o?.reasoningLevel) || (hasOwn(p, "reasoning_effort") ? effortForLevel(p.reasoning_effort) : null);
  if (e) n.reasoning_effort = e; else delete n.reasoning_effort;
  return n;
}

export function apply(p: any, m: any, o: any = {}): any {
  if (!p || typeof p !== "object") return p;
  if (shouldDisable(p, m, o)) {
    if (m?.reasoning !== true && !hasTC(p)) return p;
    return disable(p);
  }
  return shouldEnable(p, m, o) ? enable(p, o) : p;
}
