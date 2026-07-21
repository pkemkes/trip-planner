import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BackendClient, McpToolError } from "./backendClient.js";

/** Build a BackendClient whose fetch is stubbed with the given response. */
function clientWith(responder: (url: URL, init: RequestInit) => Response): BackendClient {
  const client = new BackendClient({ baseUrl: "http://backend.test" });
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: URL | string | Request, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(String(input));
    return responder(url, init ?? {});
  }) as typeof fetch;
  // Restore on process exit is unnecessary for short test runs, but keep a
  // reference so individual tests can restore if needed.
  (client as unknown as { _restore: () => void })._restore = () => {
    globalThis.fetch = original;
  };
  return client;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("BackendClient error normalization", () => {
  it("returns parsed JSON on success", async () => {
    const client = clientWith(() => jsonResponse(200, [{ id: "1" }]));
    const result = await client.request<{ id: string }[]>("/api/maps");
    assert.deepEqual(result, [{ id: "1" }]);
  });

  it("returns undefined for 204 responses", async () => {
    const client = clientWith(() => new Response(null, { status: 204 }));
    const result = await client.request("/api/maps/x/pins/y", { method: "DELETE" });
    assert.equal(result, undefined);
  });

  it("maps a structured backend error to McpToolError", async () => {
    const client = clientWith(() =>
      jsonResponse(404, { error: { code: "MAP_NOT_FOUND", message: "Map not found", details: {} } })
    );
    await assert.rejects(
      () => client.request("/api/maps/x"),
      (err: unknown) => {
        assert.ok(err instanceof McpToolError);
        assert.equal(err.code, "MAP_NOT_FOUND");
        return true;
      }
    );
  });

  it("maps a validation error code", async () => {
    const client = clientWith(() =>
      jsonResponse(400, {
        error: { code: "VALIDATION_ERROR", message: "bad", details: { field: "name" } },
      })
    );
    await assert.rejects(
      () => client.request("/api/maps", { method: "POST", body: {} }),
      (err: unknown) => err instanceof McpToolError && err.code === "VALIDATION_ERROR"
    );
  });

  it("maps an ENTITY_DELETED conflict", async () => {
    const client = clientWith(() =>
      jsonResponse(409, { error: { code: "ENTITY_DELETED", message: "deleted", details: {} } })
    );
    await assert.rejects(
      () => client.request("/api/maps/x/pins/y", { method: "PATCH", body: {} }),
      (err: unknown) => err instanceof McpToolError && err.code === "ENTITY_DELETED"
    );
  });

  it("falls back to BACKEND_UNAVAILABLE on network failure", async () => {
    const client = new BackendClient({ baseUrl: "http://backend.test" });
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    try {
      await assert.rejects(
        () => client.request("/api/maps"),
        (err: unknown) => err instanceof McpToolError && err.code === "BACKEND_UNAVAILABLE"
      );
    } finally {
      globalThis.fetch = original;
    }
  });

  it("normalizes legacy plain error payloads by status", async () => {
    const client = clientWith(() => jsonResponse(404, { error: "Map not found" }));
    await assert.rejects(
      () => client.request("/api/maps/x"),
      (err: unknown) => err instanceof McpToolError && err.code === "MAP_NOT_FOUND"
    );
  });
});
