import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { GET, POST } from "../app/api/mcp/route";

export const MCP_URL = new URL("http://mcp.test/api/mcp");

/** Sends the MCP client's HTTP requests straight to the route handler, in process. */
export const mcpFetch = (url: string | URL, init?: RequestInit) =>
  (init?.method === "GET" ? GET : POST)(new Request(url, init));

type Reply = { status: number } | { message: unknown };

/** A local stand-in for the Messages API, so the real SDK runs with no key and no spend. */
export class FakeAnthropic {
  readonly requests: { messages: { role: string; content: unknown }[]; tools?: { name: string }[] }[] = [];
  replies: Reply[] = [];
  private server!: Server;

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        this.requests.push(JSON.parse(raw));
        const reply = this.replies.length > 1 ? this.replies.shift()! : this.replies[0];
        res.writeHead("status" in reply ? reply.status : 200, { "content-type": "application/json" });
        res.end(JSON.stringify("status" in reply ? { type: "error", error: { type: "api_error", message: "boom" } } : reply.message));
      });
    });
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  stop(): Promise<void> {
    this.server.closeAllConnections();
    return new Promise((r) => this.server.close(() => r()));
  }
}

export function message(stop_reason: string, ...content: unknown[]) {
  return {
    message: {
      id: "msg_1", type: "message", role: "assistant", model: "test", stop_reason, stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 }, content,
    },
  };
}

export const text = (value: string) => ({ type: "text", text: value });
export const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });
