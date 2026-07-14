/**
 * Anthropic Messages prompt-cache compatibility layer.
 * @license MIT
 */
import { getReasoningProfile, getThinkingFormat } from "../model-capabilities.ts";

const CC = { type: "ephemeral" } as const;
const MAX_EFFORT_MIN = 64000;
const ERR = "Claude Fable/Mythos 5 does not support disabling adaptive thinking.";

function lower(v: unknown): string { return typeof v === "string" ? v.toLowerCase() : ""; }
function pi(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : null; }
function modelLimit(m: any): number | null { return pi(m?.maxTokens || m?.maxOutput); }
function isImplCap(v: unknown, m: any): boolean { const l = modelLimit(m); return l ? pi(v) === Math.floor(l / 3) : false; }
function hasCC(b: any): boolean { return Boolean(b && typeof b === "object" && b.cache_control); }
function shouldCC(b: any): boolean { return b && typeof b === "object" && (b.type === "text" || b.type === "image" || b.type === "tool_result"); }
function withCC(b: any): any { return shouldCC(b) && !hasCC(b) ? { ...b, cache_control: { ...CC } } : b; }

function normSystem(s: any): { value: any; changed: boolean } {
  if (typeof s === "string") return { value: [{ type: "text", text: s, cache_control: { ...CC } }], changed: true };
  if (!Array.isArray(s)) return { value: s, changed: false };
  let li = -1; for (let i = s.length - 1; i >= 0; i--) { if (s[i]?.type === "text") { li = i; break; } }
  if (li < 0 || hasCC(s[li])) return { value: s, changed: false };
  const n = s.slice(); n[li] = withCC(s[li]); return { value: n, changed: true };
}

function normUser(m: any): { value: any; changed: boolean; cacheable: boolean } {
  if (!m || m.role !== "user") return { value: m, changed: false, cacheable: false };
  if (typeof m.content === "string") {
    if (m.content.trim().length === 0) return { value: m, changed: false, cacheable: false };
    return { value: { ...m, content: [{ type: "text", text: m.content, cache_control: { ...CC } }] }, changed: true, cacheable: true };
  }
  if (!Array.isArray(m.content) || m.content.length === 0) return { value: m, changed: false, cacheable: false };
  const bi = m.content.length - 1;
  const lb = m.content[bi];
  if (!shouldCC(lb)) return { value: m, changed: false, cacheable: false };
  if (hasCC(lb)) return { value: m, changed: false, cacheable: true };
  const nc = m.content.slice(); nc[bi] = withCC(lb);
  return { value: { ...m, content: nc }, changed: true, cacheable: true };
}

function normRecent(ms: any[]): { value: any[]; changed: boolean } {
  if (!Array.isArray(ms) || ms.length === 0) return { value: ms, changed: false };
  let n = ms, ch = false, marked = 0;
  for (let i = ms.length - 1; i >= 0 && marked < 2; i--) {
    const r = normUser(n[i]); if (!r.cacheable) continue;
    marked++; if (r.changed) { if (n === ms) n = ms.slice(); n[i] = r.value; ch = true; }
  }
  return { value: n, changed: ch };
}

export function matches(m: any): boolean {
  if (!m || typeof m !== "object") return false;
  if (usesCC(m)) return true;
  if (lower(m.api) === "anthropic-messages" && getThinkingFormat(m) === "anthropic") return true;
  return isAdaptive(m);
}

function usesCC(m: any): boolean {
  if (!m || typeof m !== "object") return false;
  if (lower(m.api) !== "anthropic-messages") return false;
  if (lower(m.provider) === "anthropic") return true;
  if (lower(m.id).startsWith("claude-")) return true;
  return m.compat?.cacheControlFormat === "anthropic";
}

function supportsMaxEffort(m: any): boolean { return m?.xhigh === true; }
function isAdaptive(m: any): boolean { return getReasoningProfile(m) === "anthropic-adaptive-only"; }
function isOff(l: unknown): boolean { return l === "off" || l === "none" || l === "disabled"; }

function adaptiveEffort(l: string): string {
  if (l === "xhigh" || l === "max") return "max";
  if (l === "low" || l === "medium" || l === "high") return l;
  return "high";
}

function normAdaptive(t: any): Record<string, any> {
  const b = t && typeof t === "object" && !Array.isArray(t) ? t : {};
  if (b.type === "disabled") throw new Error(ERR);
  return { type: "adaptive", display: b.display || "summarized" };
}

function withMaxEffort(p: any): any {
  const n = { ...p };
  const t = p.thinking && typeof p.thinking === "object" ? p.thinking : {};
  if (t.type !== "adaptive") n.thinking = { type: "adaptive", display: t.display || "summarized" };
  n.output_config = { ...(p.output_config || {}), effort: "max" };
  return n;
}

function withMaxBudget(p: any, m: any, o: any): any {
  const c = pi(p.max_tokens); const l = modelLimit(m);
  if (!c || !l) return p; if (!isImplCap(c, m)) return p;
  const s = lower(o?.outputBudgetSource || o?.maxTokensSource);
  if (s === "user" || s === "system") return p;
  const t = Math.min(l, MAX_EFFORT_MIN);
  return c >= t ? p : { ...p, max_tokens: t };
}

function normMaxEffort(p: any, m: any, o: any): any {
  if (!((o?.reasoningLevel === "xhigh" || o?.reasoningLevel === "max") && supportsMaxEffort(m))) return p;
  return withMaxBudget(withMaxEffort(p), m, o);
}

function normAdaptiveOnly(p: any, m: any, o: any): any {
  if (isOff(o?.reasoningLevel)) throw new Error(ERR);
  const e = adaptiveEffort(o?.reasoningLevel);
  let n = { ...p };
  n.thinking = normAdaptive(p.thinking);
  n.output_config = { ...(p.output_config || {}), effort: e };
  delete n.reasoning_effort;
  return e === "max" ? withMaxBudget(n, m, o) : n;
}

function normStandard(p: any, o: any): any {
  if (o?.mode !== "utility" && !isOff(o?.reasoningLevel) && p.thinking?.type !== "disabled") return p;
  const n = { ...p, thinking: { type: "disabled" } };
  delete n.reasoning_effort; delete n.output_config;
  return n;
}

export function apply(p: any, m: any, o: any = {}): any {
  let r = p;
  if (usesCC(m) && Object.prototype.hasOwnProperty.call(p, "system")) {
    const s = normSystem(p.system); if (s.changed) r = { ...r, system: s.value };
  }
  if (usesCC(m)) {
    const ms = normRecent(r.messages); if (ms.changed) r = { ...r, messages: ms.value };
  }
  return isAdaptive(m) ? normAdaptiveOnly(r, m, o) : normMaxEffort(normStandard(r, o), m, o);
}
