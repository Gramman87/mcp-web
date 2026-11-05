import { customers } from "@/lib/data";

/** A tool call the rule-based engine makes, over the same MCP connection Claude would use. */
export type PlannedCall = { name: string; input: Record<string, unknown> };

const DOC_TERMS = ["security", "compliance", "api", "onboarding", "pricing", "troubleshooting", "sso", "webhooks"];

/** Picks tools from keywords. It can't reason, so it covers the example questions and little else. */
export function planCalls(question: string): PlannedCall[] {
  const q = question.toLowerCase();
  const customer = customers.find((c) => q.includes(c.name.toLowerCase()) || q.includes(c.id.toLowerCase()));
  if (customer) {
    return [
      { name: "get_customer", input: { query: customer.name } },
      { name: "get_tickets", input: { customer: customer.name } },
    ];
  }
  if (/\b(risk|churn\w*|lose)\b/.test(q)) return [{ name: "query_db", input: { query_type: "at_risk_summary" } }];
  if (/\btickets?\b|\bsupport\b/.test(q)) {
    return [{ name: "get_tickets", input: /\bopen\b/.test(q) ? { status: "open" } : {} }];
  }
  if (/\b(plan|breakdown)\b/.test(q)) return [{ name: "query_db", input: { query_type: "revenue_by_plan" } }];
  if (/\b(docs?|documentation|guide)\b/.test(q)) {
    return [{ name: "search_docs", input: { query: DOC_TERMS.find((t) => q.includes(t)) ?? q.split(/\s+/).pop() ?? "" } }];
  }
  if (/\b(customers?|accounts?)\b/.test(q)) return [{ name: "list_customers", input: {} }];
  if (/\b(metrics?|mrr|arr|revenue|nps|dau|mau)\b/.test(q)) return [{ name: "get_metrics", input: {} }];
  return [];
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

type Row = Record<string, unknown>;

function describe(call: PlannedCall, result: unknown): string {
  const r = (result ?? {}) as Row;
  switch (call.name) {
    case "get_metrics":
      return `MRR is ${usd(r.mrr as number)} (${usd(r.arr as number)} ARR), churn is ${r.churnRate}%, NPS is ${r.nps}, across ${(r.activeAccounts as number).toLocaleString("en-US")} active accounts.`;
    case "get_customer":
      return typeof result === "string"
        ? result
        : `${r.name} is on the ${r.plan} plan at ${usd(r.mrr as number)} MRR, with health "${r.health}" and ${r.csm} as CSM.`;
    case "get_tickets": {
      const tickets = (r.tickets ?? []) as Row[];
      if (tickets.length === 0) return "No matching tickets.";
      return `${tickets.length} ticket${tickets.length === 1 ? "" : "s"}: ${tickets
        .map((t) => `${t.id} (${t.customer}, ${t.priority} priority, ${t.status}): ${t.subject}`)
        .join("; ")}.`;
    }
    case "list_customers":
      return `${r.count} accounts: ${((r.customers ?? []) as Row[]).map((c) => `${c.name} (${c.health})`).join(", ")}.`;
    case "search_docs":
      return typeof result === "string"
        ? result
        : `Found ${r.count}: ${((r.docs ?? []) as Row[]).map((d) => d.title).join(", ")}.`;
    case "query_db":
      if (call.input.query_type === "revenue_by_plan") {
        return `MRR by plan: ${Object.entries(r).map(([plan, mrr]) => `${plan} ${usd(mrr as number)}`).join(", ")}.`;
      }
      return `${r.count} accounts are at risk or churning, with ${usd(r.at_risk_mrr as number)} of MRR exposed: ${((r.accounts ?? []) as Row[])
        .map((a) => `${a.name} (${a.health}, ${usd(a.mrr as number)})`)
        .join(", ")}.`;
    default:
      return JSON.stringify(result);
  }
}

export function composeAnswer(calls: { call: PlannedCall; result: unknown; isError: boolean }[]): string {
  if (calls.length === 0) {
    return "In this mode I can only match keywords to tools, and nothing in that question matched. Try one of the examples: metrics, at-risk accounts, open tickets, revenue by plan, a customer name, or docs.";
  }
  return calls.map(({ call, result, isError }) => (isError ? `${call.name} failed: ${String(result)}` : describe(call, result))).join("\n\n");
}
