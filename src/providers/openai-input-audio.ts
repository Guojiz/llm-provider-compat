/**
 * OpenAI input_audio compatibility.
 * @license MIT
 */
import { MODEL_AUDIO_TRANSPORTS, resolveModelAudioInputTransport } from "../model-capabilities.ts";
import { normalizeOpenAIInputAudioPayload } from "../utils/input-audio.ts";

export function matches(model: any): boolean {
  return resolveModelAudioInputTransport(model) === MODEL_AUDIO_TRANSPORTS.OPENAI_INPUT_AUDIO;
}
export function apply(payload: any): any { return normalizeOpenAIInputAudioPayload(payload); }
