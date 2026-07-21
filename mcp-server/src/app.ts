import express, { type Express, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { BackendClient } from "./backendClient.js";
import { registerTools } from "./tools.js";

/** Path of the Streamable HTTP MCP endpoint. */
export const MCP_ENDPOINT = "/mcp";

/** Build a fresh MCP server with every tool registered against the backend. */
function createMcpServer(backend: BackendClient): McpServer {
  const server = new McpServer({
    name: "trip-planner-mcp-server",
    version: "1.0.0",
  });
  registerTools(server, backend);
  return server;
}

/**
 * Create the Express app exposing the stateless Streamable HTTP MCP endpoint.
 * Each POST gets its own server and transport so no session state is shared.
 */
export function createHttpApp(backend: BackendClient): Express {
  const app = express();
  app.use(express.json());

  app.post(MCP_ENDPOINT, async (req: Request, res: Response) => {
    const server = createMcpServer(backend);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[trip-planner-mcp] request error:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // A stateless server has no long-lived session or server-initiated stream.
  app.get(MCP_ENDPOINT, methodNotAllowed);
  app.delete(MCP_ENDPOINT, methodNotAllowed);

  return app;
}

function methodNotAllowed(_req: Request, res: Response): void {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method Not Allowed" },
    id: null,
  });
}
