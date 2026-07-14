/**
 * tool-pairing.ts — Orphan toolResult pairing guard (provider-agnostic)
 *
 * Strips orphan role:"tool" messages whose parent tool_calls were dropped
 * by SDK transform-messages, preventing OpenAI-compatible 400 errors.
 *
 * @license MIT
 */

const hasOwn = (obj: any, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

function isToolResult(m: any): boolean { return Boolean(m) && typeof m === "object" && m.role === "tool"; }
function isAssistant(m: any): boolean { return Boolean(m) && typeof m === "object" && m.role === "assistant"; }

function collectIds(assistant: any, into: Set<string>): void {
  const tc = assistant.tool_calls;
  if (!Array.isArray(tc)) return;
  for (const c of tc) { if (c && typeof c === "object" && typeof c.id === "string" && c.id.length > 0) into.add(c.id); }
}

export function stripOrphanToolResults(messages: any[]): any[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const declared = new Set<string>();
  let hasOrphan = false;
  for (const m of messages) {
    if (isAssistant(m)) { collectIds(m, declared); continue; }
    if (isToolResult(m)) {
      const id = hasOwn(m, "tool_call_id") ? m.tool_call_id : undefined;
      if (typeof id !== "string" || !declared.has(id)) { hasOrphan = true; break; }
    }
  }
  if (!hasOrphan) return messages;
  declared.clear();
  const result: any[] = [];
  for (const m of messages) {
    if (isAssistant(m)) { collectIds(m, declared); result.push(m); continue; }
    if (isToolResult(m)) {
      const id = hasOwn(m, "tool_call_id") ? m.tool_call_id : undefined;
      if (typeof id === "string" && declared.has(id)) result.push(m);
      continue;
    }
    result.push(m);
  }
  return result;
}
