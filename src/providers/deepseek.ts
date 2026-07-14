/**
 * DeepSeek provider compatibility layer.
 * @license MIT
 */
import { getReasoningProfile, getThinkingFormat } from "../model-capabilities.ts";
import { ensureAssistantContentForToolCalls, ensureReasoningContentForToolCalls as ensureRC, extractReasoningFromContent, stripReasoningContent } from "../utils/reasoning-content-replay.ts";

export { ensureAssistantContentForToolCalls, extractReasoningFromContent };

const BUDGET = 32768;
const HIGH_SAFE = 65536;
const MAX_SAFE = 131072;
const hasOwn = (o: any, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const ANTHROPIC_ERR = "DeepSeek Anthropic thinking mode history is missing non-empty thinking content for a tool call.";

function lower(v: unknown): string { return typeof v === "string" ? v.toLowerCase() : ""; }
function pi(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : null; }

export function matches(m: any): boolean {
  if (!m || typeof m !== "object") return false;
  if (getThinkingFormat(m) === "deepseek") return true;
  return lower(m.provider) === "deepseek" || lower(m.baseUrl || m.base_url).includes("api.deepseek.com");
}

function isThinkModel(id: string): boolean { const n = lower(id); return n === "deepseek-reasoner" || n.startsWith("deepseek-v4-"); }
function isV4(id: string): boolean { const n = lower(id); return n === "deepseek-v4" || n.startsWith("deepseek-v4-") || n.startsWith("deepseek-v4."); }
function isAnthropicProfile(m: any): boolean { return getReasoningProfile(m) === "deepseek-v4-anthropic" || (lower(m?.api) === "anthropic-messages" && isV4(m?.id)); }
function isOff(l: unknown): boolean { return l === "off" || l === "none" || l === "disabled"; }
function effortFor(l: unknown): string | null {
  if (!l) return null;
  if (l === "xhigh" || l === "max") return "max";
  if (l === "minimal" || l === "low" || l === "medium" || l === "high") return "high";
  return null;
}
function shouldUse(p: any, m: any, rl: unknown): boolean {
  if (p.thinking?.type === "disabled") return false;
  if (isOff(rl)) return false;
  const ktm = m?.reasoning === true || isThinkModel(m?.id || p.model);
  return Boolean(p.reasoning_effort || (ktm && effortFor(rl)) || ktm);
}

// OpenAI path
function normMaxToken(p: any): void { if (hasOwn(p, "max_completion_tokens")) { if (!hasOwn(p, "max_tokens")) p.max_tokens = p.max_completion_tokens; delete p.max_completion_tokens; } }
function enable(p: any): void { p.thinking = { type: "enabled" }; }
function normEffort(p: any): void {
  if (!hasOwn(p, "reasoning_effort")) return;
  if (p.reasoning_effort === "low" || p.reasoning_effort === "medium") p.reasoning_effort = "high";
  else if (p.reasoning_effort === "xhigh") p.reasoning_effort = "max";
}
function disable(p: any): void {
  delete p.reasoning_effort; p.thinking = { type: "disabled" };
  if (Array.isArray(p.messages)) { const s = stripReasoningContent(p.messages); if (s !== p.messages) p.messages = s; }
}
function ensureBudget(p: any, m: any): void {
  const c = pi(p.max_tokens); if (c && c > BUDGET) return;
  const ml = pi(m?.maxTokens || m?.maxOutput);
  const d = p.reasoning_effort === "max" ? MAX_SAFE : HIGH_SAFE;
  const t = ml ? Math.min(ml, d) : d;
  if (t <= BUDGET) { disable(p); return; }
  p.max_tokens = t;
}
export function ensureReasoningContentForToolCalls(ms: any[]): any[] { return ensureRC(ms, { providerLabel: "DeepSeek" }); }
function stripTC(p: any): any { return hasOwn(p, "tool_choice") ? (({tool_choice, ...r}) => r)(p) : p; }

// Anthropic path
function normAnthropicThinking(t: any): Record<string, any> {
  if (!t || typeof t !== "object" || Array.isArray(t)) return { type: "enabled" };
  const n: Record<string, any> = { type: "enabled" };
  if (pi(t.budget_tokens)) n.budget_tokens = pi(t.budget_tokens);
  return n;
}
function disableAnthropic(p: any): void { delete p.reasoning_effort; delete p.output_config; p.thinking = { type: "disabled" }; }

function hasAgentTC(c: any): boolean { return Array.isArray(c) && c.some((b: any) => b && typeof b === "object" && (b.type === "toolCall" || b.type === "tool_use" || b.type === "function_call")); }
function hasNonEmptyThink(c: any): boolean { return Array.isArray(c) && c.some((b: any) => b && b.type === "thinking" && typeof b.thinking === "string" && b.thinking.trim().length > 0); }

export function normalizeContextMessages(ms: any[], m: any, o: Record<string, any> = {}): any[] {
  if (!Array.isArray(ms)) return ms;
  if (!isAnthropicProfile(m)) return ms;
  if (o.mode === "utility" || isOff(o.reasoningLevel)) return ms;
  for (const msg of ms) {
    if (!msg || typeof msg !== "object" || msg.role !== "assistant") continue;
    if (!hasAgentTC(msg.content)) continue;
    if (!hasNonEmptyThink(msg.content)) throw new Error(ANTHROPIC_ERR);
  }
  return ms;
}

function applyAnthropic(p: any, m: any, o: Record<string, any> = {}): any {
  const rl = o.reasoningLevel;
  let n = p;
  const ed = () => { if (n === p) n = { ...p }; return n; };
  if (isOff(rl) || n.thinking?.type === "disabled") { disableAnthropic(ed()); return n; }
  if (!shouldUse(n, m, rl)) return n;
  if (o.mode === "utility") { disableAnthropic(ed()); return n; }
  const np = ed();
  delete np.reasoning_effort; np.thinking = normAnthropicThinking(np.thinking);
  const e = effortFor(rl); if (e) np.output_config = { effort: e }; else delete np.output_config;
  return n;
}

export function apply(p: any, m: any, o: Record<string, any> = {}): any {
  if (!Array.isArray(p.messages)) return p;
  if (isAnthropicProfile(m)) return applyAnthropic(p, m, o);
  const mode = o.mode || "chat"; const rl = o.reasoningLevel;
  let n = p;
  const ed = () => { if (n === p) n = { ...p }; return n; };
  if (hasOwn(p, "max_completion_tokens")) normMaxToken(ed());
  if (isOff(rl) || n.thinking?.type === "disabled") { disable(ed()); return n; }
  if (!shouldUse(n, m, rl)) return n;
  if (mode === "utility") { disable(ed()); return n; }
  const np = ed();
  if (effortFor(rl)) np.reasoning_effort = effortFor(rl);
  normEffort(np); enable(np); ensureBudget(np, m);
  if (np.thinking?.type === "disabled") return n;
  const ens = ensureRC(np.messages, { providerLabel: "DeepSeek" }); if (ens !== np.messages) np.messages = ens;
  const ce = ensureAssistantContentForToolCalls(np.messages); if (ce !== np.messages) np.messages = ce;
  return stripTC(np);
}
