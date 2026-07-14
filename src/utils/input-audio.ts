/**
 * OpenAI-compatible input_audio helper.
 * @license MIT
 */

const FORMATS: Record<string, string> = {
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav",
  "audio/mpeg": "mp3", "audio/mp3": "mp3",
  "audio/mp4": "mp4", "audio/mp4a-latm": "mp4", "audio/aac": "mp4", "audio/x-m4a": "mp4",
  "audio/ogg": "ogg", "audio/webm": "webm", "audio/flac": "flac",
  "audio/pcm": "pcm16", "audio/l16": "pcm16", "audio/x-pcm": "pcm16",
};

function fmt(mime: string): string | null {
  const n = (mime || "").toLowerCase().split(";")[0].trim();
  return n ? FORMATS[n] || null : null;
}

export function normalizeOpenAIInputAudioPayload(payload: any): any {
  if (!Array.isArray(payload?.messages)) return payload;
  let changed = false;
  const messages = payload.messages.map((msg: any) => {
    if (!Array.isArray(msg?.content)) return msg;
    let cc = false;
    const content = msg.content.map((part: any) => {
      const a = getAudio(part);
      if (!a) return part;
      const { image_url, imageUrl, data, mimeType, mime, ...rest } = part;
      cc = true;
      return { ...rest, type: "input_audio", input_audio: { data: a.data, format: a.format } };
    });
    if (!cc) return msg;
    changed = true;
    return { ...msg, content };
  });
  return changed ? { ...payload, messages } : payload;
}

function getAudio(part: any): { data: string; format: string } | null {
  if (!part || typeof part !== "object") return null;
  if (part.type === "input_audio") return null;
  if (part.type === "audio") return parseBlock(part);
  if (part.type !== "image_url") return null;
  const url = part.image_url?.url ?? part.imageUrl?.url;
  return typeof url === "string" ? parseDataUrl(url) : null;
}

function parseBlock(p: any): { data: string; format: string } | null {
  const m = p.mimeType || p.mime || "audio/wav";
  const f = fmt(m);
  if (!f) throw new Error(`unsupported input_audio format: ${m}`);
  if (typeof p.data !== "string") throw new Error("input_audio data must be base64 string");
  return { data: p.data, format: f };
}

function parseDataUrl(url: string): { data: string; format: string } | null {
  if (!url.toLowerCase().startsWith("data:audio/")) return null;
  const comma = url.indexOf(",");
  if (comma < 0) throw new Error("input_audio data URL must include base64 payload");
  const meta = url.slice(5, comma).toLowerCase();
  if (!meta.includes(";base64")) throw new Error("input_audio data URL must be base64 encoded");
  const f = fmt(meta.split(";")[0]);
  if (!f) throw new Error(`unsupported input_audio format: ${meta.split(";")[0]}`);
  return { data: url.slice(comma + 1), format: f };
}
