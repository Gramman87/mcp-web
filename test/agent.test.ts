import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { POST } from "../app/api/chat/route";
import { runAgent, type ChatMessage } from "../lib/agent";
import { resetSharedBudget } from "../lib/budget";
import { composeAnswer, planCalls } from "../lib/demo";
import { validateMessages } from "../lib/validate";
import { FakeAnthropic, MCP_URL, mcpFetch, message, text, toolUse } from "./helpers";

const ask = (question: string): ChatMessage[] => [{ role: "user", content: question }];
const run = (question: string) => runAgent(ask(question), MCP_URL, { fetch: mcpFetch });

const fake = new FakeAnthropic();

before(async () => {
  process.env.ANTHROPIC_BASE_URL = await fake.start();
  mock.method(console, "error", () => {});
});

after(async () => {
  await fake.stop();
  mock.restoreAll();
});

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.CLAUDE_DAILY_LIMIT;
  fake.requests.length = 0;
  fake.replies = [];
  resetSharedBudget();
});

describe("Claude engine", () => {
  it("offers Claude the tools discovered over MCP", async () => {
    fake.replies = [message("end_turn", text("Hi."))];

    await run("hello");

    assert.deepEqual(
      fake.requests[0].tools?.map((t) => t.name),
      ["get_metrics", "get_customer", "list_customers", "get_tickets", "search_docs", "query_db"],
    );
  });

  it("runs Claude's tool calls over MCP and answers from the results", async () => {
    fake.replies = [
      message("tool_use", toolUse("t1", "get_customer", { query: "hooli" }), toolUse("t2", "get_metrics", {})),
      message("end_turn", text("Hooli is churning.")),
    ];

    const result = await run("How is Hooli?");

    assert.equal(result.engine, "claude");
    assert.equal(result.response, "Hooli is churning.");
    assert.deepEqual(result.tool_calls.map((c) => c.name), ["get_customer", "get_metrics"]);
    assert.equal((result.tool_calls[0].result as { health: string }).health, "churning");

    // Both results go back in one message, in call order.
    const sent = fake.requests[1].messages;
    assert.equal(sent.length, 3);
    const results = sent[2].content as { tool_use_id: string; is_error: boolean }[];
    assert.deepEqual(results.map((r) => r.tool_use_id), ["t1", "t2"]);
    assert.ok(results.every((r) => r.is_error === false));
  });

  it("sends an unknown tool back to Claude as an error instead of failing", async () => {
    fake.replies = [message("tool_use", toolUse("t1", "delete_everything", {})), message("end_turn", text("I can't."))];

    const result = await run("delete it");

    assert.equal(result.response, "I can't.");
    const [toolResult] = fake.requests[1].messages[2].content as { is_error: boolean; content: string }[];
    assert.equal(toolResult.is_error, true);
    assert.match(toolResult.content, /delete_everything/);
  });

  it("marks an answer that hit the token limit", async () => {
    fake.replies = [message("max_tokens", text("Half an ans"))];

    assert.match((await run("q")).response, /^Half an ans[\s\S]*stopped before finishing/);
  });
});

describe("fallback to the rule-based engine", () => {
  const question = "Which accounts are at risk and how much MRR could we lose?";

  it("still uses real MCP tools when there's no key", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await run(question);

    assert.equal(result.engine, "demo");
    assert.match(result.notice!, /no API key/);
    assert.deepEqual(result.tool_calls.map((c) => c.name), ["query_db"]);
    assert.match(result.response, /2 accounts are at risk or churning, with \$31,200 of MRR exposed/);
    assert.equal(fake.requests.length, 0);
  });

  for (const [name, replies] of [
    ["an API 500", [{ status: 500 }]],
    ["an API 400 such as no credits", [{ status: 400 }]],
    ["a refusal, even one with text", [message("refusal", text("I can't help with that."))]],
    ["an empty reply", [message("end_turn")]],
    ["a loop that never answers", [message("tool_use", toolUse("t1", "get_metrics", {}))]],
  ] as const) {
    it(`falls back on ${name}`, async () => {
      fake.replies = [...replies];

      const result = await run(question);

      assert.equal(result.engine, "demo");
      assert.match(result.notice!, /unavailable/);
      assert.match(result.response, /at risk or churning/);
    });
  }

  it("stops calling the API when the daily budget is used up", async () => {
    process.env.CLAUDE_DAILY_LIMIT = "1";
    fake.replies = [message("end_turn", text("Hi."))];

    await run("hello");
    const result = await run(question);

    assert.match(result.notice!, /budget/);
    assert.equal(fake.requests.length, 1);
  });
});

describe("rule-based planning", () => {
  const cases: [string, string[]][] = [
    ["Which accounts are at risk and how much MRR could we lose?", ["query_db"]],
    ["Show me open support tickets. Any patterns?", ["get_tickets"]],
    ["What does our revenue breakdown look like by plan?", ["query_db"]],
    ["Look up Initech: what's their health and any open tickets?", ["get_customer", "get_tickets"]],
    ["What are our current business metrics?", ["get_metrics"]],
    ["Find documentation about security and compliance", ["search_docs"]],
  ];

  for (const [question, tools] of cases) {
    it(`handles "${question}"`, () => assert.deepEqual(planCalls(question).map((c) => c.name), tools));
  }

  it("answers every example with real data over MCP", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    for (const [question] of cases) {
      const result = await run(question);
      assert.ok(result.tool_calls.length > 0, question);
      assert.doesNotMatch(result.response, /undefined|NaN|\[object Object\]/, question);
    }
  });

  it("says when nothing matched rather than guessing", () => {
    assert.match(composeAnswer([]), /nothing in that question matched/);
  });
});

describe("POST /api/chat input checks", () => {
  const chat = (body: string) => POST(new Request("http://test/api/chat", { method: "POST", body }));

  it("rejects bad conversations before calling anything", async () => {
    for (const body of [
      "{nope",
      JSON.stringify({}),
      JSON.stringify({ messages: [] }),
      JSON.stringify({ messages: [{ role: "system", content: "x" }] }),
      JSON.stringify({ messages: [{ role: "user", content: "   " }] }),
      JSON.stringify({ messages: [{ role: "user", content: "x".repeat(2001) }] }),
      JSON.stringify({ messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] }),
      JSON.stringify({ messages: Array.from({ length: 21 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x" })) }),
    ]) {
      assert.equal((await chat(body)).status, 400, body.slice(0, 60));
    }
    assert.equal(fake.requests.length, 0);
  });

  it("accepts a normal conversation", () => {
    assert.equal(validateMessages([{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" }]), null);
  });

  it("hides internals when the tool server is down", async () => {
    // The route connects to its own origin, and nothing is listening at this one.
    const res = await POST(
      new Request("http://127.0.0.1:9/api/chat", { method: "POST", body: JSON.stringify({ messages: ask("hi") }) }),
    );

    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: "The MCP tool server is unavailable." });
  });
});
