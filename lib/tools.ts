import { customers, metrics, tickets, docs } from "./data";
import type Anthropic from "@anthropic-ai/sdk";

export type ToolResult = {
  name: string;
  input: Record<string, unknown>;
  result: unknown;
};

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "get_metrics",
    description: "Returns current SaaS business metrics including MRR, ARR, churn rate, DAU/MAU, and NPS.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_customer",
    description: "Look up a customer account by name or ID. Returns plan, MRR, health status, seat count, and CSM.",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string", description: "Customer name or ID to look up" } },
      required: ["query"],
    },
  },
  {
    name: "list_customers",
    description: "List customer accounts, optionally filtered by health status or plan.",
    input_schema: {
      type: "object" as const,
      properties: {
        health: { type: "string", enum: ["healthy", "at-risk", "churning", "all"], description: "Filter by health status" },
        plan: { type: "string", description: "Filter by plan name (e.g. Enterprise, Growth)" },
      },
      required: [],
    },
  },
  {
    name: "get_tickets",
    description: "Retrieve support tickets, optionally filtered by customer name or status.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer: { type: "string", description: "Filter by customer name" },
        status: { type: "string", enum: ["open", "resolved", "all"], description: "Filter by ticket status" },
      },
      required: [],
    },
  },
  {
    name: "search_docs",
    description: "Search the documentation library by keyword or category.",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string", description: "Search term or category (e.g. api, onboarding, security)" } },
      required: ["query"],
    },
  },
  {
    name: "query_db",
    description: "Run a structured query against the customer database. Supported queries: revenue_by_plan, at_risk_summary, churn_risk.",
    input_schema: {
      type: "object" as const,
      properties: { query_type: { type: "string", enum: ["revenue_by_plan", "at_risk_summary", "churn_risk"], description: "The type of query to run" } },
      required: ["query_type"],
    },
  },
];

export function executeTool(name: string, input: Record<string, unknown>): unknown {
  switch (name) {
    case "get_metrics":
      return metrics;

    case "get_customer": {
      const q = (input.query as string).toLowerCase();
      const match = customers.find((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase() === q);
      return match ?? { error: `No customer found matching "${input.query}"` };
    }

    case "list_customers": {
      let result = [...customers];
      if (input.health && input.health !== "all") result = result.filter((c) => c.health === input.health);
      if (input.plan) result = result.filter((c) => c.plan.toLowerCase().includes((input.plan as string).toLowerCase()));
      return { count: result.length, customers: result };
    }

    case "get_tickets": {
      let result = [...tickets];
      if (input.customer) result = result.filter((t) => t.customer.toLowerCase().includes((input.customer as string).toLowerCase()));
      if (input.status && input.status !== "all") result = result.filter((t) => t.status === input.status);
      return { count: result.length, tickets: result };
    }

    case "search_docs": {
      const q = (input.query as string).toLowerCase();
      const results = docs.filter((d) => d.title.toLowerCase().includes(q) || d.category.toLowerCase().includes(q) || d.tags.some((t) => t.includes(q)));
      return results.length > 0 ? { count: results.length, docs: results } : { error: "No documentation found matching that query." };
    }

    case "query_db": {
      if (input.query_type === "revenue_by_plan") {
        const byPlan: Record<string, number> = {};
        for (const c of customers) byPlan[c.plan] = (byPlan[c.plan] ?? 0) + c.mrr;
        return byPlan;
      }
      if (input.query_type === "at_risk_summary") {
        const atRisk = customers.filter((c) => c.health !== "healthy");
        return { count: atRisk.length, at_risk_mrr: atRisk.reduce((s, c) => s + c.mrr, 0), accounts: atRisk };
      }
      if (input.query_type === "churn_risk") {
        const churning = customers.filter((c) => c.health === "churning");
        return { churning_accounts: churning, total_mrr_at_risk: churning.reduce((s, c) => s + c.mrr, 0) };
      }
      return { error: "Unknown query type." };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
