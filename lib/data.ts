export const customers = [
  { id: "C001", name: "Acme Corp", plan: "Enterprise", mrr: 28400, health: "healthy" as const, seats: 420, csm: "Jordan Lee" },
  { id: "C002", name: "Globex Systems", plan: "Enterprise", mrr: 22100, health: "healthy" as const, seats: 310, csm: "Jordan Lee" },
  { id: "C003", name: "Initech", plan: "Growth", mrr: 18900, health: "at-risk" as const, seats: 280, csm: "Sam Rivera" },
  { id: "C004", name: "Umbrella Inc", plan: "Enterprise", mrr: 15600, health: "healthy" as const, seats: 210, csm: "Sam Rivera" },
  { id: "C005", name: "Hooli", plan: "Growth", mrr: 12300, health: "churning" as const, seats: 180, csm: "Jordan Lee" },
];

export const metrics = {
  mrr: 482000,
  arr: 5784000,
  churnRate: 2.1,
  activeAccounts: 1340,
  dau: 12840,
  mau: 41200,
  nps: 62,
};

export const tickets = [
  { id: "T-1042", customer: "Initech", subject: "SSO not working after password reset", priority: "high", status: "open", created: "2026-05-17" },
  { id: "T-1039", customer: "Hooli", subject: "API rate limits too low for batch jobs", priority: "high", status: "open", created: "2026-05-16" },
  { id: "T-1035", customer: "Acme Corp", subject: "Custom role permissions question", priority: "medium", status: "resolved", created: "2026-05-14" },
  { id: "T-1031", customer: "Globex Systems", subject: "Data export format request", priority: "low", status: "resolved", created: "2026-05-12" },
];

export const docs = [
  { id: "D001", title: "Product Onboarding Guide", category: "onboarding", tags: ["setup", "sso", "users"] },
  { id: "D002", title: "API Reference v2", category: "developer", tags: ["api", "endpoints", "auth"] },
  { id: "D003", title: "Security & Compliance Overview", category: "trust", tags: ["soc2", "gdpr", "hipaa"] },
  { id: "D004", title: "Pricing & Plans", category: "sales", tags: ["pricing", "enterprise", "discount"] },
  { id: "D005", title: "Troubleshooting Guide", category: "support", tags: ["errors", "webhooks", "sync"] },
];
