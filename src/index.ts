/**
 * llm-provider-compat — Universal LLM Provider Compatibility Layer
 *
 * Normalizes provider-specific payload differences (thinking formats,
 * output budgets, tool pairing, media transport) into a single
 * first-match-wins dispatch pipeline.
 *
 * @license MIT
 */

export { normalizeProviderPayload, normalizeProviderContextMessages } from "./dispatcher.ts";
export { isDeepSeekModel, isAnthropicModel, getThinkingFormat, getReasoningProfile } from "./dispatcher.ts";

export {
  getThinkingFormat as resolveThinkingFormat,
  getReasoningProfile as resolveReasoningProfile,
  isOfficialMimoEndpoint,
  isDeepSeekFamilyModel,
  isDeepSeekReasoningModel,
  modelSupportsImageInput,
  modelSupportsVideoInput,
  modelSupportsAudioInput,
  modelSupportsDirectImageInput,
  modelSupportsDirectVideoInput,
  modelSupportsDirectAudioInput,
  modelSupportsVisualGrounding,
  getVisionCapabilities,
  resolveModelImageInputTransport,
  resolveModelAudioInputTransport,
  resolveModelVideoInputTransport,
  normalizeModelProtocolCompat,
  normalizeToolUseContract,
  normalizeVisionCapabilities,
  withThinkingFormatCompat,
  MODEL_IMAGE_TRANSPORTS,
  MODEL_AUDIO_TRANSPORTS,
  MODEL_VIDEO_TRANSPORTS,
} from "./model-capabilities.ts";

export {
  fetchLatestModels,
  resolveLatestModels,
  createVersionCache,
} from "./dynamic-version.ts";
export type { VersionCache, VersionCacheEntry, ProviderVersionConfig, LatestModelResult } from "./dynamic-version.ts";

export { resolveOutputBudgetPolicy, resolveOutputCapCapability, normalizeImplicitOutputBudget } from "./utils/output-budget.ts";
export { stripOrphanToolResults } from "./utils/tool-pairing.ts";
export { lookupKnown, lookupKnownProvider, lookupKnownWithSource, listKnownProviderModels, setDataDir } from "./known-models.ts";

// Provider catalog (all 37 supported providers)
export {
  PROVIDER_CATALOG,
  getProvider,
  listProviders,
  listProvidersByTier,
  getCompatModule,
  isSupportedProvider,
} from "./catalog.ts";
export type { ProviderDefinition, AuthType } from "./catalog.ts";
