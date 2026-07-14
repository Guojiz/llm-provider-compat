/**
 * Kimi / Moonshot OpenAI-compatible thinking compatibility.
 * @license MIT
 */
import { getReasoningProfile, getThinkingFormat } from "../model-capabilities.ts";
import { ensureReasoningContentForToolCalls as ensureRC, stripReasoningContent } from "../utils/reasoning-content-replay.ts";

const hasOwn = (o: any, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const UTIL_TEMP = 0.6;

export function matches(m: any): boolean {
  if (!m || typeof m !== "object") return false;
  return getThinkingFormat(m) === "kimi" || getReasoningProfile(m) === "kimi-openai";
}

function lower(v: unknown): string { return typeof v === "string" ? v.toLowerCase() : ""; }
function isOff(l: unknown): boolean { return l === "off" || l === "none" || l === "disabled"; }
function usesUtilTemp(m: any, o: any): boolean { return o?.mode === "utility" && lower(m?.provider) === "kimi-coding" && lower(m?.id) === "kimi-for-coding"; }

function effortFor(l: unknown, m: any = null): string | null {
  const n = lower(l); const mk = n === "max" ? "xhigh" : n;
  const lm = m?.thinkingLevelMap;
  if (lm && typeof lm === "object" && hasOwn(lm, mk)) { const mv = lm[mk]; if (mv === null) return null; if (typeof mv === "string" && mv.trim()) return mv.trim(); }
  if (n === "low") return "low"; if (n === "medium" || n === "high") return "high"; if (n === "xhigh" || n === "max") return "max";
  return null;
}

function normThinking(t: any): Record<string, any> {
  const n: Record<string, any> = { type: "enabled" };
  if (t && typeof t === "object" && !Array.isArray(t) && hasOwn(t, "keep")) n.keep = t.keep;
  return n;
}

function normMaxCompletion(p: any): void { if (hasOwn(p, "max_tokens")) { if (!hasOwn(p, "max_completion_tokens")) p.max_completion_tokens = p.max_tokens; delete p.max_tokens; } }

function disable(p: any): void {
  delete p.reasoning_effort; p.thinking = { type: "disabled" };
  if (Array.isArray(p.messages)) { const s = stripReasoningContent(p.messages); if (s !== p.messages) p.messages = s; }
}

function shouldDisable(p: any, m: any, o: any): boolean {
  if (o?.mode === "utility") return true;
  if (isOff(o?.reasoningLevel)) return true;
  if (m?.reasoning === false) return true;
  return p.thinking?.type === "disabled";
}

function shouldEnable(p: any, m: any, o: any): boolean {
  return Boolean(m?.reasoning === true || p.reasoning_effort || p.thinking || effortFor(o?.reasoningLevel, m));
}

function ensureRCK(ms: any[]): any[] { return ensureRC(ms, { providerLabel: "Kimi" }); }

// Moonshot MFJS helpers
const MFJS_KEYS = new Set(["description", "default"]);
function isObj(v: unknown): v is Record<string, any> { return v !== null && typeof v === "object" && !Array.isArray(v); }

function mergeAnyOf(s: Record<string, any>, b: Record<string, any>): Record<string, any> {
  const m = { ...s, ...b };
  if (isObj(s.properties) || isObj(b.properties)) m.properties = { ...(isObj(s.properties) ? s.properties : {}), ...(isObj(b.properties) ? b.properties : {}) };
  if (Array.isArray(s.required) || Array.isArray(b.required)) m.required = [...new Set([...(Array.isArray(s.required) ? s.required : []), ...(Array.isArray(b.required) ? b.required : [])])];
  return m;
}

function distributeType(s: Record<string, any>): Record<string, any> {
  if (!Array.isArray(s.anyOf) || !hasOwn(s, "type")) return s;
  const shared: Record<string, any> = {}; const parent: Record<string, any> = {};
  for (const [k, v] of Object.entries(s)) { if (k === "anyOf") continue; if (MFJS_KEYS.has(k)) parent[k] = v; else shared[k] = v; }
  return { ...parent, anyOf: s.anyOf.map((it: any) => isObj(it) ? mergeAnyOf(shared, it) : it) };
}

function normMfjs(s: any): any {
  if (Array.isArray(s)) { let c = false; const n = s.map((it: any) => { const r = normMfjs(it); if (r !== it) c = true; return r; }); return c ? n : s; }
  if (!isObj(s)) return s;
  let c = false; const n: Record<string, any> = {};
  for (const [k, v] of Object.entries(s)) { const r = normMfjs(v); n[k] = r; if (r !== v) c = true; }
  const cand = c ? n : s;
  const d = distributeType(cand); return d === cand ? cand : d;
}

function normTools(tools: any): any {
  if (!Array.isArray(tools)) return tools;
  let c = false;
  const nt = tools.map((t: any) => {
    const fn = t?.function; if (!fn || !hasOwn(fn, "parameters")) return t;
    const np = normMfjs(fn.parameters); if (np === fn.parameters) return t;
    c = true; return { ...t, function: { ...fn, parameters: np } };
  });
  return c ? nt : tools;
}

export function apply(p: any, m: any, o: Record<string, any> = {}): any {
  if (!p || typeof p !== "object") return p;
  let n = p;
  const ed = () => { if (n === p) n = { ...p }; return n; };
  const nt = normTools(n.tools); if (nt !== n.tools) ed().tools = nt;
  if (usesUtilTemp(m, o)) ed().temperature = UTIL_TEMP;
  if (!Array.isArray(n.messages)) return n;
  if (hasOwn(p, "max_tokens")) normMaxCompletion(ed());
  if (shouldDisable(n, m, o)) { disable(ed()); return n; }
  if (!shouldEnable(n, m, o)) return n;
  const np = ed();
  np.thinking = normThinking(np.thinking);
  const e = effortFor(o?.reasoningLevel, m); if (e) np.reasoning_effort = e;
  const ens = ensureRCK(np.messages); if (ens !== np.messages) np.messages = ens;
  return n;
}
