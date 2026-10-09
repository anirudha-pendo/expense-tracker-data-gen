export const ASSISTANT_ERROR_CODES = [
  "method_not_allowed",
  "payload_too_large",
  "bad_request",
  "not_configured",
  "provider_rate_limited",
  "provider_quota_exhausted",
  "provider_overloaded",
  "provider_error",
  "internal",
  "offline",
  "step_limit",
] as const;

export type AssistantErrorCode = (typeof ASSISTANT_ERROR_CODES)[number];
export type ClientErrorCode = "offline" | "step_limit";
export type ServerErrorCode = Exclude<AssistantErrorCode, ClientErrorCode>;
export type ComposerEffect = "enabled" | "disabled-session" | "disabled-until-online";
export type AlertVariant = "default" | "destructive";

interface ErrorSpecBase {
  retryable: boolean;
  composer: ComposerEffect;
  alert: AlertVariant | null;
  copy: string;
}
export interface ServerErrorSpec extends ErrorSpecBase {
  http: number;
}
export interface AssistantErrorSpec extends ErrorSpecBase {
  http: number | null;
}

const BUSY_COPY = "The assistant is busy right now. Try again in a minute.";
const FAILED_COPY = "The assistant could not answer. Try again.";

export const SERVER_ERRORS: Record<ServerErrorCode, ServerErrorSpec> = {
  method_not_allowed: { http: 405, retryable: false, composer: "enabled", alert: null, copy: "Use POST." },
  payload_too_large: {
    http: 413,
    retryable: false,
    composer: "enabled",
    alert: "destructive",
    copy: "That conversation is too long to send. Reload the page to start over.",
  },
  bad_request: {
    http: 400,
    retryable: false,
    composer: "enabled",
    alert: "destructive",
    copy: "That message couldn't be sent. Reload the page if this keeps happening.",
  },
  not_configured: {
    http: 503,
    retryable: false,
    composer: "disabled-session",
    alert: "default",
    copy: "The assistant isn't set up yet.",
  },
  provider_rate_limited: { http: 429, retryable: true, composer: "enabled", alert: "default", copy: BUSY_COPY },
  provider_quota_exhausted: {
    http: 503,
    retryable: false,
    composer: "disabled-session",
    alert: "default",
    copy: "The assistant has reached its usage limit. Try again later.",
  },
  provider_overloaded: { http: 503, retryable: true, composer: "enabled", alert: "default", copy: BUSY_COPY },
  provider_error: { http: 502, retryable: true, composer: "enabled", alert: "destructive", copy: FAILED_COPY },
  internal: { http: 500, retryable: true, composer: "enabled", alert: "destructive", copy: FAILED_COPY },
};

export const CLIENT_ERRORS: Record<ClientErrorCode, AssistantErrorSpec> = {
  offline: {
    http: null,
    retryable: true,
    composer: "disabled-until-online",
    alert: "default",
    copy: "You're offline. Reconnect to use the assistant.",
  },
  step_limit: {
    http: null,
    retryable: true,
    composer: "enabled",
    alert: "default",
    copy: "Stopped after several steps. Try asking more specifically.",
  },
};

export const ASSISTANT_ERRORS: Record<AssistantErrorCode, AssistantErrorSpec> = { ...SERVER_ERRORS, ...CLIENT_ERRORS };

const CODE_LIST: readonly string[] = ASSISTANT_ERROR_CODES;

export function isAssistantErrorCode(value: unknown): value is AssistantErrorCode {
  return typeof value === "string" && CODE_LIST.includes(value);
}

export function isServerErrorCode(value: unknown): value is ServerErrorCode {
  return isAssistantErrorCode(value) && value !== "offline" && value !== "step_limit";
}

export function errorCopy(code: AssistantErrorCode): string {
  return ASSISTANT_ERRORS[code].copy;
}

export interface AssistantErrorBody {
  error: { code: ServerErrorCode; message: string };
}

export function buildErrorBody(code: ServerErrorCode): AssistantErrorBody {
  return { error: { code, message: errorCopy(code) } };
}

const MAX_ERROR_DEPTH = 4;
// Anthropic gives spend-limit 400s no distinct type; the wording is the only signal (R15).
const QUOTA_WORDING = /usage limit|spend limit|credit balance/i;

function providerText(error: object): string {
  const parts: string[] = [];
  if ("message" in error && typeof error.message === "string") parts.push(error.message);
  if ("responseBody" in error && typeof error.responseBody === "string") parts.push(error.responseBody);
  return parts.join(" ");
}

// null when the error carries no HTTP headers at all (a mid-stream error event).
function hasRetryAfter(error: object): boolean | null {
  if (!("responseHeaders" in error) || typeof error.responseHeaders !== "object" || error.responseHeaders === null) {
    return null;
  }
  return "retry-after" in error.responseHeaders;
}

function classifyByType(type: string): ServerErrorCode | null {
  switch (type) {
    case "rate_limit_error":
      return "provider_rate_limited";
    case "overloaded_error":
      return "provider_overloaded";
    case "billing_error":
      return "provider_quota_exhausted";
    default:
      return null;
  }
}

function classifyByStatus(error: object, status: number): ServerErrorCode {
  switch (status) {
    case 402:
      return "provider_quota_exhausted";
    case 400:
      return QUOTA_WORDING.test(providerText(error)) ? "provider_quota_exhausted" : "provider_error";
    case 429:
      return hasRetryAfter(error) === false ? "provider_quota_exhausted" : "provider_rate_limited";
    case 529:
      return "provider_overloaded";
    default:
      return "provider_error";
  }
}

function classifyProvider(error: unknown, depth: number): ServerErrorCode | null {
  if (typeof error !== "object" || error === null || depth > MAX_ERROR_DEPTH) return null;
  if ("lastError" in error && error.lastError !== error) {
    const inner = classifyProvider(error.lastError, depth + 1);
    if (inner !== null) return inner;
  }
  const type = "type" in error && typeof error.type === "string" ? error.type : null;
  // Mid-stream billing errors arrive as statusCode 400; the type is the precise signal.
  const byType = type === null ? null : classifyByType(type);
  if (byType !== null) return byType;
  if ("statusCode" in error && typeof error.statusCode === "number") return classifyByStatus(error, error.statusCode);
  if (type !== null && type.endsWith("_error")) return "provider_error";
  return null;
}

export function classifyStreamError(error: unknown): ServerErrorCode {
  return classifyProvider(error, 0) ?? "internal";
}

function parseErrorBody(text: string): AssistantErrorCode | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  if (typeof parsed !== "object" || parsed === null || !("error" in parsed)) return null;
  const inner = parsed.error;
  if (typeof inner !== "object" || inner === null || !("code" in inner) || !isAssistantErrorCode(inner.code)) {
    return null;
  }
  return inner.code;
}

function codeForStatus(status: number): AssistantErrorCode {
  switch (status) {
    case 400:
      return "bad_request";
    case 405:
      return "method_not_allowed";
    case 413:
      return "payload_too_large";
    case 429:
      return "provider_rate_limited";
    case 502:
      return "provider_error";
    default:
      return "internal";
  }
}

// Client side: HTTP errors arrive as { statusCode, message: <body> }, stream errors as Error(<code>).
export function parseAssistantError(error: unknown): AssistantErrorCode {
  if (error instanceof TypeError) return "offline";
  if (typeof error !== "object" || error === null) return "internal";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  if (isAssistantErrorCode(message)) return message;
  const body = parseErrorBody(message);
  if (body !== null) return body;
  if ("statusCode" in error && typeof error.statusCode === "number") return codeForStatus(error.statusCode);
  return "internal";
}
