/**
 * reasoning-content-replay.ts — Reasoning content extraction, validation, and replay
 * Shared by DeepSeek, Zhipu, Kimi, MiMo provider sub-modules.
 *
 * @license MIT
 */

const hasOwn = (obj: any, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

function hasToolCalls(m: any): boolean { return Array.isArray(m?.tool_calls) && m.tool_calls.length > 0; }
function nonEmptyStr(v: unknown): boolean { return typeof v === "string" && v.trim().length > 0; }
function hasReasoningContent(m: any): boolean { return hasOwn(m, "reasoning_content") && typeof m.reasoning_content === "string"; }

function normContent(c: any): string {
  if (typeof c === "string") return c;
  if (c === null || c === undefined) return "";
  if (!Array.isArray(c)) return "";
  return c.filter((b: any) => b && b.type === "text" && typeof b.text === "string").map((b: any) => b.text).join("");
}

export function extractReasoningFromContent(message: any): string {
  if (!message || typeof message !== "object") return "";
  const c = message.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c) || c.length === 0) return "";
  for (const b of c) { if (b && b.type === "thinking" && typeof b.thinking === "string") return b.thinking; }
  const first = c[0];
  if (first && first.type === "text" && typeof first.text === "string") return first.text;
  return "";
}

export function ensureReasoningContentForToolCalls(messages: any[], opts: { providerLabel?: string } = {}): any[] {
  if (!Array.isArray(messages)) return messages;
  const label = opts.providerLabel || "Provider";
  const errMsg = `${label} thinking mode reasoning_content is missing for tool_calls history. Compact this session or start a new session before continuing with ${label} thinking mode.`;
  let changed = false;
  const next = messages.map((m: any) => {
    if (!m || typeof m !== "object" || m.role !== "assistant") return m;
    if (!hasToolCalls(m)) return m;
    if (hasReasoningContent(m)) return m;
    const recovered = extractReasoningFromContent(m);
    if (!nonEmptyStr(recovered)) throw new Error(errMsg);
    changed = true;
    return { ...m, reasoning_content: recovered };
  });
  return changed ? next : messages;
}

export function isReasoningReplayUnavailable(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || "");
  return msg.includes("reasoning_content is missing for tool_calls history");
}

export function ensureAssistantContentForToolCalls(messages: any[]): any[] {
  if (!Array.isArray(messages)) return messages;
  let changed = false;
  const next = messages.map((m: any) => {
    if (!m || typeof m !== "object" || m.role !== "assistant") return m;
    if (!hasToolCalls(m)) return m;
    const c = normContent(m.content);
    if (m.content === c) return m;
    changed = true;
    return { ...m, content: c };
  });
  return changed ? next : messages;
}

export function stripReasoningContent(messages: any[]): any[] {
  if (!Array.isArray(messages)) return messages;
  let changed = false;
  const next = messages.map((m: any) => {
    if (!m || typeof m !== "object" || !hasOwn(m, "reasoning_content")) return m;
    changed = true;
    const copy = { ...m };
    delete copy.reasoning_content;
    return copy;
  });
  return changed ? next : messages;
}
