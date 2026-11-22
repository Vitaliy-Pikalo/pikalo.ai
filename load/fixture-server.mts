import { handleFixtureRequest } from "@/load/fixtures";
import { createHttpServer, listen } from "@/services/http";

listen(createHttpServer(handleFixtureRequest), 3002, "local-model-retrieval-fixture");
