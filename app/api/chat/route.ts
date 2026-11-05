import { runAgent, ToolServerUnavailable, type ChatMessage } from "@/lib/agent";
import { validateMessages } from "@/lib/validate";

export const maxDuration = 60;

export async function POST(req: Request) {
  let messages: unknown;
  try {
    ({ messages } = await req.json());
  } catch {
    return Response.json({ error: "Request body must be JSON" }, { status: 400 });
  }
  const invalid = validateMessages(messages);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  // Connect to our own MCP server over Streamable HTTP (same-origin /api/mcp), the same way an
  // agent would reach a remote MCP server.
  const mcpUrl = new URL("/api/mcp", new URL(req.url).origin);
  try {
    return Response.json(await runAgent(messages as ChatMessage[], mcpUrl));
  } catch (err) {
    // Details go to the log. Internals don't belong in a public response.
    console.error("Chat failed:", err);
    const toolsDown = err instanceof ToolServerUnavailable;
    return Response.json(
      { error: toolsDown ? "The MCP tool server is unavailable." : "Something went wrong answering that." },
      { status: toolsDown ? 502 : 500 },
    );
  }
}
