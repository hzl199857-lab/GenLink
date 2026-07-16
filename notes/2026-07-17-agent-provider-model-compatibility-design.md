# Agent Provider And Model Compatibility Design

## Goal

Restore the complete legacy GPT experience while keeping the new Gemini models available wherever the selected Provider supports them. Homepage Agent, canvas Agent, API routes, and OpenClaw must use one compatibility matrix so their model lists and runtime behavior cannot drift apart.

## Confirmed Product Behavior

There is no separate "Gemini / classic GPT" profile switch. The existing Provider and model controls remain the only selection surface.

| Provider | Available models |
| --- | --- |
| Comfly | GPT-5.4 Mini, GPT-5.5, Gemini 3.5 Flash, Gemini 3.1 Pro |
| Zhenzhen | GPT-5.4 Mini, GPT-5.5, Gemini 3.5 Flash, Gemini 3.1 Pro |
| Vibe | GPT-5.4 Mini, GPT-5.5 |
| Fucheers | GPT-5.4 Mini, GPT-5.5 |
| GRS AI | GPT-5.4 Mini, GPT-5.5 |

Selecting a GPT model must use the previous GPT request and OpenClaw behavior. Selecting a Gemini model must use the Gemini-compatible request path. When a Provider change makes the current model invalid, the UI selects that Provider's default GPT model instead of sending an invalid combination.

## Source Of Truth

`src/lib/agent-model-options.ts` owns:

- the four Agent model definitions;
- model family metadata (`gpt` or `gemini`);
- Provider compatibility;
- default model resolution;
- validation and filtering helpers.

`src/lib/agent-provider-options.ts` restores the legacy Agent Provider list:

- Vibe;
- Fucheers;
- Comfly;
- Zhenzhen;
- GRS AI.

Homepage and canvas controls must call the same filtering helper. API routes and OpenClaw mapping must validate the same Provider/model pair before running it.

## Credential Resolution

Credential selection remains Provider-specific. A request may fall back to another Provider only when that Provider supports the selected model. In particular, a Gemini request must never fall back to Vibe, Fucheers, or GRS AI merely because one of those Providers has a stored key.

The API settings panel continues to store all existing Provider keys. Restoring the legacy Providers makes previously saved GPT keys immediately usable again; no key migration or re-entry is required.

## Request Paths

### GPT

GPT-5.4 Mini and GPT-5.5 keep the previous OpenAI-compatible `response_format`, Provider URL, API Key selection, and OpenClaw model references. Gemini-only Schema normalization must not modify GPT request bodies.

### Gemini

Gemini 3.5 Flash and Gemini 3.1 Pro remain limited to Comfly and Zhenzhen. The `vibe` text adapter converts nullable unions and unsupported JSON Schema keywords before sending structured output. If the upstream Provider still rejects the Schema with a known compatibility error, the request retries once with JSON Object output and continues through the existing backend validation.

## OpenClaw Runtime Configuration

The checked-in model matrix is authoritative. Before spawning OpenClaw, GenLink reads the existing JSON5 runtime configuration and writes a generated JSON runtime configuration under the OpenClaw state directory. The generated file:

- preserves workspace, tools, MCP, sandbox, and other existing runtime settings;
- registers all four Agent models under `genlink_text`;
- makes the selected Provider URL and API Key available through the existing runtime environment variables;
- uses the selected model reference for the current request;
- contains no API Key value on disk.

The generated config is written atomically and may be recreated safely. The original `E:/GenLink-runtime/openclaw-genlink.json` is never overwritten by this process.

Before enabling generated configuration, GenLink creates a byte-for-byte legacy backup at `E:/GenLink-runtime/backups/openclaw-genlink.legacy-gpt.json`. A companion SHA-256 file records the baseline hash. The known pre-migration source hash is:

`28F0795331ABF1CEB55EA93B23CACCAA4B10E3467D1B11B32F560071DB681CBA`

Switching to GPT therefore uses the preserved GPT model definitions and the original rules/workspace behavior rather than a simulated compatibility layer.

## OpenClaw Entry Points

The following routes must all resolve and validate the same selected model before calling `runRealOpenClaw`:

- `src/app/api/openclaw/agent/run/route.ts`;
- `src/app/api/openclaw/planf/ecom/start/route.ts`;
- `src/app/api/openclaw/planf/ecom/confirm/route.ts`;
- `src/app/api/openclaw/planf/ecom/create-workflow/route.ts`.

Planner routes that call `generateText` directly use the same compatibility matrix but do not spawn OpenClaw.

## Error Handling

Runtime failures are classified as:

- missing API Key;
- unsupported Provider/model combination;
- missing or invalid runtime configuration;
- Provider network failure;
- Provider HTTP failure;
- timeout;
- invalid structured output;
- process failure.

User-facing messages must describe the actual class in Chinese. The UI must not label every start-session failure as a timeout, must not expose raw Provider/Protobuf payloads, and must not call `console.error` for handled request failures.

## Testing

Automated coverage must prove:

- the Provider/model compatibility matrix and default fallback;
- homepage and canvas controls use the filtered model list;
- saved legacy Provider keys remain eligible for GPT;
- Gemini credentials never fall back to GPT-only Providers;
- GPT request formats remain unchanged;
- Gemini Schema normalization and JSON Object retry remain active;
- generated OpenClaw config preserves unrelated settings and registers all four models;
- the legacy config backup is byte-for-byte and not overwritten;
- all four OpenClaw routes pass the validated model selection;
- errors are classified and rendered without a misleading timeout or Next.js console overlay.

Repository validation remains:

```bash
node --test <focused test files>
npx tsc --noEmit
npm run lint
git diff --check
```

Live verification must exercise both entry surfaces with one GPT request and one Gemini request. When real Provider credentials are unavailable to automation, the limitation must be reported explicitly rather than inferred from mocks.

