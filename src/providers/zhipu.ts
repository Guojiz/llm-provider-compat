/**
 * Zhipu GLM OpenAI-compatible provider compatibility.
 * @license MIT
 */
import { ensureAssistantContentForToolCalls, ensureReasoningContentForToolCalls, stripReasoningContent } from "../utils/reasoning-content-replay.ts";

const hasOwn = (o: any, k: string) => Object.prototype.hasOwnProperty.call(o, k);
function lower(v: unknown): string { return typeof v === "string" ? v.toLowerCase() : ""; }

function isOff(v: unknown): boolean {
  if (v === false || v == null) return v === false;
  const n = lower(v); return n === "" || n === "none" || n === "off" || n === "disabled";
}

export function matches(m: any): boolean {
  if (!m || typeof m !== "object") return false;
  if (lower(m.compat?.thinkingFormat) === "zhipu") return true;
  const p = lower(m.provider); const b = lower(m.baseUrl || m.base_url);
  return p === "zhipu" || p === "zhipu-coding" || b.includes("open.bigmodel.cn") || (b.includes("api.z.ai") && (b.includes("/api/paas/v4") || b.includes("/api/coding/paas/v4")));
}

function normMaxToken(p: any): any {
  if (!hasOwn(p, "max_completion_tokens")) return p;
  const n = { ...p }; if (!hasOwn(n, "max_tokens")) n.max_tokens = n.max_completion_tokens; delete n.max_completion_tokens; return n;
}

function normTools(tools: any): { value: any; changed: boolean } {
  if (!Array.isArray(tools)) return { value: tools, changed: false };
  let c = false;
  const v = tools.map((t: any) => {
    if (!t || typeof t !== "object") return t;
    let n = t;
    if (hasOwn(n, "strict")) { n = { ...n }; delete n.strict; c = true; }
    if (n.function && typeof n.function === "object" && hasOwn(n.function, "strict")) { if (n === t) n = { ...n }; n.function = { ...n.function }; delete n.function.strict; c = true; }
    return n;
  });
  return { value: v, changed: c };
}

function hasToolHistory(ms: any[]): boolean {
  if (!Array.isArray(ms)) return false;
  return ms.some((m: any) => m && typeof m === "object" && m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0);
}

function hasReasonHistory(ms: any[]): boolean {
  if (!Array.isArray(ms)) return false;
  return ms.some((m: any) => m && typeof m === "object" && m.role === "assistant" && typeof m.reasoning_content === "string" && m.reasoning_content.length > 0);
}

function isOpenCodeGo(m: any): boolean {
  if (!m || typeof m !== "object") return false;
  return lower(m.provider) === "opencode-go" || lower(m.baseUrl || m.base_url).includes("opencode.ai/zen/go");
}

function supportsClear(m: any): boolean { return !isOpenCodeGo(m); }

function resolveReplay(p: any, o: any): string {
  const v = typeof o?.reasoningReplay === "string" ? lower(o.reasoningReplay) : "";
  if (v === "clear" || v === "none" || v === "strip") return "clear";
  if (v === "preserve" || v === "replay") return "preserve";
  if (hasOwn(p.thinking || {}, "clear_thinking")) return p.thinking.clear_thinking === true ? "clear" : "preserve";
  return "preserve";
}

function normThinking(p: any, m: any, o: any): any {
  const off = o?.mode === "utility" || isOff(o?.reasoningLevel) || p.thinking?.type === "disabled" || p.enable_thinking === false;
  const wants = !off && (hasOwn(p, "reasoning_effort") || p.enable_thinking === true || m?.reasoning === true || p.thinking?.type === "enabled");
  if (!off && !wants && !hasOwn(p, "reasoning_effort")) return p;
  const n = { ...p }; delete n.reasoning_effort; delete n.enable_thinking;
  if (off) { n.thinking = { type: "disabled" }; if (Array.isArray(n.messages)) { const s = stripReasoningContent(n.messages); if (s !== n.messages) n.messages = s; } return n; }
  n.thinking = { type: "enabled" };
  const replay = resolveReplay(p, o); const clear = replay === "clear"; const canClear = supportsClear(m);
  const hasTC = hasToolHistory(n.messages);
  if (clear) { if (canClear) n.thinking.clear_thinking = true; if (Array.isArray(n.messages)) { const s = stripReasoningContent(n.messages); if (s !== n.messages) n.messages = s; } }
  else if (canClear && (hasTC || hasReasonHistory(n.messages))) n.thinking.clear_thinking = false;
  if (hasTC) {
    if (!clear) { const ens = ensureReasoningContentForToolCalls(n.messages, { providerLabel: "Zhipu" }); if (ens !== n.messages) n.messages = ens; }
    const ce = ensureAssistantContentForToolCalls(n.messages); if (ce !== n.messages) n.messages = ce;
  }
  return n;
}

export function apply(p: any, m: any, o: any = {}): any {
  let n = normMaxToken(p);
  if (hasOwn(n, "store")) { if (n === p) n = { ...n }; delete n.store; }
  if (hasOwn(n, "stream_options")) { if (n === p) n = { ...n }; delete n.stream_options; }
  const t = normTools(n.tools); if (t.changed) { if (n === p) n = { ...n }; n.tools = t.value; }
  return normThinking(n, m, o);
}
