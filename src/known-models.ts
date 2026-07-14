/**
 * known-models.ts — Model dictionary lookup
 * @license MIT
 */
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

let _raw: Record<string, any> | null = null;
let _fallbacks: Record<string, any> | null = null;
let _rawCI: Record<string, any> | null = null;
let _fbCI: Record<string, any> | null = null;
const hasOwn = (o: any, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function buildCI(d: Record<string, any>): Record<string, any> {
  const idx: Record<string, any> = Object.create(null);
  for (const [k, v] of Object.entries(d || {})) { const n = k.toLowerCase(); if (!hasOwn(idx, n)) idx[n] = v; }
  return idx;
}

let _dataDir: string | null = null;

export function setDataDir(dir: string): void {
  _dataDir = resolve(dir);
  _raw = null; _fallbacks = null; _rawCI = null; _fbCI = null;
}

function getDir(): string {
  if (_dataDir) return _dataDir;
  return resolve(process.cwd(), "data");
}

function ensure(): void {
  if (_raw) return;
  const d = getDir();
  _raw = JSON.parse(readFileSync(join(d, "known-models.json"), "utf-8"));
  try { _fallbacks = JSON.parse(readFileSync(join(d, "known-model-fallbacks.json"), "utf-8")); } catch { _fallbacks = {}; }
  _rawCI = Object.fromEntries(Object.entries(_raw).map(([p, ms]) => [p, buildCI(ms as Record<string, any>)]));
  _fbCI = buildCI(_fallbacks);
}

function exact(d: Record<string, any> | null, k: string): any { return d && typeof k === "string" && hasOwn(d, k) ? d[k] : null; }
function ci(idx: Record<string, any> | null, k: string): any { return idx && typeof k === "string" && hasOwn(idx, k.toLowerCase()) ? idx[k.toLowerCase()] : null; }

function lookupP(provider: string, modelId: string): any {
  if (!provider || typeof modelId !== "string" || modelId.length === 0) return null;
  const bare = modelId.includes("/") ? modelId.split("/").pop()! : null;
  const pm = _raw![provider]; const pi = _rawCI![provider];
  return exact(pm, modelId) || (bare ? exact(pm, bare) : null) || ci(pi, modelId) || (bare ? ci(pi, bare) : null) || null;
}

function lookupF(modelId: string): any {
  if (typeof modelId !== "string" || modelId.length === 0) return null;
  const bare = modelId.includes("/") ? modelId.split("/").pop()! : null;
  return exact(_fallbacks, modelId) || (bare ? exact(_fallbacks, bare) : null) || ci(_fbCI, modelId) || (bare ? ci(_fbCI, bare) : null) || null;
}

export function lookupKnownProvider(provider: string, modelId: string): any { ensure(); return lookupP(provider, modelId); }

export function lookupKnownWithSource(provider: string, modelId: string): { metadata: Record<string, any>; source: "provider" | "fallback" } | null {
  if (typeof modelId !== "string" || modelId.length === 0) return null;
  ensure();
  const pm = lookupP(provider, modelId);
  if (pm) return { metadata: pm, source: "provider" };
  const fm = lookupF(modelId);
  return fm ? { metadata: fm, source: "fallback" } : null;
}

export function lookupKnown(provider: string, modelId: string): any { return lookupKnownWithSource(provider, modelId)?.metadata || null; }

export function listKnownProviderModels(provider: string): string[] {
  if (typeof provider !== "string" || provider.length === 0) return [];
  ensure();
  const pm = _raw![provider];
  return pm && typeof pm === "object" ? Object.keys(pm) : [];
}
