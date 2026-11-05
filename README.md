# MCP Enterprise Server (web)

**Live demo:** https://mcp-web-nine.vercel.app

A Next.js app that serves an MCP server over Streamable HTTP and a chat agent that uses it. The agent connects to `/api/mcp` as a real MCP client, discovers the tools at runtime, and lets Claude call them to answer questions about a fictional SaaS business.

The six tools and their data are a hand-kept copy of [mcp-server](https://github.com/Gramman87/mcp-server), which serves the same tools over stdio and Streamable HTTP as a standalone package.

## How it works

```
Browser ──POST /api/chat──▶ agent ──MCP client──▶ /api/mcp (mcp-handler) ──▶ 6 tools
                              │
                              └──▶ Claude (Messages API, tool use)
```

- **`/api/mcp`** is a stateless MCP server built with `mcp-handler` and the MCP TypeScript SDK. It checks `Origin` as the MCP spec requires: browser pages from other sites get a 403, and clients that send no `Origin` header pass.
- **`/api/chat`** connects to `/api/mcp` over HTTP, lists the tools, and runs Claude's tool loop. Calls from one turn run concurrently, and their results go back in one message.

## Which engine answers

Every answer says which engine produced it.

| Situation | Who answers |
| --------- | ----------- |
| API key set, under the daily limit | Claude, choosing the tools |
| No API key | Keyword rules choosing the tools |
| Daily limit reached | Keyword rules, with no API call |
| API error, refusal, empty reply, or no answer after 8 turns | Keyword rules |

The fallback still calls the tools over MCP, so the demo shows the protocol working either way. It only understands the example questions and says so for anything else.

## Tools

| Tool | What it returns |
| ---- | --------------- |
| `get_metrics` | MRR, ARR, churn, DAU/MAU, NPS |
| `get_customer` | One account by name or ID |
| `list_customers` | Accounts, filtered by health or plan |
| `get_tickets` | Support tickets, filtered by customer or status |
| `search_docs` | Documentation by keyword or category |
| `query_db` | Revenue by plan, at-risk summary, churn risk |

## Connect your own client

```bash
claude mcp add --transport http mcp-web https://mcp-web-nine.vercel.app/api/mcp
```

There's no authentication, which is fine for fictional data and nothing else.

## Configuration

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `ANTHROPIC_API_KEY` | none | Turns on Claude. |
| `CLAUDE_MODEL` | `claude-haiku-4-5-20251001` | Model to use. |
| `CLAUDE_DAILY_LIMIT` | `200` | Claude-backed chats per UTC day. Counted per server instance and reset on a cold start, so also set a spending limit on the key. |
| `MCP_ALLOWED_ORIGINS` | none | Extra comma-separated hostnames allowed to call `/api/mcp` from a browser. |

## Run it

```bash
npm install
cp .env.example .env.local   # optional: add a key to use Claude
npm run dev                  # http://localhost:3000
```

## Test

```bash
npm test
npm run lint && npm run typecheck && npm run build
```

The tests need no API key. They drive `/api/mcp` with the official MCP client, run the chat agent against it with a local fake of the Messages API, and cover the Origin check, each fallback path, and input validation. That shows the app handles the API as modeled in the fake. It doesn't replace a check against the live API.
