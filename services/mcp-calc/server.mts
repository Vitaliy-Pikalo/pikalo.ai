import { createHttpServer, listen } from "@/services/http";
import { handleMcpRequest } from "@/services/mcp-calc/app";

listen(createHttpServer(handleMcpRequest), 3001, "mcp-calc");
