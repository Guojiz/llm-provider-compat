/**
 * OpenAI-compatible video_url compatibility layer.
 * @license MIT
 */
import { MODEL_VIDEO_TRANSPORTS, resolveModelVideoInputTransport } from "../model-capabilities.ts";

export function matches(model: any): boolean {
  return resolveModelVideoInputTransport(model) === MODEL_VIDEO_TRANSPORTS.OPENAI_VIDEO_URL;
}

export function apply(payload: any): any { return normalizeOpenAIVideoUrlPayload(payload); }

export function normalizeOpenAIVideoUrlPayload(payload: any): any {
  if (!Array.isArray(payload?.messages)) return payload;
  let changed = false;
  const messages = payload.messages.map((message: any) => {
    if (!Array.isArray(message?.content)) return message;
    let cc = false;
    const content = message.content.map((part: any) => {
      const url = getDataVideoUrl(part);
      if (!url) return part;
      const { image_url, imageUrl, video_url, ...rest } = part;
      cc = true;
      return { ...rest, type: "video_url", video_url: { ...(video_url && typeof video_url === "object" && !Array.isArray(video_url) ? video_url : {}), url } };
    });
    if (!cc) return message;
    changed = true;
    return { ...message, content };
  });
  return changed ? { ...payload, messages } : payload;
}

function getDataVideoUrl(part: any): string | null {
  if (!part || typeof part !== "object") return null;
  if (part.type !== "image_url") return null;
  const url = part.image_url?.url ?? part.imageUrl?.url;
  return typeof url === "string" && url.toLowerCase().startsWith("data:video/") ? url : null;
}
