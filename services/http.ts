import { createServer, type Server } from "node:http";

export type Handler = (request: Request) => Promise<Response>;
const MAX_BODY_BYTES = 16_384;

/** JSON request/response bridge; these services do not stream model tokens or SSE. */
export function createHttpServer(handler: Handler): Server {
  return createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          outgoing.writeHead(413, { "content-type": "application/json" });
          outgoing.end(JSON.stringify({ error: "Request too large." }));
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      // Direct local/internal listener: do not trust caller-supplied proxy headers.
      headers.set("x-forwarded-for", incoming.socket.remoteAddress ?? "unknown");
      const method = incoming.method ?? "GET";
      const request = new Request(new URL(incoming.url ?? "/", "http://localhost"), {
        method,
        headers,
        ...(method !== "GET" && method !== "HEAD"
          ? { body: Buffer.concat(chunks).toString("utf8") }
          : {}),
      });
      const response = await handler(request);
      const body = Buffer.from(await response.arrayBuffer());
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(body);
    } catch {
      console.error(JSON.stringify({ event: "http_request_failed" }));
      if (!outgoing.headersSent)
        outgoing.writeHead(500, { "content-type": "application/json" });
      outgoing.end(JSON.stringify({ error: "Internal server error." }));
    }
  });
}

export function listen(server: Server, defaultPort: number, name: string) {
  const port = Number(process.env.PORT ?? defaultPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  const host = process.env.HOST ?? "127.0.0.1";
  server.listen(port, host, () =>
    console.log(JSON.stringify({ event: "listening", name, host, port })),
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 70_000).unref();
    });
  }
}
