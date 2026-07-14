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

Plus **dynamic version detection** (auto-discovers latest models from provider
APIs) and **OAuth login** (device-code flow for xAI Grok, extensible to others).

**License:** MIT

---

## Supported Providers (51 total)

### Tier 1 — Dedicated Compat Sub-Modules (14)

These have non-standard wire protocols requiring explicit payload normalization.

| Provider | API | Thinking Format | Key Quirks |
|---|---|---|---|
| **Anthropic** | `anthropic-messages` | `thinking: { type, budget_tokens }` | Prompt caching, adaptive effort (Fable/Mythos 5), required output cap, empty content filter, tool block reorder |
| **DeepSeek** | `openai-completions` / `anthropic-messages` | `thinking: { type }` + `reasoning_effort` | Effort collapse, reasoning_content replay, token budget uplift, V4 Anthropic profile, "Thinking..." injection |
| **Kimi / Moonshot** | `openai-completions` | `thinking: { type, keep? }` + `reasoning_effort` | reasoning_content replay, MFJS schema normalization, utility temp |
| **DashScope / Qwen** | `openai-completions` | `enable_thinking: boolean` | Covers dashscope-coding, SiliconFlow, ModelScope, Infini; video → video_url |
| **Zhipu / BigModel** | `openai-completions` | `thinking: { type, clear_thinking }` | reasoning_content replay, strict removal, store/stream_options strip, OpenCode Go |
| **MiMo / Xiaomi** | `openai-completions` | `chat_template_kwargs: { enable_thinking, preserve_thinking }` | reasoning_content replay, input_audio, video_url, token plan |
| **Mistral / Devstral** | `openai-completions` | _standard OpenAI_ | 9-char tool call IDs, synthetic assistant injection between tool→user |
| **OpenRouter** | `openai-completions` | `reasoning: { effort }` + `verbosity` | Claude Fable/Mythos 5 adaptive, `usage: { include: true }` |
| **Volcengine Ark** | `openai-completions` | `thinking: { type }` + `reasoning_effort` | Effort ceiling (max→high), utility/off disable |
| **LongCat** | `openai-completions` | `thinking: { type: "disabled" }` | Utility-only: disables thinking, strips reasoning_content |
| **Agnes AI** | `openai-completions` | _stripped_ | No reasoning protocol — strips all thinking fields |
| **OpenAI Codex** | `openai-codex-responses` | _stripped_ | Strips output budget + temperature from Responses |
| **OpenAI Audio** | `openai-completions` | N/A | `data:audio` image_url → `input_audio` |
| **DashScope/Kimi/MiMo Video** | `openai-completions` | N/A | `data:video` image_url → `video_url` |

### Tier 2 — Standard OpenAI-Compatible (37)

These pass through the default pathway **without a dedicated sub-module**.

**API-key providers:** OpenAI, xAI (Grok), Google Gemini, Groq, Cohere, Perplexity, Together AI, Fireworks, DeepInfra, Cerebras, SiliconFlow, ModelScope, Infini, StepFun, Baichuan, Baidu Cloud, Hunyuan, MiniMax, Ollama, Amazon Bedrock, Amazon Bedrock Mantle, Azure OpenAI, Google Vertex AI, Google Vertex AI (Anthropic), Cloudflare AI Gateway, Vercel AI, Venice AI, OpenRouter (non-adaptive models), LongCat (non-utility)

**OAuth providers:** xAI Grok (OAuth), OpenAI Codex (OAuth), GitLab Duo (OAuth), GitHub Copilot (OAuth)

**Special-purpose:** Volcengine Speech (BigASR), System Speech Recognition

---

## OAuth Login

### xAI (Grok) Device-Code OAuth

Full OAuth 2.0 device authorization grant for xAI Grok CLI access.

```ts
import { createXaiOAuthProvider } from "llm-provider-compat";

const xai = createXaiOAuthProvider();

const creds = await xai.login({
  onDeviceCode: ({ userCode, verificationUri }) => {
    console.log(`Open ${verificationUri} and enter code: ${userCode}`);
  },
});
// → { access, refresh, expires, tokenEndpoint }

// Refresh when expired:
const fresh = await xai.refreshToken(creds);
```

**Exported API:**

