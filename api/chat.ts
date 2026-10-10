import { createAnthropic, type AnthropicProviderOptions } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  streamText,
  tool,
  type InferUIMessageChunk,
  type InferUITools,
  type ModelMessage,
  type UIDataTypes,
  type UIMessage,
} from "ai";
import {
  SERVER_ERRORS,
  buildErrorBody,
  classifyStreamError,
  isServerErrorCode,
  type ServerErrorCode,
} from "../src/features/assistant/contract/errors.js";
import { ASSISTANT_LIMITS } from "../src/features/assistant/contract/limits.js";
import {
  ASSISTANT_EFFORT,
  ASSISTANT_MAX_OUTPUT_TOKENS,
  ASSISTANT_MODEL_ID,
} from "../src/features/assistant/contract/model.js";
import { ASSISTANT_PROMPT_VERSION, buildSystemPrompt } from "../src/features/assistant/contract/prompt.js";
import { chatRequestSchema } from "../src/features/assistant/contract/request.js";
import { TOOL_DESCRIPTIONS, TOOL_INPUT_SCHEMAS } from "../src/features/assistant/contract/tools.js";
import type { ToolName } from "../src/features/assistant/contract/tool-names.js";
import type { AssistantMessageMetadata } from "../src/features/assistant/contract/types.js";
import { dropUnfinishedUnknownToolParts, resolveApiKey, userTextTooLong, utf8ByteLength } from "./_lib/guards.js";

// No execute: every tool runs in the browser against IndexedDB.
const tools = {
  getSpendingSummary: tool({
    description: TOOL_DESCRIPTIONS.getSpendingSummary,
    inputSchema: TOOL_INPUT_SCHEMAS.getSpendingSummary,
  }),
  findTransactions: tool({
    description: TOOL_DESCRIPTIONS.findTransactions,
    inputSchema: TOOL_INPUT_SCHEMAS.findTransactions,
  }),
  addTransaction: tool({ description: TOOL_DESCRIPTIONS.addTransaction, inputSchema: TOOL_INPUT_SCHEMAS.addTransaction }),
  updateTransaction: tool({
    description: TOOL_DESCRIPTIONS.updateTransaction,
    inputSchema: TOOL_INPUT_SCHEMAS.updateTransaction,
  }),
  deleteTransaction: tool({
    description: TOOL_DESCRIPTIONS.deleteTransaction,
    inputSchema: TOOL_INPUT_SCHEMAS.deleteTransaction,
  }),
} satisfies Record<ToolName, unknown>;

type ServerMessage = UIMessage<AssistantMessageMetadata, UIDataTypes, InferUITools<typeof tools>>;
type ServerChunk = InferUIMessageChunk<ServerMessage>;

function log(event: string, fields: Record<string, string | number>): void {
  console.log(JSON.stringify({ scope: "api/chat", event, ...fields }));
}

function requestIdOf(request: Request): string {
  return request.headers.get("x-vercel-id") ?? "local";
}

function errorResponse(code: ServerErrorCode, requestId: string): Response {
  log("rejected", { code, status: SERVER_ERRORS[code].http, requestId });
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  if (code === "method_not_allowed") headers.set("allow", "POST");
  return new Response(JSON.stringify(buildErrorBody(code)), { status: SERVER_ERRORS[code].http, headers });
}

function methodNotAllowed(request: Request): Response {
  return errorResponse("method_not_allowed", requestIdOf(request));
}
export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false };
    throw error;
  }
}

// Waits for the first real chunk so a provider failure before any output still gets an HTTP status.
async function respondWhenStreamStarts(stream: ReadableStream<ServerChunk>, requestId: string): Promise<Response> {
  const reader = stream.getReader();
  const head: ServerChunk[] = [];
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    const chunk = next.value;
    if (chunk.type === "error") {
      await reader.cancel();
      return errorResponse(isServerErrorCode(chunk.errorText) ? chunk.errorText : "internal", requestId);
    }
    head.push(chunk);
    if (chunk.type !== "start" && chunk.type !== "start-step") break;
  }
  const replay = new ReadableStream<ServerChunk>({
    start(controller) {
      for (const chunk of head) controller.enqueue(chunk);
    },
    async pull(controller) {
      const next = await reader.read();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return createUIMessageStreamResponse({ stream: replay, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const requestId = requestIdOf(request);

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > ASSISTANT_LIMITS.maxBodyBytes) {
    return errorResponse("payload_too_large", requestId);
  }
  const raw = await request.text();
  if (utf8ByteLength(raw) > ASSISTANT_LIMITS.maxBodyBytes) return errorResponse("payload_too_large", requestId);

  const json = parseJson(raw);
  if (!json.ok) return errorResponse("bad_request", requestId);
  const parsed = chatRequestSchema.safeParse(json.value);
  if (!parsed.success || userTextTooLong(parsed.data.messages)) return errorResponse("bad_request", requestId);
  const validated = await safeValidateUIMessages<ServerMessage>({
    messages: dropUnfinishedUnknownToolParts(parsed.data.messages),
    tools,
  });
  if (!validated.success || validated.data[0]?.role !== "user") return errorResponse("bad_request", requestId);

  let modelMessages: ModelMessage[];
  try {
    modelMessages = await convertToModelMessages(validated.data, { tools, ignoreIncompleteToolCalls: true });
  } catch (error) {
    log("convert_failed", { requestId, name: error instanceof Error ? error.name : typeof error });
    return errorResponse("bad_request", requestId);
  }

  const apiKey = resolveApiKey(process.env.ANTHROPIC_API_KEY);
  if (apiKey === null) {
    log("not_configured", { requestId, missing: "ANTHROPIC_API_KEY" });
    return errorResponse("not_configured", requestId);
  }

  log("model_call", { requestId, messages: validated.data.length });
  const anthropic = createAnthropic({ apiKey });
  const result = streamText({
    model: anthropic(ASSISTANT_MODEL_ID),
    system: buildSystemPrompt(parsed.data.context),
    messages: modelMessages,
    tools,
    maxOutputTokens: ASSISTANT_MAX_OUTPUT_TOKENS,
    abortSignal: request.signal,
    providerOptions: { anthropic: { effort: ASSISTANT_EFFORT } satisfies AnthropicProviderOptions },
    onError: ({ error }) => log("model_error", { requestId, code: classifyStreamError(error) }),
  });
  const chunks = result.toUIMessageStream<ServerMessage>({
    messageMetadata: ({ part }) =>
      part.type === "start" ? { model: ASSISTANT_MODEL_ID, promptVersion: ASSISTANT_PROMPT_VERSION } : undefined,
    onError: (error) => classifyStreamError(error),
  });
  return respondWhenStreamStarts(chunks, requestId);
}
