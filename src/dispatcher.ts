/**
 * dispatcher.ts — LLM HTTP payload compatibility layer (sole external entry point)
 *
 * Architecture: dispatcher + sub-modules. All provider-specific patches are
 * split into ./providers/<name>.ts.
 *
 * This file only contains:
 *   1. Dispatcher (first-match-wins across provider sub-modules)
 *   2. Provider-agnostic common patches
 *   3. Protocol identification functions — exported for external consumers
 *
 * DO NOT add provider-specific implementation details here.
 * New providers go in ./providers/<name>.ts.
 *
 * @license MIT
 */

import * as deepseek from "./providers/deepseek.ts";
import * as kimi from "./providers/kimi.ts";
import * as mimo from "./providers/mimo.ts";
import * as qwen from "./providers/qwen.ts";
import * as zhipu from "./providers/zhipu.ts";
import * as volcengine from "./providers/volcengine.ts";
import * as longcat from "./providers/longcat.ts";
import * as agnes from "./providers/agnes.ts";
import * as mistral from "./providers/mistral.ts";
import * as openaiInputAudio from "./providers/openai-input-audio.ts";
import * as openaiVideoUrl from "./providers/openai-video-url.ts";
import * as openrouter from "./providers/openrouter.ts";
import * as anthropic from "./providers/anthropic.ts";
import * as codexResponses from "./providers/codex-responses.ts";
import { normalizeImplicitOutputBudget } from "./utils/output-budget.ts";
import { stripOrphanToolResults } from "./utils/tool-pairing.ts";
import { normalizeOpenAIInputAudioPayload } from "./utils/input-audio.ts";
import {
  MODEL_AUDIO_TRANSPORTS,
  resolveModelAudioInputTransport,
} from "./model-capabilities.ts";
import {
  getReasoningProfile as getDeclaredReasoningProfile,
  getThinkingFormat as getDeclaredThinkingFormat,
} from "./model-capabilities.ts";

interface ProviderModule {
  matches(model: any): boolean;
  apply(payload: any, model: any, options?: any): any;
  normalizeContextMessages?(messages: any[], model: any, options?: any): any[];
}

const PROVIDER_MODULES: ProviderModule[] = [
  deepseek, kimi, mimo, mistral, qwen, zhipu, volcengine, longcat, agnes,
  openaiInputAudio, openaiVideoUrl, openrouter, anthropic, codexResponses,
];

function lower(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

export function isDeepSeekModel(model: any): boolean {
  return deepseek.matches(model);
}

export function isAnthropicModel(model: any): boolean {
  if (!model || typeof model !== "object") return false;
  return lower(model.provider) === "anthropic" || getThinkingFormat(model) === "anthropic";
}

export function getThinkingFormat(model: any): string | null {
  const declared = getDeclaredThinkingFormat(model);
  if (declared) return declared;
  if (isDeepSeekModel(model)) return "deepseek";
  if (zhipu.matches(model)) return "zhipu";
  if (volcengine.matches(model)) return "volcengine";
  if (longcat.matches(model)) return "longcat";
  return null;
}

export function getReasoningProfile(model: any): string | null {
  return getDeclaredReasoningProfile(model);
}

// ── Provider-agnostic payload processing ──

function stripEmptyTools(payload: Record<string, any>): Record<string, any> {
  if (Array.isArray(payload.tools) && payload.tools.length === 0) {
    const { tools, ...rest } = payload;
    return rest;
  }
  return payload;
}

function stripIncompatibleThinking(payload: Record<string, any>, model: any): Record<string, any> {
  if (!payload.thinking) return payload;
  if (!model) return payload;
  const tf = getThinkingFormat(model);
  if (tf === "anthropic" || tf === "deepseek" || tf === "zhipu" || tf === "kimi" || tf === "volcengine" || tf === "longcat") return payload;
  const { thinking, ...rest } = payload;
  return rest;
}

function stripDisabledReasoningEffort(payload: Record<string, any>): Record<string, any> {
  if (!Object.prototype.hasOwnProperty.call(payload, "reasoning_effort")) return payload;
  const v = payload.reasoning_effort;
  if (v === false || v == null) { const { reasoning_effort, ...rest } = payload; return rest; }
  const n = lower(v);
  if (n === "" || n === "none" || n === "off" || n === "disabled") { const { reasoning_effort, ...rest } = payload; return rest; }
  return payload;
}

function stripOrphanToolMessages(payload: Record<string, any>): Record<string, any> {
  if (!Array.isArray(payload.messages)) return payload;
  const repaired = stripOrphanToolResults(payload.messages);
  return repaired === payload.messages ? payload : { ...payload, messages: repaired };
}

const ATTACHED_MEDIA_MARKER_RE: Record<string, RegExp> = {
  image: /\[attached_image:\s*[^\]]+\]\n?/g,
  video: /\[attached_video:\s*[^\]]+\]\n?/g,
  audio: /\[attached_audio:\s*[^\]]+\]\n?/g,
};