| Export | Description |
|---|---|
| `createXaiOAuthProvider(opts?)` | Factory with custom fetch/sleep/now |
| `xaiOAuthProvider` | Pre-built instance (uses global fetch) |
| `XAI_OAUTH_CLIENT_ID` | Official xAI Grok CLI client ID |
| `XAI_OAUTH_DISCOVERY_URL` | OIDC discovery endpoint |
| `XAI_OAUTH_SCOPES` | Required OAuth scopes |
| `XAI_OAUTH_RESOURCE_URL` | API resource URL (`cli-chat-proxy.grok.com`) |

### Auth Framework (extensible)

Generic auth types in `src/auth/types.ts`:

```ts
import type { AuthMethod, OAuthCredentials, ProviderAuthConfig } from "llm-provider-compat";
```

Supports `oauth` (device-code) and `api` (API key + metadata) methods with customizable login prompts (text/select).

---

## Architecture

```
                     normalizeProviderPayload()
                              │
              ┌──────────────────────────────┐
              │  1. Provider-Agnostic Patches │
              │  stripEmptyTools /            │
              │  stripIncompatibleThinking /  │
              │  stripDisabledReasoningEffort /│
              │  stripOrphanToolMessages /    │
              │  normalizeImplicitOutputBudget│
              └──────────────┬───────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │  2. Provider Dispatch         │
              │  First-match-wins:            │
              │  deepseek → kimi → mimo →     │
              │  mistral → qwen → zhipu →     │
              │  volcengine → longcat →       │
              │  agnes → openaiAudio →        │
              │  openaiVideo → openrouter →   │
              │  anthropic → codexResponses   │
              │  → no match = default (no-op) │
              └──────────────┬───────────────┘
                             │
                             ▼
                     Final HTTP Payload
```

---

## Dynamic Version Detection

```ts
import { fetchLatestModels } from "llm-provider-compat/dynamic-version";

const { latest } = await fetchLatestModels([
  { providerId: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: "..." },
  { providerId: "xai", baseUrl: "https://api.x.ai/v1", apiKey: "..." },
], { masterToggle: true });
// → { gemini: { "gemini-flash": "gemini-3.5-flash-preview" }, xai: { ... } }
```

Built-in strategies: `openai`, `anthropic`, `gemini`, `deepseek`, `default` (generic `name-X.Y.Z` regex).

---

## API Reference

### Main Entry

| Export | Signature |
|---|---|
| `normalizeProviderPayload` | `(payload, model, options?) → payload` |
| `normalizeProviderContextMessages` | `(messages, model, options?) → messages` |

### Provider Catalog

| Export | Returns |
|---|---|
| `PROVIDER_CATALOG` | `Record<string, ProviderDefinition>` — all 51 providers |
| `getProvider(id)` | `ProviderDefinition \| undefined` |
| `listProviders()` | `string[]` |
| `listProvidersByTier(tier)` | `ProviderDefinition[]` |
| `getCompatModule(providerId)` | `string \| null` |
| `isSupportedProvider(providerId)` | `boolean` |

### Provider Detection

`isDeepSeekModel`, `isAnthropicModel`, `getThinkingFormat`, `getReasoningProfile`,
`modelSupportsImageInput`, `modelSupportsVideoInput`, `modelSupportsAudioInput`,
`isDeepSeekFamilyModel`, `isDeepSeekReasoningModel`, `isOfficialMimoEndpoint`

### Dynamic Version Detection

`fetchLatestModels`, `resolveLatestModels`, `createVersionCache`, `resolveTopModel`, `formatModelLabel`

### Output Budget

`resolveOutputBudgetPolicy`, `resolveOutputCapCapability`, `normalizeImplicitOutputBudget`

### Tool Pairing

`stripOrphanToolResults`

### Known Models

`lookupKnown`, `lookupKnownProvider`, `lookupKnownWithSource`, `listKnownProviderModels`, `setDataDir`

---

## Adding a Provider

**Tier 1:** Create `src/providers/<name>.ts` → export `matches(model)` + `apply(payload, model, options)` → add to `PROVIDER_MODULES[]` in `src/dispatcher.ts`.

**Tier 2:** Just add to `PROVIDER_CATALOG` in `src/catalog.ts`.

---

## Related

- Architecture extracted from [OpenHanako](https://github.com/liliMozi/openhanako) and [OpenCode](https://github.com/anomalyco/opencode)
- [Issue #1287](https://github.com/liliMozi/openhanako/issues/1287) — Dynamic version detection design
