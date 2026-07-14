/**
 * auth/providers/xai.ts — xAI (Grok) OAuth 2.0 device-code flow
 *
 * Full OAuth 2.0 device authorization grant for xAI Grok CLI access.
 * Uses OpenID Connect discovery from auth.x.ai.
 *
 * Flow: discover endpoints → request device code → user opens verification URL
 * → poll token endpoint → return credentials with auto-refresh
 *
 * @license MIT
 */

// ── Constants ──

export const XAI_OAUTH_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
export const XAI_OAUTH_DISCOVERY_URL = "https://auth.x.ai/.well-known/openid-configuration";
export const XAI_OAUTH_SCOPES = "openid profile email offline_access grok-cli:access api:access";
export const XAI_OAUTH_RESOURCE_URL = "https://cli-chat-proxy.grok.com/v1";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_TIMER_MS = 2_147_483_647;

// ── Types ──

export interface XaiOAuthCredentials {
  access: string;
  refresh: string;
  expires: number;
  tokenEndpoint: string;
  idToken?: string;
}

export interface XaiDeviceCode {
  userCode: string;
  verificationUri: string;
  intervalSeconds: number;
  expiresInSeconds: number;
}

export interface XaiOAuthDriverOptions {
  fetchImpl?: typeof globalThis.fetch;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

// ── Helpers ──

function abortError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) return signal.reason;
  const e = new Error("xAI OAuth aborted");
  e.name = "AbortError";
  return e;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(abortError(signal)); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function positiveSeconds(value: unknown): number | null {
  const s = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof s === "number" && Number.isFinite(s) && s > 0 && s * 1000 <= MAX_TIMER_MS ? s : null;
}

function trustedEndpoint(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`xAI OAuth discovery missing ${label}`);
  let u: URL;
  try { u = new URL(value); } catch { throw new Error(`xAI OAuth discovery invalid ${label}`); }
  if (u.protocol !== "https:" || u.hostname !== "auth.x.ai" || u.port || u.username || u.password || u.hash) {
    throw new Error(`xAI OAuth discovery untrusted ${label}`);
  }
  return u.toString();
}

function trustedUserUrl(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`xAI OAuth missing ${label}`);
  let u: URL;
  try { u = new URL(value); } catch { throw new Error(`xAI OAuth invalid ${label}`); }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || (host !== "x.ai" && !host.endsWith(".x.ai")) || u.port || u.username || u.password) {
    throw new Error(`xAI OAuth unsafe ${label}`);
  }
  return u.toString();
}

async function readJson(res: Response, label: string): Promise<Record<string, unknown>> {
  let p: unknown;
  try { p = await res.json(); } catch { throw new Error(`xAI OAuth ${label} invalid JSON`); }
  if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error(`xAI OAuth ${label} invalid payload`);
  return p as Record<string, unknown>;
}

function formBody(v: Record<string, string>): string { return new URLSearchParams(v).toString(); }
function formReq(body: string, signal?: AbortSignal): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal };
}

function jwtExpiry(accessToken: string): number | null {
  const parts = accessToken.split(".");
  if (parts.length < 2) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    return typeof p?.exp === "number" && Number.isFinite(p.exp) ? p.exp * 1000 : null;
  } catch { return null; }
}

function tokenExpiry(payload: Record<string, unknown>, accessToken: string, now: () => number): number {
  const exp = positiveSeconds(payload.expires_in);
  if (exp !== null) return now() + exp * 1000;
  const jwt = jwtExpiry(accessToken);
  if (jwt !== null && jwt > now()) return jwt;
  throw new Error("xAI OAuth token response missing valid expiration");
}

function oauthError(payload: Record<string, unknown>, fallback: string): string {
  const code = typeof payload.error === "string" ? payload.error : "";
  const desc = typeof payload.error_description === "string" ? payload.error_description : "";
  if (code && desc) return `${code}: ${desc}`;
  return code || desc || fallback;
}

function buildCreds(
  payload: Record<string, unknown>,
  opts: { now: () => number; tokenEndpoint: string; prevRefresh?: string; requireRefresh: boolean },
): XaiOAuthCredentials {
  if (typeof payload.access_token !== "string" || !payload.access_token) throw new Error("xAI OAuth missing access_token");
  const refresh = typeof payload.refresh_token === "string" && payload.refresh_token
    ? payload.refresh_token : opts.prevRefresh;
  if (opts.requireRefresh && !refresh) throw new Error("xAI OAuth missing refresh_token");
  if (!refresh) throw new Error("xAI OAuth no usable refresh token");
  return {
    access: payload.access_token,
    refresh,
    expires: tokenExpiry(payload, payload.access_token, opts.now),
    tokenEndpoint: opts.tokenEndpoint,
    ...(typeof payload.id_token === "string" && payload.id_token ? { idToken: payload.id_token } : {}),
  };
}

// ── Core Implementation ──

