export interface ServerConfig {
  backendBaseUrl: string;
  host: string;
  port: number;
}

/** Resolve runtime configuration from environment variables. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    backendBaseUrl: env.BACKEND_BASE_URL ?? "http://localhost:3001",
    // Bind to all interfaces by default so the container is reachable externally.
    host: env.MCP_HOST ?? "0.0.0.0",
    port: parsePort(env.MCP_PORT, 3002),
  };
}

/** Parse a port env var, falling back to the default when unset or invalid. */
function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid MCP_PORT: ${value}`);
  }
  return parsed;
}
