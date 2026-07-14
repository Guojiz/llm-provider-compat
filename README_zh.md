# llm-provider-compat

[English](README.md) | **中文**

通用 LLM 提供商兼容层 — 将不同提供商的 payload 差异（思考格式、输出预算、
工具配对、媒体传输）归一化为单一的 **first-match-wins 分发管线**。

外加 **动态版本检测** — 通过 `GET /v1/models` 自动发现各提供商最新模型，
支持策略模式版本解析、TTL 缓存、全局/提供商级开关控制。

**许可证:** MIT

---

## 安装

```bash
npm install llm-provider-compat
```

---

## 支持的提供商

### Tier 1 — 专用兼容子模块

这些提供商有非标准的 wire protocol，需要显式 payload 归一化。
每个在 `src/providers/<name>.ts` 中都有专用处理器。

| 提供商 | API 协议 | 思考格式 | 关键特性 |
|---|---|---|---|
| **Anthropic** | `anthropic-messages` | `thinking: { type, budget_tokens }` | Prompt 缓存、adaptive effort（Fable/Mythos 5）、输出上限必填 |
| **DeepSeek** | `openai-completions` / `anthropic-messages` | `thinking: { type: "enabled"/"disabled" }` | reasoning_effort 归一化（low/med→high, xhigh→max）、reasoning_content 回放、token budget 抬升、V4 Anthropic 协议 |
| **Kimi / Moonshot** | `openai-completions` | `thinking: { type, keep? }` + `reasoning_effort` | reasoning_content 回放、Moonshot MFJS schema 归一化、Kimi Coding 工具温度 |
| **DashScope / Qwen** | `openai-completions` | `enable_thinking: boolean` | 同时覆盖 dashscope-coding（阿里百炼上的 Kimi-K2）、SiliconFlow、ModelScope、Infini；视频 → video_url |
| **Zhipu / BigModel** | `openai-completions` | `thinking: { type, clear_thinking }` | reasoning_content 回放、strict 字段移除、store/stream_options 剥离、OpenCode Go 端点 |
| **MiMo / Xiaomi** | `openai-completions` | `chat_template_kwargs: { enable_thinking, preserve_thinking }` | reasoning_content 回放、input_audio 传输、video_url 传输、Token Plan 变体 |
| **OpenRouter** | `openai-completions` | `reasoning: { effort }` + `verbosity` | Claude Fable/Mythos 5 adaptive effort、禁止关闭思考 |
| **Volcengine Ark** | `openai-completions` | `thinking: { type }` + `reasoning_effort` | Effort 枚举上限（max→high）、utility/off 强制关闭 |
| **LongCat** | `openai-completions` | `thinking: { type: "disabled" }` | 仅 utility：关闭思考、剥离 reasoning_content |
| **Agnes AI** | `openai-completions` | _已剥离_ | 无结构化推理协议 — 从 payload 和历史中剥离所有 thinking 字段 |
| **OpenAI Codex** | `openai-codex-responses` | _已剥离_ | 从 Responses 端点剥离不支持的输出预算和温度字段 |
| **OpenAI 音频** | `openai-completions` | N/A | 将 `data:audio` image_url → `input_audio` 块 |
| **DashScope/Kimi/MiMo 视频** | `openai-completions` | N/A | 将 `data:video` image_url → `video_url` 块 |

### Tier 2 — 标准 OpenAI 兼容

这些提供商使用标准 OpenAI Chat Completions 协议，**无需专用子模块**，
通过默认分发路径直接放行。

| 提供商 | Base URL | 备注 |
|---|---|---|
| **OpenAI** | `https://api.openai.com/v1` | GPT-4o, o1, o3, o4-mini |
| **xAI (Grok)** | `https://api.x.ai/v1` | Grok-4.5, Grok-4.3，标准 reasoning_effort |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta` | Gemini 2.x/3.x |
| **Groq** | `https://api.groq.com/openai/v1` | 超低延迟推理 |
| **Cohere** | `https://api.cohere.com/v1` | Command R/R+ |
| **Mistral** | `https://api.mistral.ai/v1` | Mistral Large, Small, Codestral |
| **Perplexity** | `https://api.perplexity.ai` | Sonar 搜索增强模型 |
| **Together AI** | `https://api.together.xyz/v1` | Llama, Mixtral 等 |
| **Fireworks** | `https://api.fireworks.ai/inference/v1` | 无服务器推理 |
| **SiliconFlow** | `https://api.siliconflow.cn/v1` | Qwen 模型通过 Tier 1 quirks 路由 |
| **Infini** | _(用户配置)_ | Qwen 风格模型通过 Tier 1 quirks |
| **ModelScope** | `https://api-inference.modelscope.cn/v1` | Qwen 风格模型通过 Tier 1 quirks |
| **StepFun** | `https://api.stepfun.com/v1` | 阶跃星辰 |
| **百川智能** | `https://api.baichuan-ai.com/v1` | 标准 Chat Completions |
| **百度文心** | `https://qianfan.baidubce.com/v2` | 千帆大模型 |
| **腾讯混元** | `https://api.hunyuan.cloud.tencent.com/v1` | 混元大模型 |
| **MiniMax** | `https://api.minimaxi.com/anthropic` | Anthropic 兼容协议 |
| **Ollama** | `http://localhost:11434/v1` | 本地模型 |
| **任意 OpenAI 兼容端点** | _(自定义 baseURL)_ | 开箱即用 |

---

## 架构原理