export function createXaiOAuthProvider(opts: XaiOAuthDriverOptions = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const now = opts.now || Date.now;
  const sleep = opts.sleep || defaultSleep;

  if (typeof fetchImpl !== "function") throw new Error("xAI OAuth requires fetch implementation");

  async function discover(signal?: AbortSignal) {
    throwIfAborted(signal);
    const res = await fetchImpl(XAI_OAUTH_DISCOVERY_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const p = await readJson(res, "discovery") as Record<string, unknown>;
    if (!res.ok) throw new Error(`xAI OAuth discovery HTTP ${res.status}`);
    return {
      deviceEndpoint: trustedEndpoint(p.device_authorization_endpoint, "device_authorization_endpoint"),
      tokenEndpoint: trustedEndpoint(p.token_endpoint, "token_endpoint"),
    };
  }

  async function postToken(endpoint: string, values: Record<string, string>, signal?: AbortSignal) {
    throwIfAborted(signal);
    const res = await fetchImpl(endpoint, formReq(formBody(values), signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS)));
    const p = await readJson(res, "token") as Record<string, unknown>;
    return { res, p };
  }

  return {
    name: "xAI Grok (OAuth)",

    /** Start device-code login. Returns device code for user to enter in browser. */
    async login(callbacks: {
      signal?: AbortSignal;
      onDeviceCode: (code: XaiDeviceCode) => void;
    }): Promise<XaiOAuthCredentials> {
      const signal = callbacks.signal;
      const { deviceEndpoint, tokenEndpoint } = await discover(signal);

      const devRes = await fetchImpl(deviceEndpoint, formReq(formBody({
        client_id: XAI_OAUTH_CLIENT_ID,
        scope: XAI_OAUTH_SCOPES,
      }), signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS)));
      const dev = await readJson(devRes, "device auth") as Record<string, unknown>;
      if (!devRes.ok) throw new Error(`xAI OAuth device auth failed: ${oauthError(dev, `HTTP ${devRes.status}`)}`);

      const deviceCode = typeof dev.device_code === "string" ? dev.device_code : "";
      const userCode = typeof dev.user_code === "string" ? dev.user_code : "";
      const rawUri = typeof dev.verification_uri === "string" ? dev.verification_uri
        : typeof dev.verification_url === "string" ? dev.verification_url : "";
      const expiresIn = positiveSeconds(dev.expires_in);
      const interval = dev.interval === undefined ? 5 : positiveSeconds(dev.interval);
      if (!deviceCode || !userCode || !rawUri || expiresIn === null || interval === null) {
        throw new Error("xAI OAuth device auth response incomplete");
      }
      const verificationUri = trustedUserUrl(rawUri, "verification_uri");
      callbacks.onDeviceCode({ userCode, verificationUri, intervalSeconds: interval, expiresInSeconds: expiresIn });

      let currentInterval = interval;
      const deadline = now() + expiresIn * 1000;
      while (now() < deadline) {
        await sleep(currentInterval * 1000, signal);
        throwIfAborted(signal);
        if (now() >= deadline) break;
        const { res, p } = await postToken(tokenEndpoint, {
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: deviceCode, client_id: XAI_OAUTH_CLIENT_ID,
        }, signal);
        if (res.ok && !p.error) {
          return buildCreds(p, { now, tokenEndpoint, requireRefresh: true });
        }
        const ec = typeof p.error === "string" ? p.error : "";
        if (ec === "authorization_pending") continue;
        if (ec === "slow_down") { currentInterval = positiveSeconds(currentInterval + 5) || currentInterval; continue; }
        if (ec === "access_denied" || ec === "authorization_denied") throw new Error("xAI OAuth denied");
        if (ec === "expired_token") throw new Error("xAI OAuth device code expired");
        throw new Error(`xAI OAuth token exchange: ${oauthError(p, `HTTP ${res.status}`)}`);
      }
      throwIfAborted(signal);
      throw new Error("xAI OAuth device code expired");
    },

    /** Refresh an existing access token. */
    async refreshToken(creds: XaiOAuthCredentials): Promise<XaiOAuthCredentials> {
      if (typeof creds.refresh !== "string" || !creds.refresh) throw new Error("xAI OAuth missing refresh token");
      const endpoint = creds.tokenEndpoint ? trustedEndpoint(creds.tokenEndpoint, "cached token_endpoint") : (await discover()).tokenEndpoint;
      const { res, p } = await postToken(endpoint, {
        grant_type: "refresh_token", refresh_token: creds.refresh, client_id: XAI_OAUTH_CLIENT_ID,
      });
      if (!res.ok || p.error) throw new Error(`xAI OAuth refresh failed: ${oauthError(p, `HTTP ${res.status}`)}`);
      return buildCreds(p, { now, tokenEndpoint: endpoint, prevRefresh: creds.refresh, requireRefresh: false });
    },

    getApiKey(creds: XaiOAuthCredentials): string { return creds.access; },
  };
}

/** Pre-built xAI OAuth provider instance (uses global fetch + Date.now). */
export const xaiOAuthProvider = createXaiOAuthProvider();
