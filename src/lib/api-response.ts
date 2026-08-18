export class ApiResponseError extends Error {
  readonly code?: string;
  readonly reason?: string;
  readonly retryAfter?: number;

  constructor(message: string, options: { code?: string; reason?: string; retryAfter?: number } = {}) {
    super(message);
    this.name = "ApiResponseError";
    this.code = options.code;
    this.reason = options.reason;
    this.retryAfter = options.retryAfter;
  }
}

type ErrorPayload = {
  code?: string;
  error?: string;
  reason?: string;
  retryAfter?: number;
};

function positiveSeconds(value: unknown) {
  const seconds = typeof value === "number" ? value : Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

export async function readApiJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & ErrorPayload;
  if (response.ok) return body;

  const retryAfter = positiveSeconds(body.retryAfter)
    ?? positiveSeconds(response.headers.get("Retry-After"));
  throw new ApiResponseError(body.error ?? "Something went wrong.", {
    code: body.code,
    reason: body.reason,
    retryAfter,
  });
}

export function isRateLimitError(error: unknown): error is ApiResponseError & { retryAfter: number } {
  return error instanceof ApiResponseError
    && error.code === "RATE_LIMITED"
    && typeof error.retryAfter === "number";
}

export function friendlySearchLimitMessage(reason: string | undefined) {
  if (reason === "tmdb_account_burst" || reason === "tmdb_account_minute") {
    return "You’re searching quickly. Custom titles still work while search cools down.";
  }

  return "TMDB is temporarily busy. Your library and custom titles still work.";
}
