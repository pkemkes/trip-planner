export interface ServerConfig {
  backendBaseUrl: string;
}

/** Resolve runtime configuration from environment variables. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    backendBaseUrl: env.BACKEND_BASE_URL ?? "http://localhost:3001",
  };
}
