# llm-provider-compat

[English](README.md) | **中文**

[![npm version](https://img.shields.io/npm/v/llm-provider-compat)](https://www.npmjs.com/package/llm-provider-compat)
[![license](https://img.shields.io/npm/l/llm-provider-compat)](LICENSE)

```bash
npm install llm-provider-compat
```

通用 LLM 提供商兼容层 — 将不同提供商的 payload 差异（思考格式、输出预算、
工具配对、媒体传输）归一化为单一的 **first-match-wins 分发管线**。

外加 **动态版本检测**（自动发现各提供商最新模型）和 **OAuth 登录**
（xAI Grok device-code 流程，可扩展到其他提供商）。

**许可证:** MIT

---

## 支持的提供商（共 51 个）

### Tier 1 — 专用兼容子模块（14 个）

这些提供商有非标准 wire protocol，需要显式 payload 归一化。

| 提供商 | API 协议 | 思考格式 | 关键特性 |
|---|---|---|---|
| **Anthropic** | `anthropic-messages` | `thinking: { type, budget_tokens }` | Prompt 缓存、adaptive effort（Fable/Mythos 5）、输出上限必填、空内容过滤、tool 块重排 |
| **DeepSeek** | `openai-completions` / `anthropic-messages` | `thinking: { type }` + `reasoning_effort` | Effort 归一化、reasoning_content 回放、token 抬升、V4 Anthropic 协议、"Thinking..." 注入 |
| **Kimi / Moonshot** | `openai-completions` | `thinking: { type, keep? }` + `reasoning_effort` | reasoning_content 回放、MFJS schema 归一化、工具温度 |
| **DashScope / Qwen** | `openai-completions` | `enable_thinking: boolean` | 覆盖 dashscope-coding、SiliconFlow、ModelScope、Infini；视频→video_url |
| **Zhipu / BigModel** | `openai-completions` | `thinking: { type, clear_thinking }` | reasoning_content 回放、strict 移除、store/stream_options 剥离、OpenCode Go |
| **MiMo / Xiaomi** | `openai-completions` | `chat_template_kwargs: { enable_thinking, preserve_thinking }` | reasoning_content 回放、input_audio、video_url、Token Plan |
| **Mistral / Devstral** | `openai-completions` | _标准 OpenAI_ | 9 字符 tool call ID、tool→user 合成 assistant 注入 |
| **OpenRouter** | `openai-completions` | `reasoning: { effort }` + `verbosity` | Claude Fable/Mythos 5 adaptive、`usage: { include: true }` |
| **Volcengine Ark** | `openai-completions` | `thinking: { type }` + `reasoning_effort` | Effort 上限（max→high）、utility/off 关闭 |
| **LongCat** | `openai-completions` | `thinking: { type: "disabled" }` | 仅 utility：关闭思考、剥离 reasoning_content |
| **Agnes AI** | `openai-completions` | _已剥离_ | 无推理协议 — 剥离所有 thinking 字段 |
| **OpenAI Codex** | `openai-codex-responses` | _已剥离_ | 剥离不支持的输出预算和温度字段 |
| **OpenAI 音频** | `openai-completions` | N/A | `data:audio` image_url → `input_audio` |
| **DashScope/Kimi/MiMo 视频** | `openai-completions` | N/A | `data:video` image_url → `video_url` |

### Tier 2 — 标准 OpenAI 兼容（37 个）

这些提供商通过默认分发路径放行，**无需专用子模块**。

**API-key 提供商:** OpenAI、xAI (Grok)、Google Gemini、Groq、Cohere、Perplexity、Together AI、Fireworks、DeepInfra、Cerebras、SiliconFlow、ModelScope、Infini、StepFun、百川智能、百度文心、腾讯混元、MiniMax、Ollama、Amazon Bedrock、Amazon Bedrock Mantle、Azure OpenAI、Google Vertex AI、Google Vertex AI (Anthropic)、Cloudflare AI Gateway、Vercel AI、Venice AI、OpenRouter（非 adaptive 模型）、LongCat（非 utility）

**OAuth 提供商:** xAI Grok (OAuth)、OpenAI Codex (OAuth)、GitLab Duo (OAuth)、GitHub Copilot (OAuth)

**专用:** 火山引擎语音 (BigASR)、系统语音识别

---

## OAuth 登录

### xAI (Grok) Device-Code OAuth

完整的 OAuth 2.0 设备授权流程，用于 xAI Grok CLI 访问。

```ts
import { createXaiOAuthProvider } from "llm-provider-compat";

const xai = createXaiOAuthProvider();

// 开始登录 → 返回设备码和验证 URL
const creds = await xai.login({
  onDeviceCode: ({ userCode, verificationUri }) => {
    console.log(`打开 ${verificationUri} 输入验证码: ${userCode}`);
  },
});
// → { access, refresh, expires, tokenEndpoint }

// Token 过期后刷新：
const fresh = await xai.refreshToken(creds);
```

**导出 API:**

| 导出 | 说明 |
|---|---|
| `createXaiOAuthProvider(opts?)` | 工厂函数，可自定义 fetch/sleep/now |
| `xaiOAuthProvider` | 预构建实例（使用全局 fetch） |
| `XAI_OAUTH_CLIENT_ID` | 官方 xAI Grok CLI 客户端 ID |
| `XAI_OAUTH_DISCOVERY_URL` | OIDC 发现端点 |
| `XAI_OAUTH_SCOPES` | 所需 OAuth 作用域 |
| `XAI_OAUTH_RESOURCE_URL` | API 资源 URL (`cli-chat-proxy.grok.com`) |

### Auth 框架（可扩展）

通用 auth 类型定义在 `src/auth/types.ts`：

```ts
import type { AuthMethod, OAuthCredentials, ProviderAuthConfig } from "llm-provider-compat";
```

支持 `oauth`（设备码）和 `api`（API key + 元数据）两种方式，可自定义登录提示（文本/下拉）。

---

## 架构原理

```
                     normalizeProviderPayload()
                              │
              ┌──────────────────────────────┐
              │  1. 通用补丁（提供商无关）      │
              │  stripEmptyTools /            │
              │  stripIncompatibleThinking /  │
              │  stripDisabledReasoningEffort /│
              │  stripOrphanToolMessages /    │
              │  normalizeImplicitOutputBudget│
              └──────────────┬───────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │  2. 提供商分发（14 子模块）    │
              │  First-match-wins:            │
              │  deepseek → kimi → mimo →     │
              │  mistral → qwen → zhipu →     │
              │  volcengine → longcat →       │
              │  agnes → openaiAudio →        │
              │  openaiVideo → openrouter →   │
              │  anthropic → codexResponses   │
              │  → 无匹配 = 默认直通           │
              └──────────────┬───────────────┘
                             │
                             ▼
                     最终 HTTP Payload
```

---

## 动态版本检测

```ts
import { fetchLatestModels } from "llm-provider-compat/dynamic-version";

const { latest } = await fetchLatestModels([
  { providerId: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: "..." },
  { providerId: "xai", baseUrl: "https://api.x.ai/v1", apiKey: "..." },
], { masterToggle: true });
// → { gemini: { "gemini-flash": "gemini-3.5-flash-preview" }, xai: { ... } }
```

内置策略：`openai`、`anthropic`、`gemini`、`deepseek`、`default`（通用 `name-X.Y.Z` 正则）。

---

## API 参考

### 主入口

| 导出 | 签名 |
|---|---|
| `normalizeProviderPayload` | `(payload, model, options?) → payload` |
| `normalizeProviderContextMessages` | `(messages, model, options?) → messages` |

### 提供商目录

| 导出 | 返回值 |
|---|---|
| `PROVIDER_CATALOG` | `Record<string, ProviderDefinition>` — 全部 51 个 |
| `getProvider(id)` | `ProviderDefinition \| undefined` |
| `listProviders()` | `string[]` |
| `listProvidersByTier(tier)` | `ProviderDefinition[]` |
| `getCompatModule(providerId)` | `string \| null` |
| `isSupportedProvider(providerId)` | `boolean` |

### 提供商检测

`isDeepSeekModel`、`isAnthropicModel`、`getThinkingFormat`、`getReasoningProfile`、
`modelSupportsImageInput`、`modelSupportsVideoInput`、`modelSupportsAudioInput`、
`isDeepSeekFamilyModel`、`isDeepSeekReasoningModel`、`isOfficialMimoEndpoint`

### 动态版本检测

`fetchLatestModels`、`resolveLatestModels`、`createVersionCache`、`resolveTopModel`、`formatModelLabel`

### 输出预算

`resolveOutputBudgetPolicy`、`resolveOutputCapCapability`、`normalizeImplicitOutputBudget`

### 工具配对

`stripOrphanToolResults`

### 已知模型

`lookupKnown`、`lookupKnownProvider`、`lookupKnownWithSource`、`listKnownProviderModels`、`setDataDir`

---

## 添加新提供商

**Tier 1:** 创建 `src/providers/<name>.ts` → 导出 `matches(model)` + `apply(payload, model, options)` → 加入 `PROVIDER_MODULES[]`。

**Tier 2:** 在 `src/catalog.ts` 的 `PROVIDER_CATALOG` 中添加条目即可。

---

## 相关链接

- 架构提取自 [OpenHanako](https://github.com/liliMozi/openhanako) 和 [OpenCode](https://github.com/anomalyco/opencode)
- [Issue #1287](https://github.com/liliMozi/openhanako/issues/1287) — 动态版本检测方案设计
