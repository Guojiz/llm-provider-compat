/**
 * Agnes AI provider compatibility layer.
 * @license MIT
 */
const THINKING_FIELDS = ["reasoning_effort", "thinking", "reasoning", "enable_thinking", "chat_template_kwargs"];
const THINKING_MSG = ["reasoning_content", "reasoning", "thinking"];
const THINKING_BLOCKS = new Set(["thinking", "reasoning"]);
const hasOwn = (o: any, k: string) => Object.prototype.hasOwnProperty.call(o, k);
function lower(v: unknown): string { return typeof v === "string" ? v.trim().toLowerCase() : ""; }

function baseHost(m: any): string {
  const r = m?.baseUrl || m?.base_url;
  if (typeof r !== "string" || r.trim().length === 0) return "";
  try { return new URL(r.trim()).hostname.toLowerCase(); } catch {
    try { return new URL("https://"+r.trim()).hostname.toLowerCase(); } catch { return lower(r).split(/[/?#]/)[0].replace(/:\d+$/, ""); }
  }
}

export function matches(model: any): boolean {
  if (!model || typeof model !== "object") return false;
  if (lower(model.provider) === "agnes") return true;
  const h = baseHost(model);
  return h === "agnes-ai.com" || h.endsWith(".agnes-ai.com");
}

function stripBlocks(c: any): { content: any; changed: boolean } {
  if (!Array.isArray(c)) return { content: c, changed: false };
  let ch = false; const n: any[] = [];
  for (const b of c) { if (b && typeof b === "object" && (THINKING_BLOCKS.has(lower(b.type)) || hasOwn(b, "reasoning_content") || hasOwn(b, "thinking"))) { ch = true; continue; } n.push(b); }
  return ch ? { content: n, changed: true } : { content: c, changed: false };
}

function stripMsg(m: any): { message: any; changed: boolean } {
  if (!m || typeof m !== "object" || Array.isArray(m)) return { message: m, changed: false };
  let ch = false; const n = { ...m };
  for (const f of THINKING_MSG) { if (hasOwn(n, f)) { delete n[f]; ch = true; } }
  const sb = stripBlocks(m.content);
  if (sb.changed) { n.content = sb.content; ch = true; }
  return ch ? { message: n, changed: true } : { message: m, changed: false };
}

export function apply(payload: any): any {
  if (!payload || typeof payload !== "object") return payload;
  let ch = false; const n = { ...payload };
  for (const f of THINKING_FIELDS) { if (hasOwn(n, f)) { delete n[f]; ch = true; } }
  if (Array.isArray(payload.messages)) {
    let mc = false;
    const ms = payload.messages.map((m: any) => { const s = stripMsg(m); if (s.changed) mc = true; return s.message; });
    if (mc) { n.messages = ms; ch = true; }
  }
  return ch ? n : payload;
}
