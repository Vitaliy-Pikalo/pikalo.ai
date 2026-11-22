import { createAskHandler, type AskHandlerDeps } from "@/lib/assistant/api";
import { ask, type AskDeps } from "@/lib/assistant/ask";
import type { Handler } from "@/services/http";

export function createAnswerHandler(
  deps: AskDeps,
  options: Pick<AskHandlerDeps, "localLimitPerMinute"> = {},
): Handler {
  const answer = createAskHandler({ ...options, run: (question) => ask(question, deps) });
  return async (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/healthz" && request.method === "GET")
      return Response.json({ status: "ok" });
    if (path === "/readyz" && request.method === "GET") {
      try {
        await deps.tools.specs();
        return Response.json({ status: "ok" });
      } catch {
        return Response.json({ status: "unavailable" }, { status: 503 });
      }
    }
    if (path !== "/api/ask")
      return Response.json({ error: "Not found." }, { status: 404 });
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { allow: "POST" } });
    return answer(request);
  };
}
