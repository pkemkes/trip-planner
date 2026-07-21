import Database from "better-sqlite3";
import type { AddressInfo } from "net";
import { createApp } from "./createApp.js";

export interface TestServer {
  baseUrl: string;
  db: Database.Database;
  close: () => Promise<void>;
}

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
}

/**
 * Spin up the real Express app against an in-memory SQLite database on an
 * ephemeral port. Exercises the actual HTTP route handlers (including the
 * error middleware) so integration tests cover happy and negative paths.
 */
export async function startTestServer(options: { seed?: boolean } = {}): Promise<TestServer> {
  const db = new Database(":memory:");
  const { httpServer } = createApp(db, { seed: options.seed ?? false, serveStatic: false });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    db,
    close: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close((err) => {
          db.close();
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

/** Perform a JSON request against the test server and parse the response. */
export async function api<T = unknown>(
  baseUrl: string,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<ApiResponse<T>> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  return { status: res.status, body: body as T };
}
