/**
 * Runs the Pikalo MCP tool server over stdio.
 *
 *   npm run mcp
 *
 * Claude Desktop config (claude_desktop_config.json):
 *   { "mcpServers": { "pikalo": { "command": "npm", "args": ["run", "--silent", "mcp"],
 *     "cwd": "/path/to/pikalo.ai" } } }
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPikaloServer } from "@/lib/mcp/server";

await createPikaloServer().connect(new StdioServerTransport());
