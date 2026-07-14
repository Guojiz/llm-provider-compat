# llm-provider-compat

**English** | [中文](README_zh.md)

[![npm version](https://img.shields.io/npm/v/llm-provider-compat)](https://www.npmjs.com/package/llm-provider-compat)
[![license](https://img.shields.io/npm/l/llm-provider-compat)](LICENSE)

```bash
npm install llm-provider-compat
```

Universal LLM provider compatibility layer — normalizes provider-specific
payload differences (thinking formats, output budgets, tool pairing, media
transport) into a single **first-match-wins dispatch pipeline**.

Plus **dynamic version detection** — auto-discovers latest models from provider
APIs with regex-based version parsing, TTL caching, and per-provider toggle control.

**License:** MIT

---

## Supported Providers

### Tier 1 — Dedicated Compat Sub-Modules

These providers have non-standard wire protocols that require explicit
payload normalization. Each has a dedicated handler in `src/providers/<name>.ts`.

| Provider | API | Thinking Format | Key Quirks |
|---|---|---|---|
| **Anthropic** | `anthropic-messages` | `thinking: { type, budget_tokens }` | Prompt caching, adaptive effort (Fable/Mythos 5), required output cap |
| **DeepSeek** | `openai-completions` / `anthropic-messages` | `thinking: { type: "enabled"/"disabled" }` | reasoning_effort collapse (low/med→high, xhigh→max), reasoning_content replay, token budget uplift, Anthropic profile for V4 |
| **Kimi / Moonshot** | `openai-completions` | `thinking: { type, keep? }` + `reasoning_effort` | reasoning_content replay, Moonshot MFJS schema normalization, Kimi Coding utility temp |
| **DashScope / Qwen** | `openai-completions` | `enable_thinking: boolean` | Also covers dashscope-coding (Kimi-K2 via Alibaba), SiliconFlow, ModelScope, Infini; video → video_url |
| **Zhipu / BigModel** | `openai-completions` | `thinking: { type, clear_thinking }` | reasoning_content replay, strict field removal, store/stream_options stripping, OpenCode Go endpoint |
| **MiMo / Xiaomi** | `openai-completions` | `chat_template_kwargs: { enable_thinking, preserve_thinking }` | reasoning_content replay, input_audio transport, video_url transport, token plan variants |
| **OpenRouter** | `openai-completions` | `reasoning: { effort }` + `verbosity` | Claude Fable/Mythos 5 adaptive effort, disable rejected |
| **Volcengine Ark** | `openai-completions` | `thinking: { type }` + `reasoning_effort` | Effort enum ceiling (max → high), utility/off thinking disable |
| **LongCat** | `openai-completions` | `thinking: { type: "disabled" }` | Utility-only: disables thinking, strips reasoning_content |
| **Agnes AI** | `openai-completions` | _stripped_ | No structured reasoning protocol — strips all thinking fields from payload and history |
| **OpenAI Codex** | `openai-codex-responses` | _stripped_ | Strips unsupported output budget + temperature fields from Responses endpoint |
| **OpenAI Audio** | `openai-completions` | N/A | Converts `data:audio` image_url → `input_audio` blocks |
| **DashScope/Kimi/MiMo Video** | `openai-completions` | N/A | Converts `data:video` image_url → `video_url` blocks |

### Tier 2 — Standard OpenAI-Compatible

These providers use the standard OpenAI Chat Completions protocol and pass
through the dispatcher **without a dedicated sub-module** — the default pathway
handles them correctly. Any model that doesn't match a Tier 1 handler falls
through to the default (no-op) path.

| Provider | Base URL | Notes |
|---|---|---|
| **OpenAI** | `https://api.openai.com/v1` | GPT-4o, o1, o3, o4-mini |
| **xAI (Grok)** | `https://api.x.ai/v1` | Grok-4.5, Grok-4.3, reasoning via standard `reasoning_effort` |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai` | OpenAI-compatible endpoint |
| **Groq** | `https://api.groq.com/openai/v1` | Ultra-fast inference |
| **Cohere** | `https://api.cohere.com/v1` | Command R/R+ |
| **Mistral** | `https://api.mistral.ai/v1` | Mistral Large, Small, Codestral |
| **Perplexity** | `https://api.perplexity.ai` | Sonar models |
| **Together AI** | `https://api.together.xyz/v1` | Llama, Mixtral, etc. |
| **Fireworks** | `https://api.fireworks.ai/inference/v1` | Serverless inference |
| **SiliconFlow** | `https://api.siliconflow.cn/v1` | Qwen models get `enable_thinking` via Tier 1 quirks routing |
| **Infini** | _(user-configured)_ | Qwen-style models get `enable_thinking` via Tier 1 quirks |
| **ModelScope** | _(user-configured)_ | Qwen-style models via Tier 1 quirks |
| **StepFun** | _(user-configured)_ | Standard Chat Completions |
| **Baichuan** | _(user-configured)_ | Standard Chat Completions |
| **Baidu Cloud** | _(user-configured)_ | Standard Chat Completions |
| **Hunyuan** | _(user-configured)_ | Tencent Hunyuan models |
| **MiniMax** | _(user-configured)_ | Standard Chat Completions |
| **Ollama** | `http://localhost:11434/v1` | Local models |
| **Any OpenAI-compatible** | _(custom baseURL)_ | Works out of the box |

---

## Architecture

```
                     normalizeProviderPayload()
                              │
                              ▼
              ┌──────────────────────────────┐
              │  1. Provider-Agnostic Patches │
              │  • stripEmptyTools            │
              │  • stripIncompatibleThinking  │
              │  • stripDisabledReasoningEffort│
              │  • stripOrphanToolMessages    │
              │  • normalizeImplicitOutputBudget│
              │  • stripMediaAttachmentMarkers│
              │  • normalizeAudioTransport    │
              └──────────────┬───────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │  2. Provider Dispatch        │
              │  First-match-wins over        │
              │  PROVIDER_MODULES[]           │
              │                              │
              │  deepseek.matches(model)? → apply()  │
              │  kimi.matches(model)?    → apply()  │
              │  qwen.matches(model)?    → apply()  │
              │  ... (13 sub-modules)            │
              │                              │
              │  No match → default (no-op)  │
              └──────────────┬───────────────┘
                             │
                             ▼
                     Final HTTP Payload
```

### How `matches()` Works

Each sub-module's `matches(model)` is a **pure function** that answers: "does
this model need special payload treatment?" It checks declarative fields
(`model.compat.thinkingFormat`, `model.provider`, `model.baseUrl`, `model.quirks`)
rather than hard-coding model IDs. Models that don't match any sub-module
(Tier 2 above) pass through unmodified — they use the standard
OpenAI-compatible envelope.

### How `apply()` Works

`apply(payload, model, options)` takes the HTTP request body assembled by the
SDK (OpenAI or Anthropic shape) and translates it into the provider's actual
wire format. Immutable contract: never mutates the input; returns a new object
or the original if unchanged.

### Two Call Paths, One Entry Point

```
Chat path (streaming):       Utility path (non-streaming):
SDK before_provider_request   callText() direct fetch
        │                            │
        └──────────┬─────────────────┘
                   │
                   ▼
         normalizeProviderPayload()
```

### Thinking Format Resolution Chain

```
model.compat.thinkingFormat (explicit)
    → model.quirks[] ("enable_thinking" → qwen)
    → provider/endpoint detection (anthropic, deepseek, kimi, etc.)
    → reasoning model heuristic (reasoning=true + api=anthropic-messages → anthropic)
    → null (standard OpenAI, no special thinking format)
```

Every thinking format maps to a specific wire protocol (see table in Tier 1).

---

## Install

```bash
npm install llm-provider-compat
```

## Quick Start

### Payload Normalization

```ts
import { normalizeProviderPayload } from "llm-provider-compat";

const model = {
  id: "deepseek-v4-0324",
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com/v1",
  reasoning: true,
  maxTokens: 131072,
};

const normalized = normalizeProviderPayload(
  { model: "deepseek-v4", messages: [{ role: "user", content: "Hello" }], max_tokens: 32000 },
  model,
  { mode: "chat", reasoningLevel: "high" }
);
// → thinking: { type: "enabled" }, reasoning_effort: "high", max_tokens uplifted
```

### xAI (Grok)

xAI uses standard OpenAI-compatible Chat Completions — no special sub-module
needed. It passes through the default dispatch pathway. Just configure your
SDK with the standard base URL:

```ts
const model = {
  id: "grok-4.5",
  provider: "xai",
  baseUrl: "https://api.x.ai/v1",
  reasoning: true,
  maxTokens: 128000,
};

const normalized = normalizeProviderPayload(
  { model: "grok-4.5", messages: [{ role: "user", content: "Hello" }] },
  model,
  { mode: "chat", reasoningLevel: "high" }
);
// → passes through unmodified (standard OpenAI envelope)
```

### Dynamic Version Detection

```ts
import { fetchLatestModels } from "llm-provider-compat/dynamic-version";

const { latest } = await fetchLatestModels([
  { providerId: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: "..." },
  { providerId: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "..." },
  { providerId: "xai", baseUrl: "https://api.x.ai/v1", apiKey: "..." },
  { providerId: "deepseek", baseUrl: "https://api.deepseek.com/v1", apiKey: "...", autoUpdateEnabled: false },
], { masterToggle: true });

// { gemini: { "gemini-flash": "gemini-3.5-flash-preview" }, openai: { ... }, xai: { ... } }
```

---

## API Reference

### Main Entry

| Export | Signature |
|---|---|
| `normalizeProviderPayload` | `(payload, model, options?) → payload` |
| `normalizeProviderContextMessages` | `(messages, model, options?) → messages` |

### Provider Detection

| Export | Returns |
|---|---|
| `isDeepSeekModel(model)` | `boolean` |
| `isAnthropicModel(model)` | `boolean` |
| `getThinkingFormat(model)` | `string \| null` |
| `getReasoningProfile(model)` | `string \| null` |
| `modelSupportsImageInput(model)` | `boolean` |
| `modelSupportsVideoInput(model)` | `boolean` |
| `modelSupportsAudioInput(model)` | `boolean` |
| `modelSupportsDirectImageInput(model)` | `boolean` |
| `modelSupportsDirectVideoInput(model)` | `boolean` |
| `modelSupportsDirectAudioInput(model)` | `boolean` |
| `modelSupportsVisualGrounding(model)` | `boolean` |
| `isDeepSeekFamilyModel(model)` | `boolean` |
| `isDeepSeekReasoningModel(model)` | `boolean` |
| `isOfficialMimoEndpoint(model)` | `boolean` |

### Dynamic Version Detection

| Export | Signature |
|---|---|
| `fetchLatestModels` | `(configs[], options?) → { latest, fetched, errors, fromCache }` |
| `resolveLatestModels` | `(modelIds[], providerId, strategy?) → Record<string, string>` |
| `createVersionCache` | `(initial?) → { get, set, getAll, isExpired, clear }` |
| `resolveTopModel` | `(latestBySeries, modelIds) → string \| null` |
| `formatModelLabel` | `(series, modelId) → string` |

### Output Budget

| Export | Signature |
|---|---|
| `resolveOutputBudgetPolicy` | `(model, options?) → BudgetPolicy` |
| `resolveOutputCapCapability` | `(model) → Capability` |
| `normalizeImplicitOutputBudget` | `(payload, model, options?) → payload` |

### Tool Pairing

| Export | Signature |
|---|---|
| `stripOrphanToolResults` | `(messages) → messages` |

### Known Models

| Export | Signature |
|---|---|
| `lookupKnown` | `(provider, modelId) → ModelMeta \| null` |
| `lookupKnownProvider` | `(provider, modelId) → ModelMeta \| null` |
| `lookupKnownWithSource` | `(provider, modelId) → { metadata, source } \| null` |
| `listKnownProviderModels` | `(provider) → string[]` |
| `setDataDir` | `(dir: string) → void` |

### Model Capabilities

| Export | Value |
|---|---|
| `MODEL_IMAGE_TRANSPORTS` | `{ NONE, OPENAI_IMAGE_URL, OPENAI_INPUT_IMAGE, ANTHROPIC_IMAGE, UNSUPPORTED }` |
| `MODEL_AUDIO_TRANSPORTS` | `{ NONE, MIMO_INPUT_AUDIO, OPENAI_INPUT_AUDIO, UNSUPPORTED }` |
| `MODEL_VIDEO_TRANSPORTS` | `{ NONE, GEMINI_INLINE_DATA, OPENAI_VIDEO_URL, UNSUPPORTED }` |

---

## Adding a New Provider

**Tier 1 (needs special payload handling):**

1. Create `src/providers/<name>.ts`
2. Export `matches(model)` — must tolerate `null`/`undefined`, return `boolean`
3. Export `apply(payload, model, options)` — immutable contract, no mutation of input
4. Optionally export `normalizeContextMessages(messages, model, options)` for history validation
5. Add to `PROVIDER_MODULES[]` array in `src/dispatcher.ts` (append to end unless more specific)

**Tier 2 (standard OpenAI-compatible):**

No code needed — just configure the provider's `baseUrl` + `apiKey` in your
SDK, and the default dispatch pathway handles it.

---

## Related

- Architecture extracted from [OpenHanako](https://github.com/liliMozi/openhanako)
- [Issue #1287](https://github.com/liliMozi/openhanako/issues/1287) — Dynamic version detection design
