/**
 * OpenRouter provider compatibility layer.
 * @license MIT
 */
import { getReasoningProfile } from "../model-capabilities.ts";

const ERR = "Claude Fable/Mythos 5 does not support disabling adaptive thinking.";
const hasOwn = (o: any, k: string) => Object.prototype.hasOwnProperty.call(o, k);
function lower(v: unknown): string { return typeof v === "string" ? v.toLowerCase() : ""; }
function isObj(v: unknown): v is Record<string, any> { return !!v && typeof v === "object" && !Array.isArray(v); }

export function matches(m: any): boolean {
  if (!m || typeof m !== "object") return false;
  return getReasoningProfile(m) === "openrouter-anthropic-adaptive";
}

function isOff(v: unknown): boolean {
  if (v === false) return true;
  const n = lower(v); return n === "off" || n === "none" || n === "disabled";
}

function effort(l: string): string {
  if (l === "xhigh" || l === "max") return "max";
  if (l === "low" || l === "medium" || l === "high") return l;
  return "high";
}

function hasDisabled(p: any): boolean {
  if (isOff(p.reasoning_effort)) return hasOwn(p, "reasoning_effort");
  if (p.thinking?.type === "disabled") return true;
  if (!isObj(p.reasoning)) return false;
  if (p.reasoning.enabled === false) return true;
  return isOff(p.reasoning.effort);
}

function norm(r: any): Record<string, any> {
  const n = isObj(r) ? { ...r } : {};
  delete n.effort; delete n.max_tokens; delete n.maxTokens; n.enabled = true;
  return n;
}

export function apply(p: any, m: any, o: Record<string, any> = {}): any {
  if (isOff(o?.reasoningLevel) || hasDisabled(p)) throw new Error(ERR);
  const n = { ...p };
  delete n.thinking; delete n.reasoning_effort;
  n.reasoning = norm(p.reasoning);
  n.verbosity = effort(o?.reasoningLevel);
  return n;
}
