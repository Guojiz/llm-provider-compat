/**
 * OpenAI Codex Responses compatibility layer.
 * @license MIT
 */
const CODEX_RESPONSES_API = "openai-codex-responses";
const CODEX_PROVIDER_IDS = new Set(["openai-codex", "openai-codex-oauth"]);
const UNSUPPORTED = ["max_output_tokens", "max_completion_tokens", "max_tokens", "maxOutputTokens", "temperature"];

function lower(v: unknown): string { return typeof v === "string" ? v.trim().toLowerCase() : ""; }

export function matches(model: any): boolean {
  if (!model || typeof model !== "object") return false;
  return lower(model.api) === CODEX_RESPONSES_API && CODEX_PROVIDER_IDS.has(lower(model.provider));
}

export function apply(payload: any): any {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  let changed = false;
  for (const f of UNSUPPORTED) { if (Object.prototype.hasOwnProperty.call(payload, f)) { changed = true; break; } }
  if (!changed) return payload;
  const next = { ...payload };
  for (const f of UNSUPPORTED) delete next[f];
  return next;
}
