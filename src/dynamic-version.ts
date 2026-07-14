/**
 * dynamic-version.ts — Universal Dynamic Version Detection & Auto-Update
 *
 * Periodically calls GET /v1/models on each configured provider to discover
 * the latest available model versions, extracts series & version numbers via
 * per-provider regex strategies, and auto-selects the newest models.
 *
 * Features:
 *   - Strategy Pattern per provider: each provider gets its own regex/parser
 *   - TTL-based local cache (default 24h) to avoid per-request API calls
 *   - Master toggle + per-provider opt-out switches
 *   - Graceful degradation: on fetch failure, falls back to cached data
 *
 * @license MIT
 */

export interface VersionCacheEntry {
  modelIds: string[];
  latestBySeries: Record<string, string>;
  fetchedAt: string;
}

export interface VersionCache { [providerId: string]: VersionCacheEntry }

export interface ProviderVersionConfig {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  autoUpdateEnabled?: boolean;
  headers?: Record<string, string>;
  strategy?: string;
}

export interface LatestModelResult {
  providerId: string;
  series: string;
  modelId: string;
  label: string;
}

interface VersionInfo { series: string; version: number[]; full: string }
type ExtractionStrategy = (modelId: string) => VersionInfo | null;

// ── Strategies ──

function defaultStrategy(modelId: string): VersionInfo | null {
  const re = /^([a-zA-Z][\w]*(?:[-_][\w]+)*?)[-_](\d+(?:[-_.]\d+)*)/i;
  const m = modelId.match(re); if (!m) return null;
  const series = m[1].toLowerCase();
  const version = m[2].split(/[-_.]/).map(Number).filter(n => !isNaN(n));
  if (version.length === 0) return null;
  return { series, version, full: `${series}-${m[2]}` };
}

function openaiStrategy(modelId: string): VersionInfo | null {
  const lower = modelId.toLowerCase();
  if (lower.startsWith("ft:") || lower.startsWith("text-") || lower.startsWith("dall-e")) return null;
  const oM = lower.match(/^(o\d+)(?:-(mini|pro))?/);
  if (oM) {
    const series = "o-series";
    const variant = oM[2] || "";
    return { series, version: [parseInt(oM[1].slice(1)), variant ? 1 : 2], full: `${oM[1]}${variant ? `-${variant}` : ""}` };
  }
  const gM = lower.match(/^gpt-(\d+(?:\.\d+)?)([a-z]*)/);
  if (gM) {
    const series = `gpt-${gM[1]}`;
    const suffix = gM[2] || "";
    return { series, version: [...gM[1].split(".").map(Number), suffix.length], full: `gpt-${gM[1]}${suffix}` };
  }
  return defaultStrategy(modelId);
}

