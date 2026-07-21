/**
 * Structured error codes shared with the backend error contract. MCP tools
 * normalize all failures into one of these codes so the LLM can recover
 * deterministically.
 */
export const MCP_ERROR_CODES = [
  "MAP_NOT_FOUND",
  "PIN_NOT_FOUND",
  "ZONE_NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "ENTITY_DELETED",
  "BACKEND_UNAVAILABLE",
] as const;

export type McpErrorCode = (typeof MCP_ERROR_CODES)[number];

export class McpToolError extends Error {
  code: McpErrorCode;
  details: Record<string, unknown>;

  constructor(code: McpErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "McpToolError";
    this.code = code;
    this.details = details;
  }

  toPayload(): { error: { code: McpErrorCode; message: string; details: Record<string, unknown> } } {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

const BACKEND_ERROR_CODES: ReadonlySet<string> = new Set<McpErrorCode>(MCP_ERROR_CODES);

export interface BackendClientOptions {
  baseUrl: string;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | undefined>;
}

/**
 * Thin wrapper around the trip-planner REST backend. Translates HTTP/network
 * failures into structured McpToolError instances.
 */
export class BackendClient {
  private readonly baseUrl: string;

  constructor(options: BackendClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) url.searchParams.set(key, value);
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        headers: options.body ? { "Content-Type": "application/json" } : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (err) {
      throw new McpToolError(
        "BACKEND_UNAVAILABLE",
        `Backend request failed: ${(err as Error).message}`,
        { path }
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    let payload: unknown = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      throw this.normalizeError(response.status, payload);
    }

    return payload as T;
  }

  private normalizeError(httpStatus: number, payload: unknown): McpToolError {
    const errorObj =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as { error: unknown }).error
        : null;

    if (errorObj && typeof errorObj === "object") {
      const { code, message, details } = errorObj as {
        code?: string;
        message?: string;
        details?: Record<string, unknown>;
      };
      if (code && BACKEND_ERROR_CODES.has(code)) {
        return new McpToolError(code as McpErrorCode, message ?? "Backend error", details ?? {});
      }
    }

    // Legacy/plain error payloads or unexpected statuses.
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Backend responded with status ${httpStatus}`;

    if (httpStatus === 404) return new McpToolError("MAP_NOT_FOUND", message);
    if (httpStatus === 400) return new McpToolError("VALIDATION_ERROR", message);
    if (httpStatus === 409) return new McpToolError("CONFLICT", message);
    return new McpToolError("BACKEND_UNAVAILABLE", message, { httpStatus });
  }
}
