# llm-provider-compat

Universal LLM provider compatibility layer — normalizes provider-specific
payload differences (thinking formats, output budgets, tool pairing, media
transport) into a single first-match-wins dispatch pipeline.

Plus **dynamic version detection** — auto-discovers latest models from provider
APIs with regex-based version parsing, TTL caching, and per-provider toggle control.

**License:** MIT

## Features

- **Provider-agnostic dispatch** — single `normalizeProviderPayload()` entry for all providers
- **13 provider sub-modules** — Anthropic, DeepSeek, Kimi, Qwen, Zhipu, MiMo, OpenRouter, Volcengine, LongCat, Agnes, OpenAI Codex + audio/video helpers
- **8 thinking formats** — anthropic, deepseek, qwen, qwen-chat-template, zhipu, kimi, volcengine, openrouter
- **Output budget policy** — removes implicit SDK caps where optional, preserves required caps
- **Orphan toolResult guard** — prevents OpenAI-compatible 400 errors from dropped tool_calls
- **Reasoning content replay** — validates & recovers reasoning_content for DeepSeek/Zhipu/Kimi/MiMo
- **Media transport** — audio (input_audio) and video (video_url) payload conversion
- **Dynamic version detection** — GET /v1/models with strategy-pattern version parsing + caching

## Install

```bash
npm install llm-provider-compat
```

## Quick Start

### Payload Normalization

```ts
import { normalizeProviderPayload } from "llm-provider-compat";

const normalized = normalizeProviderPayload(
  { model: "deepseek-v4", messages: [{ role: "user", content: "Hello" }], max_tokens: 32000 },
  { id: "deepseek-v4", provider: "deepseek", baseUrl: "https://api.deepseek.com/v1", reasoning: true, maxTokens: 131072 },
  { mode: "chat", reasoningLevel: "high" }
);
```

### Dynamic Version Detection

```ts
import { fetchLatestModels } from "llm-provider-compat/dynamic-version";

const { latest } = await fetchLatestModels([
  { providerId: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: "..." },
  { providerId: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "..." },
  { providerId: "deepseek", baseUrl: "https://api.deepseek.com/v1", apiKey: "...", autoUpdateEnabled: false },
], { masterToggle: true });

// { gemini: { "gemini-flash": "gemini-3.5-flash-preview" }, openai: { ... } }
```

## API

### Main Entry
- `normalizeProviderPayload(payload, model, options?)` → payload
- `normalizeProviderContextMessages(messages, model, options?)` → messages

### Provider Detection
- `isDeepSeekModel`, `isAnthropicModel`, `getThinkingFormat`, `getReasoningProfile`
- `modelSupportsImageInput`, `modelSupportsVideoInput`, `modelSupportsAudioInput`

### Dynamic Version
- `fetchLatestModels(configs, options?)` → `{ latest, fetched, errors, fromCache }`
- `resolveLatestModels(modelIds, providerId, strategy?)` → `Record<string, string>`
- `createVersionCache(initial?)` → cache object
- `resolveTopModel(latestBySeries, modelIds)` → best model ID

### Output Budget
- `resolveOutputBudgetPolicy`, `resolveOutputCapCapability`, `normalizeImplicitOutputBudget`

### Known Models
- `lookupKnown`, `lookupKnownProvider`, `setDataDir`

## Supported Thinking Formats

| Format | Field | Providers |
|---|---|---|
| `anthropic` | `thinking: { type, budget_tokens }` | Anthropic, Kimi Coding |
| `deepseek` | `thinking: { type }` + `reasoning_effort` | DeepSeek V4, reasoner |
| `qwen` | `enable_thinking: boolean` | DashScope, SiliconFlow |
| `qwen-chat-template` | `chat_template_kwargs` | MiMo |
| `zhipu` | `thinking: { type, clear_thinking }` | Zhipu GLM |
| `kimi` | `thinking: { type, keep? }` + `reasoning_effort` | Kimi Code, Moonshot |
| `volcengine` | `thinking: { type }` + `reasoning_effort` | Volcengine Ark |
| `openrouter` | `reasoning: { effort }` + `verbosity` | OpenRouter Claude adaptive |

## Adding a Provider

1. Create `src/providers/<name>.ts` with `matches(model)` and `apply(payload, model, options)`
2. Add to `PROVIDER_MODULES` array in `src/dispatcher.ts`
3. Strategy: export `normalizeContextMessages(messages, model, options)` if needed for history validation

## Related

- Architecture extracted from [OpenHanako](https://github.com/liliMozi/openhanako) (Apache-2.0)
- [Issue #1287](https://github.com/liliMozi/openhanako/issues/1287) — Dynamic version detection design