function stripNativeMediaAttachmentMarkers(payload: Record<string, any>): Record<string, any> {
  if (!Array.isArray(payload.messages)) return payload;
  let changed = false;
  const messages = payload.messages.map((message: any) => {
    if (!Array.isArray(message?.content)) return message;
    const mediaKinds = new Set<string>();
    for (const part of message.content) {
      if (!part || typeof part !== "object") continue;
      if (part.type === "input_audio" || part.type === "audio") mediaKinds.add("audio");
      else if (part.type === "input_image" || part.type === "image") mediaKinds.add("image");
      else if (part.type === "video" || part.type === "video_url") mediaKinds.add("video");
      else if (part.type === "image_url") {
        const url = part.image_url?.url ?? part.imageUrl?.url;
        if (typeof url === "string") {
          const n = url.toLowerCase();
          if (n.startsWith("data:image/")) mediaKinds.add("image");
          else if (n.startsWith("data:audio/")) mediaKinds.add("audio");
          else if (n.startsWith("data:video/")) mediaKinds.add("video");
        }
      }
    }
    if (mediaKinds.size === 0) return message;
    let contentChanged = false;
    const content = message.content.map((part: any) => {
      if (!part || typeof part !== "object" || part.type !== "text" || typeof part.text !== "string") return part;
      let nextText = part.text;
      for (const kind of mediaKinds) nextText = nextText.replace(ATTACHED_MEDIA_MARKER_RE[kind], "");
      nextText = nextText.replace(/\n{3,}/g, "\n\n").trim();
      if (nextText === part.text) return part;
      contentChanged = true;
      return { ...part, text: nextText };
    });
    if (!contentChanged) return message;
    changed = true;
    return { ...message, content };
  });
  return changed ? { ...payload, messages } : payload;
}

function normalizeAudioTransportPayload(payload: Record<string, any>, model: any): Record<string, any> {
  const transport = resolveModelAudioInputTransport(model);
  if (transport === MODEL_AUDIO_TRANSPORTS.MIMO_INPUT_AUDIO || transport === MODEL_AUDIO_TRANSPORTS.OPENAI_INPUT_AUDIO) {
    return normalizeOpenAIInputAudioPayload(payload);
  }
  return payload;
}

function resourceMetadataValue(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value : "(none)";
}

function formatEmbeddedResourceText(resource: any, body: string): string {
  return [
    "[embedded resource]",
    `uri: ${resourceMetadataValue(resource?.uri)}`,
    `name: ${resourceMetadataValue(resource?.name)}`,
    `mimeType: ${resourceMetadataValue(resource?.mimeType)}`,
    "", body,
  ].join("\n");
}

function projectResourceBlockToText(block: any): { block: any; changed: boolean } {
  if (!block || typeof block !== "object" || block.type !== "resource") return { block, changed: false };
  const resource = block.resource && typeof block.resource === "object" ? block.resource : null;
  if (typeof resource?.text === "string") {
    return { block: { type: "text", text: formatEmbeddedResourceText(resource, `content:\n${resource.text}`) }, changed: true };
  }
  const reason = typeof resource?.blob === "string"
    ? "content: [binary resource omitted; no model-visible text was provided]"
    : "content: [resource has no text content]";
  return { block: { type: "text", text: formatEmbeddedResourceText(resource, reason) }, changed: true };
}

function projectToolResultResourcesForModel(messages: any[]): any[] {
  let changed = false;
  const next = messages.map((message: any) => {
    if (message?.role !== "toolResult" || !Array.isArray(message?.content)) return message;
    let contentChanged = false;
    const nextContent = message.content.map((block: any) => {
      const p = projectResourceBlockToText(block);
      if (p.changed) contentChanged = true;
      return p.block;
    });
    if (!contentChanged) return message;
    changed = true;
    return { ...message, content: nextContent };
  });
  return changed ? next : messages;
}

/**
 * Provider payload compatibility — sole entry point.
 */
export function normalizeProviderPayload(
  payload: Record<string, any>,
  model: any,
  options: Record<string, any> = {},
): Record<string, any> {
  if (!payload || typeof payload !== "object") return payload;
  let result = payload;
  result = stripEmptyTools(result);
  result = stripIncompatibleThinking(result, model);
  result = stripDisabledReasoningEffort(result);
  result = stripOrphanToolMessages(result);
  result = normalizeImplicitOutputBudget(result, model, options);
  result = stripNativeMediaAttachmentMarkers(result);
  result = normalizeAudioTransportPayload(result, model);
  for (const mod of PROVIDER_MODULES) {
    if (mod.matches(model)) { result = mod.apply(result, model, options); break; }
  }
  return result;
}

export function normalizeProviderContextMessages(
  messages: any[],
  model: any,
  options: Record<string, any> = {},
): any[] {
  if (!Array.isArray(messages)) return messages;
  const result = projectToolResultResourcesForModel(messages);
  for (const mod of PROVIDER_MODULES) {
    if (mod.matches(model)) {
      if (typeof mod.normalizeContextMessages === "function") {
        return mod.normalizeContextMessages(result, model, options);
      }
      break;
    }
  }
  return result;
}
