import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { POST } from "../app/api/mcp/route";
import { MCP_URL, mcpFetch } from "./helpers";

const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "raw", version: "1" } },
});

const post = (origin?: string) =>
  POST(
    new Request(MCP_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(origin ? { origin } : {}),
      },
      body: INITIALIZE,
    }),
  );

describe("MCP endpoint, through the official client", () => {
  const client = new Client({ name: "test", version: "1" });

  before(() => client.connect(new StreamableHTTPClientTransport(MCP_URL, { fetch: mcpFetch })));
  after(() => client.close());

  it("identifies itself", () => {
    assert.equal(client.getServerVersion()?.name, "mcp-web");
  });

  it("lists all six tools with object schemas", async () => {
    const { tools } = await client.listTools();

    assert.deepEqual(
      tools.map((t) => t.name),
      ["get_metrics", "get_customer", "list_customers", "get_tickets", "search_docs", "query_db"],
    );
    for (const tool of tools) assert.equal(tool.inputSchema.type, "object");
  });

  it("calls a tool", async () => {
    const result = await client.callTool({ name: "get_customer", arguments: { query: "hooli" } });
    const [block] = result.content as { text: string }[];

    assert.equal(JSON.parse(block.text).health, "churning");
  });

  it("reports arguments that break the schema as a tool error", async () => {
    const result = await client.callTool({ name: "list_customers", arguments: { health: "nonsense" } });

    assert.equal(result.isError, true);
  });

  it("rejects an unknown tool with a protocol error", async () => {
    await assert.rejects(client.callTool({ name: "delete_everything", arguments: {} }), /delete_everything/);
  });
});

describe("Origin check", () => {
  it("rejects a page on another site", async () => {
    assert.equal((await post("https://evil.example")).status, 403);
  });

  it("allows the demo site, localhost, and clients that send no Origin", async () => {
    for (const origin of ["https://mcp-web-nine.vercel.app", "http://localhost:3000", undefined]) {
      assert.equal((await post(origin)).status, 200, String(origin));
    }
  });
});