function anthropicStrategy(modelId: string): VersionInfo | null {
  const lower = modelId.toLowerCase().replace(/^anthropic\//, "");
  const re = /^claude(?:[-_](\w+))?[-_](\d+(?:[-_.]\d+)*)(?:[-_](\w+))?/i;
  const m = lower.match(re); if (!m) return null;
  const family = (m[1] || "").toLowerCase();
  const versionStr = (m[2] || "").replace(/[-_]/g, ".");
  const variant = (m[3] || "").toLowerCase();
  const version = versionStr.split(".").map(Number).filter(n => !isNaN(n));
  if (version.length === 0) return null;
  const ranks: Record<string, number> = { opus: 4, sonnet: 3, haiku: 2 };
  return { series: family ? `claude-${family}` : "claude", version: [...version, ranks[family] ?? 1, variant.length], full: `claude${family ? `-${family}` : ""}-${versionStr}${variant ? `-${variant}` : ""}` };
}

function geminiStrategy(modelId: string): VersionInfo | null {
  const lower = modelId.toLowerCase().replace(/^google\//, "").replace(/^gemini\//, "");
  const re = /^gemini[-_](\d+(?:[-_.]\d+)*)(?:[-_](\w[\w-]*))?(?:[-_](\w[\w-]*))?/i;
  const m = lower.match(re); if (!m) return null;
  const versionStr = (m[1] || "").replace(/[-_]/g, ".");
  const tier = (m[2] || "").toLowerCase();
  const suffix = (m[3] || "").toLowerCase();
  const version = versionStr.split(".").map(Number).filter(n => !isNaN(n));
  if (version.length === 0) return null;
  const ranks: Record<string, number> = { ultra: 5, pro: 4, flash: 3, nano: 2 };
  return { series: tier ? `gemini-${tier}` : "gemini", version: [...version, ranks[tier] ?? 1, suffix === "" ? 3 : suffix === "preview" ? 2 : 1], full: `gemini-${versionStr}${tier ? `-${tier}` : ""}${suffix ? `-${suffix}` : ""}` };
}

function deepseekStrategy(modelId: string): VersionInfo | null {
  const lower = modelId.toLowerCase().replace(/^deepseek\//, "");
  if (lower === "deepseek-reasoner" || lower === "deepseek-chat") return { series: "deepseek", version: [0], full: lower };
  const re = /^deepseek[-_]v?(\d+(?:[-_.]\d+)*)(?:[-_](\d+))?/i;
  const m = lower.match(re); if (!m) return null;
  const versionStr = (m[1] || "").replace(/[-_]/g, ".");
  const dateCode = m[2] || "";
  const version = versionStr.split(".").map(Number).filter(n => !isNaN(n));
  if (version.length === 0) return null;
  return { series: "deepseek", version: [...version, dateCode ? parseInt(dateCode) : 0], full: `deepseek-v${versionStr}${dateCode ? `-${dateCode}` : ""}` };
}

const STRATEGIES: Record<string, ExtractionStrategy> = { openai: openaiStrategy, azure: openaiStrategy, anthropic: anthropicStrategy, gemini: geminiStrategy, google: geminiStrategy, vertex: geminiStrategy, deepseek: deepseekStrategy };

function resolveStrategy(providerId: string, explicit?: string): ExtractionStrategy {
  return STRATEGIES[(explicit || providerId).toLowerCase()] || defaultStrategy;
}

// ── Cache ──

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function isExpired(entry: VersionCacheEntry, ttlMs = DEFAULT_TTL_MS): boolean {
  return (Date.now() - new Date(entry.fetchedAt).getTime()) > ttlMs;
}

export function createVersionCache(initial: VersionCache = {}): {
  get: (pid: string) => VersionCacheEntry | null;
  set: (pid: string, entry: VersionCacheEntry) => void;
  getAll: () => VersionCache;
  isExpired: (pid: string, ttlMs?: number) => boolean;
  clear: () => void;
} {
  let cache = { ...initial };
  return {
    get: (pid: string) => cache[pid] || null,
    set: (pid: string, entry: VersionCacheEntry) => { cache[pid] = entry; },
    getAll: () => ({ ...cache }),
    isExpired: (pid: string, ttlMs?: number) => { const e = cache[pid]; return !e || isExpired(e, ttlMs); },
    clear: () => { cache = {}; },
  };
}

const defaultCache = createVersionCache();

// ── Fetch ──

interface FetchOpts { timeout?: number; signal?: AbortSignal }

async function fetchProviderModels(config: ProviderVersionConfig, opts: FetchOpts = {}): Promise<string[]> {
  const { baseUrl, apiKey, headers: hdrs } = config;
  const timeout = opts.timeout || 15000;
  const url = baseUrl.replace(/\/+$/, "") + "/v1/models";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  if (opts.signal) opts.signal.addEventListener("abort", () => ctrl.abort());
  try {
    const res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(hdrs || {}) }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`GET ${url} returned ${res.status}`);
    const body = await res.json();
    if (Array.isArray(body)) return body.map((m: any) => m.id || m.name || m.model || "").filter(Boolean);
    if (Array.isArray(body.data)) return body.data.map((m: any) => m.id || m.name || m.model || "").filter(Boolean);
    if (Array.isArray(body.models)) return body.models.map((m: any) => m.id || m.name || "").filter(Boolean);
    return [];
  } finally { clearTimeout(timer); }
}

// ── Resolution ──

export function resolveLatestModels(modelIds: string[], providerId: string, strategy?: string): Record<string, string> {
  const extract = resolveStrategy(providerId, strategy);
  const sm = new Map<string, { modelId: string; version: number[] }>();
  for (const id of modelIds) {
    const info = extract(id); if (!info) continue;
    const ex = sm.get(info.series);
    if (!ex || compareVersions(info.version, ex.version) > 0) sm.set(info.series, { modelId: id, version: info.version });
  }
  const result: Record<string, string> = {};
  for (const [s, e] of sm) result[s] = e.modelId;
  return result;
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) { const av = a[i] || 0; const bv = b[i] || 0; if (av !== bv) return av - bv; }
  return 0;
}

// ── Main API ──

export interface FetchLatestModelsOptions extends FetchOpts {
  ttlMs?: number;
  force?: boolean;
  cache?: ReturnType<typeof createVersionCache>;
  masterToggle?: boolean;
}

export interface FetchLatestModelsResult {
  latest: Record<string, Record<string, string>>;
  fetched: string[];
  errors: { providerId: string; error: string }[];
  fromCache: boolean;
}

export async function fetchLatestModels(configs: ProviderVersionConfig[], opts: FetchLatestModelsOptions = {}): Promise<FetchLatestModelsResult> {
  const { ttlMs = DEFAULT_TTL_MS, force = false, cache = defaultCache, masterToggle = true, ...fOpts } = opts;
  const latest: Record<string, Record<string, string>> = {};
  const fetched: string[] = [];
  const errors: { providerId: string; error: string }[] = [];
  let fromCache = false;

  for (const config of configs) {
    if (config.autoUpdateEnabled === false) continue;
    if (!masterToggle && config.autoUpdateEnabled !== true) continue;
    const pid = config.providerId;
    try {
      if (!force && !cache.isExpired(pid, ttlMs)) {
        const cached = cache.get(pid);
        if (cached) { latest[pid] = cached.latestBySeries; fetched.push(pid); fromCache = true; continue; }
      }
      const ids = await fetchProviderModels(config, fOpts);
      const bySeries = resolveLatestModels(ids, pid, config.strategy);
      cache.set(pid, { modelIds: ids, latestBySeries: bySeries, fetchedAt: new Date().toISOString() });
      latest[pid] = bySeries; fetched.push(pid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const cached = cache.get(pid);
      if (cached) { latest[pid] = cached.latestBySeries; fetched.push(pid); }
      errors.push({ providerId: pid, error: msg });
    }
  }
  return { latest, fetched, errors, fromCache };
}

export function resolveTopModel(latestBySeries: Record<string, string>, modelIds: string[]): string | null {
  const entries = Object.entries(latestBySeries);
  if (entries.length === 0) return modelIds.length > 0 ? modelIds[modelIds.length - 1] : null;
  let best: string | null = null; let bestV: number[] = [];
  for (const [, modelId] of entries) {
    const info = defaultStrategy(modelId);
    if (info && compareVersions(info.version, bestV) > 0) { bestV = info.version; best = modelId; }
  }
  return best || entries[0][1];
}

export function formatModelLabel(series: string, modelId: string): string {
  const sl = series.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return `${sl} -> ${modelId}`;
}
