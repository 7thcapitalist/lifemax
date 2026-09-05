const CSRF_KEY = "lifemaxing_csrf";

export type ApiErrorBody = {
  code?: string;
  message?: string;
  fieldErrors?: unknown;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getCsrfToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(CSRF_KEY);
}

export function setCsrfToken(token: string): void {
  sessionStorage.setItem(CSRF_KEY, token);
}

export function clearCsrfToken(): void {
  sessionStorage.removeItem(CSRF_KEY);
}

function originHeader(): string {
  return window.location.origin;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { csrf?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const method = (init.method ?? "GET").toUpperCase();
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (mutating) {
    headers.set("Origin", originHeader());
    if (!headers.has("Content-Type") && init.body !== undefined)
      headers.set("Content-Type", "application/json");
    if (init.csrf !== false) {
      const csrf = getCsrfToken();
      if (csrf) headers.set("X-CSRF-Token", csrf);
    }
    if (!headers.has("Idempotency-Key"))
      headers.set("Idempotency-Key", crypto.randomUUID());
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  const body = await parseBody(response);
  if (!response.ok) {
    const error = (body ?? {}) as ApiErrorBody;
    throw new ApiError(
      response.status,
      error.code ?? "REQUEST_FAILED",
      error.message ?? "Request failed.",
      error.fieldErrors,
    );
  }
  if (
    body &&
    typeof body === "object" &&
    "csrfToken" in body &&
    typeof (body as { csrfToken?: unknown }).csrfToken === "string"
  ) {
    setCsrfToken((body as { csrfToken: string }).csrfToken);
  }
  return body as T;
}
