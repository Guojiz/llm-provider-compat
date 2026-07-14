/**
 * auth/types.ts — Provider authentication types
 *
 * Supports two auth methods:
 *   - api: standard API key with optional metadata (resourceName, etc.)
 *   - oauth: device-code OAuth flow with authorize → callback
 *
 * Each provider can declare multiple auth methods. Login prompts
 * can collect additional info (text input or select dropdown).
 *
 * @license MIT
 */

// ── Auth Method Types ──

export type AuthMethodType = "oauth" | "api";

export interface TextPrompt {
  type: "text";
  key: string;
  message: string;
  placeholder?: string;
  validate?: (value: string) => string | undefined;
  when?: { key: string; op: "eq" | "neq"; value: string };
}

export interface SelectPrompt {
  type: "select";
  key: string;
  message: string;
  options: { label: string; value: string; hint?: string }[];
  when?: { key: string; op: "eq" | "neq"; value: string };
}

export type AuthPrompt = TextPrompt | SelectPrompt;

export interface AuthMethod {
  type: AuthMethodType;
  label: string;
  prompts?: AuthPrompt[];
}

// ── OAuth Flow ──

export interface OAuthAuthorization {
  url: string;
  method: "auto" | "code";
  instructions: string;
}

export interface OAuthResult {
  url: string;
  method: "auto" | "code";
  instructions: string;
  authorize: () => Promise<OAuthResult>;
  callback: (code?: string) => Promise<OAuthCredentials>;
}

export interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  accountId?: string;
  metadata?: Record<string, string>;
}

// ── API Key Auth ──

export interface ApiKeyAuth {
  key: string;
  metadata?: Record<string, string>;
}

// ── Unified Auth ──

export type AuthInfo =
  | { type: "api"; key: string; metadata?: Record<string, string> }
  | { type: "oauth"; access: string; refresh?: string; expiresAt?: number; accountId?: string; metadata?: Record<string, string> };

// ── Provider Auth Config ──

export interface ProviderAuthConfig {
  /** Provider ID this auth config belongs to */
  providerId: string;
  /** Available auth methods */
  methods: AuthMethod[];
  /** Start OAuth authorize flow (returns URL for user to open) */
  authorize?: (input: { method: number; inputs?: Record<string, string> }) => Promise<OAuthAuthorization>;
  /** Complete OAuth callback after user authorizes */
  callback?: (input: { method: number; code?: string }) => Promise<OAuthCredentials>;
}
