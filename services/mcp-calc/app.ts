import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createPikaloServer } from "@/lib/mcp/server";
import type { Handler } from "@/services/http";

export const handleMcpRequest: Handler = async (request) => {
  const path = new URL(request.url).pathname;
  if ((path === "/healthz" || path === "/readyz") && request.method === "GET") {
    return Response.json({ status: "ok" });
  }
  if (path !== "/mcp") return Response.json({ error: "Not found." }, { status: 404 });
  // This is a server-to-server endpoint. Browser-origin requests are unsupported.
  if (request.headers.has("origin")) return new Response(null, { status: 403 });
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { allow: "POST" } });

  // Each request is independent: replicas need no shared sessions or sticky routing.
  const server = createPikaloServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    // Consume before closing the transport that owns the response stream.
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: response.headers,
    });
  } finally {
    await server.close();
  }
};
