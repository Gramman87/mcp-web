import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { customers, metrics, tickets, docs } from "@/lib/data";

// MCP server exposed over Streamable HTTP. The dynamic [transport] segment
// lets mcp-handler serve the protocol endpoint at /api/mcp. The agent route
// (/api/chat) connects to this as a real MCP client — same protocol you'd
// use to reach a remote MCP server, co-located so it runs free on Vercel.
const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_metrics",
      {
        title: "Get Business Metrics",
        description:
          "Returns current SaaS business metrics including MRR, ARR, churn rate, DAU/MAU, and NPS.",
        inputSchema: {},
      },
      async () => ({
        content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }],
      })
    );

    server.registerTool(
      "get_customer",
      {
        title: "Get Customer",
        description:
          "Look up a customer account by name or ID. Returns plan, MRR, health status, seat count, and CSM.",
        inputSchema: { query: z.string().describe("Customer name or ID to look up") },
      },
      async ({ query }) => {
        const q = query.toLowerCase();
        const match = customers.find(
          (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase() === q
        );
        return {
          content: [
            {
              type: "text",
              text: match
                ? JSON.stringify(match, null, 2)
                : `No customer found matching "${query}".`,
            },
          ],
        };
      }
    );

    server.registerTool(
      "list_customers",
      {
        title: "List Customers",
        description: "List customer accounts, optionally filtered by health status or plan.",
        inputSchema: {
          health: z
            .enum(["healthy", "at-risk", "churning", "all"])
            .optional()
            .describe("Filter by health status"),
          plan: z.string().optional().describe("Filter by plan name (e.g. Enterprise, Growth)"),
        },
      },
      async ({ health, plan }) => {
        let result = customers;
        if (health && health !== "all") result = result.filter((c) => c.health === health);
        if (plan) result = result.filter((c) => c.plan.toLowerCase().includes(plan.toLowerCase()));
        return {
          content: [
            { type: "text", text: JSON.stringify({ count: result.length, customers: result }, null, 2) },
          ],
        };
      }
    );

    server.registerTool(
      "get_tickets",
      {
        title: "Get Support Tickets",
        description: "Retrieve support tickets, optionally filtered by customer name or status.",
        inputSchema: {
          customer: z.string().optional().describe("Filter by customer name"),
          status: z.enum(["open", "resolved", "all"]).optional().describe("Filter by ticket status"),
        },
      },
      async ({ customer, status }) => {
        let result = tickets;
        if (customer)
          result = result.filter((t) =>
            t.customer.toLowerCase().includes(customer.toLowerCase())
          );
        if (status && status !== "all") result = result.filter((t) => t.status === status);
        return {
          content: [
            { type: "text", text: JSON.stringify({ count: result.length, tickets: result }, null, 2) },
          ],
        };
      }
    );

    server.registerTool(
      "search_docs",
      {
        title: "Search Documentation",
        description: "Search the documentation library by keyword or category.",
        inputSchema: {
          query: z.string().describe("Search term or category (e.g. api, onboarding, security)"),
        },
      },
      async ({ query }) => {
        const q = query.toLowerCase();
        const results = docs.filter(
          (d) =>
            d.title.toLowerCase().includes(q) ||
            d.category.toLowerCase().includes(q) ||
            d.tags.some((t) => t.includes(q))
        );
        return {
          content: [
            {
              type: "text",
              text:
                results.length > 0
                  ? JSON.stringify({ count: results.length, docs: results }, null, 2)
                  : "No documentation found matching that query.",
            },
          ],
        };
      }
    );

    server.registerTool(
      "query_db",
      {
        title: "Query Database",
        description:
          "Run a structured query against the customer database. Supported queries: revenue_by_plan, at_risk_summary, churn_risk.",
        inputSchema: {
          query_type: z
            .enum(["revenue_by_plan", "at_risk_summary", "churn_risk"])
            .describe("The type of query to run"),
        },
      },
      async ({ query_type }) => {
        let payload: unknown;
        if (query_type === "revenue_by_plan") {
          const byPlan: Record<string, number> = {};
          for (const c of customers) byPlan[c.plan] = (byPlan[c.plan] ?? 0) + c.mrr;
          payload = byPlan;
        } else if (query_type === "at_risk_summary") {
          const atRisk = customers.filter((c) => c.health !== "healthy");
          payload = {
            count: atRisk.length,
            at_risk_mrr: atRisk.reduce((s, c) => s + c.mrr, 0),
            accounts: atRisk,
          };
        } else {
          const churning = customers.filter((c) => c.health === "churning");
          payload = {
            churning_accounts: churning,
            total_mrr_at_risk: churning.reduce((s, c) => s + c.mrr, 0),
          };
        }
        return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
      }
    );
  },
  {},
  { basePath: "/api", maxDuration: 60 }
);

export { handler as GET, handler as POST };