```
                     normalizeProviderPayload()
                              │
                              ▼
              ┌──────────────────────────────┐
              │  1. 通用补丁（提供商无关）      │
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
              │  2. 提供商分发                 │
              │  First-match-wins 遍历         │
              │  PROVIDER_MODULES[]            │
              │                              │
              │  deepseek.matches(model)? → apply()  │
              │  kimi.matches(model)?    → apply()  │
              │  qwen.matches(model)?    → apply()  │
              │  ... (13 个子模块)              │
              │                              │
              │  无匹配 → 默认直通（不变）       │
              └──────────────┬───────────────┘
                             │
                             ▼
                     最终 HTTP Payload
```

### `matches()` 如何工作

每个子模块的 `matches(model)` 是**纯函数**，回答"这个模型需要特殊 payload 处理吗？"。
它检查声明式字段（`model.compat.thinkingFormat`、`model.provider`、`model.baseUrl`、`model.quirks`），
而不是硬编码模型 ID。不匹配任何子模块的模型（上表 Tier 2）原封不动通过。

### `apply()` 如何工作

`apply(payload, model, options)` 接收 SDK 组装的 HTTP 请求体（OpenAI 或 Anthropic 格式），
翻译成提供商实际的 wire format。不可变契约：不修改输入，返回新对象或原对象（未修改时）。

### 两条调用路径，一个入口

```
Chat 路径（流式）:             Utility 路径（非流式）:
SDK before_provider_request     callText() 直接 fetch
        │                              │
        └────────────┬─────────────────┘
                     │
                     ▼
           normalizeProviderPayload()
```

### 思考格式解析链

```
model.compat.thinkingFormat（显式声明）
    → model.quirks[]（"enable_thinking" → qwen）
    → provider/endpoint 检测（anthropic, deepseek, kimi, ...）
    → reasoning 推断（reasoning=true + api=anthropic-messages → anthropic）
    → null（标准 OpenAI，无需特殊思考格式）
```

---

## 快速开始

### Payload 归一化

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
  { model: "deepseek-v4", messages: [{ role: "user", content: "你好" }], max_tokens: 32000 },
  model,
  { mode: "chat", reasoningLevel: "high" }
);
// → thinking: { type: "enabled" }, reasoning_effort: "high", max_tokens 已抬升
```

### xAI (Grok)

xAI 使用标准 OpenAI Chat Completions — 无需特殊子模块，默认分发路径处理。

```ts
const model = {
  id: "grok-4.5",
  provider: "xai",
  baseUrl: "https://api.x.ai/v1",
  reasoning: true,
  maxTokens: 128000,
};

// payload 原封通过（标准 OpenAI 信封）
const normalized = normalizeProviderPayload(
  { model: "grok-4.5", messages: [{ role: "user", content: "Hello" }] },
  model,
  { mode: "chat", reasoningLevel: "high" }
);
```

### 动态版本检测

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

## API 参考

### 主入口

| 导出 | 签名 |
|---|---|
| `normalizeProviderPayload` | `(payload, model, options?) → payload` |
| `normalizeProviderContextMessages` | `(messages, model, options?) → messages` |

### 提供商检测

| 导出 | 返回值 |
|---|---|
| `isDeepSeekModel(model)` | `boolean` |
| `isAnthropicModel(model)` | `boolean` |
| `getThinkingFormat(model)` | `string \| null` |
| `getReasoningProfile(model)` | `string \| null` |
| `modelSupportsImageInput(model)` | `boolean` |
| `modelSupportsVideoInput(model)` | `boolean` |
| `modelSupportsAudioInput(model)` | `boolean` |
| `isDeepSeekFamilyModel(model)` | `boolean` |
| `isDeepSeekReasoningModel(model)` | `boolean` |

### 动态版本检测

| 导出 | 签名 |
|---|---|
| `fetchLatestModels` | `(configs[], options?) → { latest, fetched, errors, fromCache }` |
| `resolveLatestModels` | `(modelIds[], providerId, strategy?) → Record<string, string>` |
| `createVersionCache` | `(initial?) → { get, set, getAll, isExpired, clear }` |
| `resolveTopModel` | `(latestBySeries, modelIds) → string \| null` |

### 提供商目录

| 导出 | 签名 |
|---|---|
| `PROVIDER_CATALOG` | `Record<string, ProviderDefinition>` — 全部 39 个提供商 |
| `getProvider` | `(id: string) → ProviderDefinition \| undefined` |
| `listProviders` | `() → string[]` |
| `listProvidersByTier` | `(tier) → ProviderDefinition[]` |
| `getCompatModule` | `(providerId) → string \| null` |
| `isSupportedProvider` | `(providerId) → boolean` |

### 输出预算

| 导出 | 签名 |
|---|---|
| `resolveOutputBudgetPolicy` | `(model, options?) → BudgetPolicy` |
| `normalizeImplicitOutputBudget` | `(payload, model, options?) → payload` |

### 工具配对

| 导出 | 签名 |
|---|---|
| `stripOrphanToolResults` | `(messages) → messages` |

---

## 添加新提供商

**Tier 1（需要特殊 payload 处理）:**

1. 创建 `src/providers/<name>.ts`
2. 导出 `matches(model)` — 必须容忍 `null`/`undefined`，返回 `boolean`
3. 导出 `apply(payload, model, options)` — 不可变契约，不修改输入
4. 可选导出 `normalizeContextMessages(messages, model, options)` 用于历史校验
5. 加入 `PROVIDER_MODULES[]` 数组（追加到末尾，除非规则更具体需前置）

**Tier 2（标准 OpenAI 兼容）:**

无需代码 — 配置好 `baseUrl` + `apiKey`，默认分发路径直接处理。

---

## 相关链接

- 架构提取自 [OpenHanako](https://github.com/liliMozi/openhanako)
- [Issue #1287](https://github.com/liliMozi/openhanako/issues/1287) — 动态版本检测方案设计
- [npm 包](https://www.npmjs.com/package/llm-provider-compat)
