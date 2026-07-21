import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpToolError } from "./backendClient.js";

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

export function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function fail(error: unknown): CallToolResult {
  const payload =
    error instanceof McpToolError
      ? error.toPayload()
      : {
          error: {
            code: "BACKEND_UNAVAILABLE",
            message: error instanceof Error ? error.message : String(error),
            details: {},
          },
        };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

/** Wrap a tool handler so thrown errors become structured tool errors. */
export function handler<A>(fn: (args: A) => Promise<CallToolResult>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return await fn(args);
    } catch (err) {
      return fail(err);
    }
  };
}
