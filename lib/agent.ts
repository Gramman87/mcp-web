import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  type StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { sharedBudget } from "@/lib/budget";
import { composeAnswer, planCalls } from "@/lib/demo";

const SYSTEM_PROMPT = `You are an enterprise data assistant connected to a SaaS platform via the Model Context Protocol (MCP). You have access to 6 tools that let you query customer accounts, business metrics, support tickets, documentation, and run database queries.

Your role:
- Answer questions about the business using the tools available
- Surface actionable insights about customer health, revenue, and support
- Be concise and specific: cite customer names, MRR figures, and ticket IDs
- When analyzing data, explain what the numbers mean and recommend next steps
- Write plain text without Markdown, because the answer is displayed as plain text

Always use tools to look up data rather than guessing.`;

export const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";
const MAX_TURNS = 8;

export const NOTICES = {
  noKey: "Demo mode: no API key is configured, so keyword rules picked the tools.",
  overBudget: "Today's live model budget is used up, so keyword rules picked the tools.",
  unavailable: "The live model is unavailable right now, so keyword rules picked the tools.",
};

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ToolCall = { name: string; input: Record<string, unknown>; result: unknown };
export type AgentResult = {
  response: string;
  tool_calls: ToolCall[];
  engine: "claude" | "demo";
  notice: string | null;
};

/** The MCP server couldn't be reached, so neither engine can answer. */
export class ToolServerUnavailable extends Error {}

/** Claude didn't produce an answer we can show, so the turn should fall back. */
class NoAnswer extends Error {}

// MCP tool results arrive as text; our server emits JSON, so parse it back for the UI.
function parseResult(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function callTool(mcp: Client, name: string, input: Record<string, unknown>) {
  // A protocol error, like an unknown tool name, is reported back rather than ending the turn.
  try {
    const result = await mcp.callTool({ name, arguments: input });
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content.map((c) => (c.type === "text" ? c.text : JSON.stringify(c))).join("\n");
    return { text, isError: result.isError === true };
  } catch (err) {
    return { text: err instanceof Error ? err.message : "Tool call failed", isError: true };
  }
}

async function runClaude(client: Anthropic, mcp: Client, messages: ChatMessage[]): Promise<AgentResult> {
  const { tools: mcpTools } = await mcp.listTools();
  const tools: Anthropic.Tool[] = mcpTools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
  }));

  const history: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const toolCalls: ToolCall[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools,
      messages: history,
    });
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();

    if (response.stop_reason === "refusal") throw new NoAnswer("refusal");
    if (response.stop_reason !== "tool_use") {
      if (!text) throw new NoAnswer(`empty reply (${response.stop_reason})`);
      const cutOff = response.stop_reason === "max_tokens" ? "\n\n(The model stopped before finishing this answer.)" : "";
      return { response: text + cutOff, tool_calls: toolCalls, engine: "claude", notice: null };
    }

    // Calls from one turn run concurrently, and every result goes back in a single message.
    const uses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const results = await Promise.all(
      uses.map((use) => callTool(mcp, use.name, (use.input ?? {}) as Record<string, unknown>)),
    );
    uses.forEach((use, i) =>
      toolCalls.push({ name: use.name, input: use.input as Record<string, unknown>, result: parseResult(results[i].text) }),
    );
    history.push(
      { role: "assistant", content: response.content },
      {
        role: "user",
        content: uses.map((use, i) => ({
          type: "tool_result" as const,
          tool_use_id: use.id,
          content: results[i].text,
          is_error: results[i].isError,
        })),
      },
    );
  }
  throw new NoAnswer(`no answer after ${MAX_TURNS} turns`);
}

async function runDemo(mcp: Client, messages: ChatMessage[], notice: string): Promise<AgentResult> {
  const question = messages[messages.length - 1].content;
  const planned = planCalls(question);
  const results = await Promise.all(planned.map((call) => callTool(mcp, call.name, call.input)));
  const calls = planned.map((call, i) => ({ call, result: parseResult(results[i].text), isError: results[i].isError }));
  return {
    response: composeAnswer(calls),
    tool_calls: calls.map(({ call, result }) => ({ name: call.name, input: call.input, result })),
    engine: "demo",
    notice,
  };
}

export async function runAgent(
  messages: ChatMessage[],
  mcpUrl: URL,
  transportOptions: StreamableHTTPClientTransportOptions = {},
): Promise<AgentResult> {
  const mcp = new Client({ name: "mcp-web-chat", version: "1.0.0" });
  try {
    await mcp.connect(new StreamableHTTPClientTransport(mcpUrl, transportOptions));
  } catch (err) {
    throw new ToolServerUnavailable(err instanceof Error ? err.message : String(err));
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return await runDemo(mcp, messages, NOTICES.noKey);
    if (!sharedBudget().tryAcquire()) return await runDemo(mcp, messages, NOTICES.overBudget);

    // One retry and a short timeout: there's a fallback, so a visitor shouldn't wait out an outage.
    const client = new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
    try {
      return await runClaude(client, mcp, messages);
    } catch (err) {
      if (!(err instanceof Anthropic.APIError || err instanceof NoAnswer)) throw err;
      console.error("Falling back from Claude:", err.message);
      return await runDemo(mcp, messages, NOTICES.unavailable);
    }
  } finally {
    await mcp.close().catch(() => {});
  }
}
