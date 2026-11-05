import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const SYSTEM_PROMPT = `You are an enterprise data assistant connected to a SaaS platform via the Model Context Protocol (MCP). You have access to 6 tools that let you query customer accounts, business metrics, support tickets, documentation, and run database queries.

Your role:
- Answer questions about the business using the tools available
- Surface actionable insights about customer health, revenue, and support
- Be concise and specific — cite customer names, MRR figures, and ticket IDs
- When analyzing data, explain what the numbers mean and recommend next steps

Always use tools to look up data rather than guessing.`;

type ToolCall = { name: string; input: Record<string, unknown>; result: unknown };

// MCP tool results arrive as text content blocks; our server emits JSON, so
// parse it back to an object for the UI (which renders it with JSON.stringify).
function parseResult(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const { messages } = await req.json();
  const anthropic = new Anthropic({ apiKey });

  // Connect to our own MCP server over Streamable HTTP (same-origin /api/mcp).
  const mcpUrl = new URL("/api/mcp", new URL(req.url).origin);
  const mcpClient = new Client({ name: "mcp-web-chat", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(mcpUrl);

  const toolCalls: ToolCall[] = [];

  try {
    await mcpClient.connect(transport);

    // Discover tools from the MCP server and map them to Anthropic's format.
    const { tools: mcpTools } = await mcpClient.listTools();
    const anthropicTools: Anthropic.Tool[] = mcpTools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
    }));

    let anthropicMessages: Anthropic.MessageParam[] = messages.map(
      (m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })
    );

    const MAX_ITERATIONS = 8;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: anthropicTools,
        messages: anthropicMessages,
      });

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );

      if (toolUseBlocks.length === 0) {
        const finalText =
          textBlocks.map((b) => b.text).join("\n") || "I wasn't able to generate a response.";
        return Response.json({ response: finalText, tool_calls: toolCalls });
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const input = (toolUse.input ?? {}) as Record<string, unknown>;
        // A protocol error, like an unknown tool name, goes back to Claude rather than ending the turn.
        let resultText: string;
        let isError: boolean;
        try {
          const mcpResult = await mcpClient.callTool({ name: toolUse.name, arguments: input });
          const content = Array.isArray(mcpResult.content) ? mcpResult.content : [];
          resultText = content
            .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
            .join("\n");
          isError = mcpResult.isError === true;
        } catch (err) {
          resultText = err instanceof Error ? err.message : "Tool call failed";
          isError = true;
        }

        toolCalls.push({ name: toolUse.name, input, result: parseResult(resultText) });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: resultText,
          is_error: isError,
        });
      }

      anthropicMessages = [
        ...anthropicMessages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ];
    }

    return Response.json({ response: "Hit processing limit.", tool_calls: toolCalls });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Agent error:", message);
    return Response.json({ error: message }, { status: 500 });
  } finally {
    await mcpClient.close().catch(() => {});
  }
}
