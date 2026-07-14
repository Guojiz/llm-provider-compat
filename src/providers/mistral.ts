/**
 * Mistral / Devstral provider compatibility layer.
 *
 * Handles:
 *   - provider === "mistral" or baseUrl contains "api.mistral.ai"
 *   - Devstral endpoints (api.devstral.ai)
 *
 * Protocol requirements:
 *   1. Tool call IDs must be exactly 9 alphanumeric characters
 *   2. Synthetic assistant message injection between tool→user transitions
 *      (Mistral requires alternating user/assistant pattern)
 *
 * Deletion condition:
 *   - Mistral relaxes tool call ID length/format requirements
 *   - Mistral handles tool→user transitions without synthetic assistant
 *
 * @license MIT
 */

const hasOwn = (obj: any, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

function lower(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function baseHost(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) return "";
  const text = value.trim();
  try { return new URL(text).hostname.toLowerCase(); } catch {
    try { return new URL(`https://${text}`).hostname.toLowerCase(); } catch {
      return text.toLowerCase().split(/[/?#]/)[0].replace(/:\d+$/, "");
    }
  }
}

export function matches(model: any): boolean {
  if (!model || typeof model !== "object") return false;
  const provider = lower(model.provider);
  if (provider === "mistral" || provider === "devstral") return true;
  const host = baseHost(model.baseUrl || model.base_url);
  return host === "api.mistral.ai"
    || host.endsWith(".mistral.ai")
    || host === "api.devstral.ai"
    || host.endsWith(".devstral.ai");
}

// ── Tool call ID normalization (9-char alphanumeric) ──

const ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomAlphanumeric(length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  }
  return result;
}

function isNineCharAlphanumeric(id: unknown): boolean {
  return typeof id === "string" && id.length === 9 && /^[a-z0-9]+$/i.test(id);
}

function normalizeToolCallId(id: unknown): string {
  if (isNineCharAlphanumeric(id)) return id as string;
  if (typeof id !== "string" || id.length === 0) return randomAlphanumeric(9);
  // Hash the original ID into a 9-char ID
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  let result = "";
  const absHash = Math.abs(hash);
  for (let i = 0; i < 9; i++) {
    result += ALPHA[(absHash + i * 7) % ALPHA.length];
  }
  return result;
}

function normalizeToolCallIds(payload: any): any {
  if (!Array.isArray(payload.messages)) return payload;

  // Build ID mapping first
  const idMap = new Map<string, string>();

  let changed = false;
  const messages = payload.messages.map((message: any) => {
    if (!message || typeof message !== "object" || message.role !== "assistant") return message;
    if (!Array.isArray(message.tool_calls)) return message;

    let msgChanged = false;
    const toolCalls = message.tool_calls.map((tc: any) => {
      if (isNineCharAlphanumeric(tc.id)) return tc;
      const origId = tc.id;
      const newId = normalizeToolCallId(origId);
      if (origId) idMap.set(String(origId), newId);
      msgChanged = true;
      return { ...tc, id: newId };
    });

    if (!msgChanged) return message;
    changed = true;
    return { ...message, tool_calls: toolCalls };
  });

  if (!changed) return payload;

  // Update matching tool results
  const finalMessages = messages.map((message: any) => {
    if (!message || typeof message !== "object" || message.role !== "tool") return message;
    if (!hasOwn(message, "tool_call_id")) return message;
    const mapped = idMap.get(String(message.tool_call_id));
    if (!mapped) return message;
    return { ...message, tool_call_id: mapped };
  });

  return { ...payload, messages: finalMessages };
}

// ── Synthetic assistant injection ──

function needsSyntheticAssistant(messages: any[], index: number): boolean {
  // Check if current is user and previous is tool (violates Mistral's alternating pattern)
  if (index === 0) return false;
  const prev = messages[index - 1];
  return prev?.role === "tool";
}

function injectSyntheticAssistants(payload: any): any {
  if (!Array.isArray(payload.messages)) return payload;

  let changed = false;
  const result: any[] = [];

  for (let i = 0; i < payload.messages.length; i++) {
    const message = payload.messages[i];
    if (message?.role === "user" && needsSyntheticAssistant(payload.messages, i)) {
      result.push({ role: "assistant", content: "" });
      changed = true;
    }
    result.push(message);
  }

  return changed ? { ...payload, messages: result } : payload;
}

// ── apply ──

export function apply(payload: any, model: any, options: any = {}): any {
  if (!payload || typeof payload !== "object") return payload;
  if (!Array.isArray(payload.messages)) return payload;

  let next = normalizeToolCallIds(payload);
  next = injectSyntheticAssistants(next);

  return next;
}
