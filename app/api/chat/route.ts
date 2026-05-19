import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, executeTool } from "@/lib/tools";
import type { ToolResult } from "@/lib/tools";

const SYSTEM_PROMPT = `You are an enterprise data assistant connected to a SaaS platform via the Model Context Protocol (MCP). You have access to 6 tools that let you query customer accounts, business metrics, support tickets, documentation, and run database queries.

Your role:
- Answer questions about the business using the tools available
- Surface actionable insights about customer health, revenue, and support
- Be concise and specific — cite customer names, MRR figures, and ticket IDs
- When analyzing data, explain what the numbers mean and recommend next steps

Always use tools to look up data rather than guessing.`;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const { messages } = await req.json();
  const client = new Anthropic({ apiKey });

  const toolCalls: ToolResult[] = [];
  let anthropicMessages: Anthropic.MessageParam[] = messages.map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  try {
    const MAX_ITERATIONS = 8;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: toolDefinitions,
        messages: anthropicMessages,
      });

      const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");

      if (toolUseBlocks.length === 0) {
        const finalText = textBlocks.map((b) => b.text).join("\n") || "I wasn't able to generate a response.";
        return Response.json({ response: finalText, tool_calls: toolCalls });
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = executeTool(toolUse.name, toolUse.input as Record<string, unknown>);
        toolCalls.push({ name: toolUse.name, input: toolUse.input as Record<string, unknown>, result });
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) });
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
  }
}
