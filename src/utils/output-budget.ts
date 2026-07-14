/**
 * Generic output budget normalization.
 * @license MIT
 */

const SDK_IMPLICIT_MAX_TOKENS_CAP = 32000;
const OUTPUT_CAP_FIELDS = ["max_completion_tokens", "max_tokens", "max_output_tokens", "maxOutputTokens"];
const OUTPUT_CAP_FIELD_SET = new Set(OUTPUT_CAP_FIELDS);
const DEFAULT_OUTPUT_CAP_CAPABILITY = Object.freeze({ id: "default-optional", required: false, preserveImplicitSdkDefault: false });
const PRESERVED_OUTPUT_BUDGET_SOURCES = new Set(["user", "system"]);

function lower(v: unknown): string { return typeof v === "string" ? v.toLowerCase() : ""; }
function posInt(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : null; }
function modelLimit(m: any): number | null { return posInt(m?.maxTokens || m?.maxOutput); }

function isOfficialDeepSeekEndpoint(m: any): boolean {
  return lower(m?.provider) === "deepseek" || lower(m?.baseUrl || m?.base_url).includes("api.deepseek.com");
}

const OUTPUT_CAP_CAPABILITIES = [
  { id: "explicit-required", required: true, preserveImplicitSdkDefault: true, matches: (m: any) => m?.compat?.outputCapRequired === true },
  { id: "official-deepseek", required: false, preserveImplicitSdkDefault: true, matches: isOfficialDeepSeekEndpoint },
  { id: "anthropic-native", required: true, preserveImplicitSdkDefault: true, matches: (m: any) => lower(m?.provider) === "anthropic" || lower(m?.baseUrl || m?.base_url).includes("api.anthropic.com") },
  { id: "bedrock-native", required: true, preserveImplicitSdkDefault: true, matches: (m: any) => { const p = lower(m?.provider); return p === "amazon-bedrock" || p === "bedrock"; } },
  { id: "anthropic-messages", required: true, preserveImplicitSdkDefault: true, matches: (m: any) => lower(m?.api) === "anthropic-messages" },
];

export function resolveOutputCapCapability(model: any): Record<string, any> {
  if (!model || typeof model !== "object") return DEFAULT_OUTPUT_CAP_CAPABILITY;
  return OUTPUT_CAP_CAPABILITIES.find(c => c.matches(model)) || DEFAULT_OUTPUT_CAP_CAPABILITY;
}

function hasOutputCap(p: Record<string, any>): boolean { return OUTPUT_CAP_FIELDS.some(f => Object.prototype.hasOwnProperty.call(p, f)); }
function outputCapField(m: any): string { const e = m?.compat?.outputCapField; return typeof e === "string" && OUTPUT_CAP_FIELD_SET.has(e) ? e : "max_tokens"; }
function isImplicitSdkCap(v: any, m: any): boolean { const l = modelLimit(m); if (!l) return false; return posInt(v) === Math.min(l, SDK_IMPLICIT_MAX_TOKENS_CAP); }

function resolveOutputBudgetSource(opts: Record<string, any> = {}): string {
  const bs = lower(opts.outputBudgetSource); if (bs) return bs;
  const ms = lower(opts.maxTokensSource); if (ms) return ms;
  return posInt(opts.userMaxTokens) !== null ? "user" : "unspecified";
}

export function resolveOutputBudgetPolicy(model: any, opts: Record<string, any> = {}): Record<string, any> {
  const mode = opts.mode || "chat";
  const source = resolveOutputBudgetSource(opts);
  const cap = resolveOutputCapCapability(model);
  const preserveForSource = PRESERVED_OUTPUT_BUDGET_SOURCES.has(source);
  const removeImplicitSdkDefault = mode !== "utility" && !preserveForSource && !cap.required && !cap.preserveImplicitSdkDefault;
  return { mode, source, capability: cap, preserveForSource, removeImplicitSdkDefault };
}

export function normalizeImplicitOutputBudget(payload: Record<string, any>, model: any, opts: Record<string, any> = {}): Record<string, any> {
  if (!payload || typeof payload !== "object") return payload;
  const policy = resolveOutputBudgetPolicy(model, opts);
  let next = payload;
  if (policy.capability.required && !hasOutputCap(next)) {
    const l = modelLimit(model);
    if (l !== null) next = { ...next, [outputCapField(model)]: l };
  }
  if (!policy.removeImplicitSdkDefault) return next;
  for (const f of OUTPUT_CAP_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(next, f)) continue;
    if (!isImplicitSdkCap(next[f], model)) continue;
    if (next === payload) next = { ...payload };
    delete next[f];
  }
  return next;
}
