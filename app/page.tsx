"use client";

import { useState, useRef, useEffect } from "react";

type ToolCall = { name: string; input: Record<string, unknown>; result: unknown };
type Message = {
  role: "user" | "assistant";
  content: string;
  tool_calls?: ToolCall[];
  engine?: "claude" | "demo";
  notice?: string | null;
  failed?: boolean;
};

const TOOL_LABELS: Record<string, string> = {
  get_metrics: "Get Metrics",
  get_customer: "Customer Lookup",
  list_customers: "List Customers",
  get_tickets: "Support Tickets",
  search_docs: "Doc Search",
  query_db: "Database Query",
};

const TOOL_COLORS: Record<string, string> = {
  get_metrics: "text-cyan-400",
  get_customer: "text-emerald-400",
  list_customers: "text-emerald-400",
  get_tickets: "text-amber-400",
  search_docs: "text-violet-400",
  query_db: "text-pink-400",
};

const EXAMPLES = [
  "Which accounts are at risk and how much MRR could we lose?",
  "Show me open support tickets. Any patterns?",
  "What does our revenue breakdown look like by plan?",
  "Look up Initech: what's their health and any open tickets?",
  "What are our current business metrics?",
  "Find documentation about security and compliance",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text?: string) => {
    const msg = text ?? input.trim();
    if (!msg || loading) return;
    setInput("");

    const userMsg: Message = { role: "user", content: msg };
    // Drop a failed exchange so the history alternates cleanly.
    const kept = messages.filter((m, i) => !m.failed && !messages[i + 1]?.failed);
    const updated = [...kept, userMsg];
    setMessages(updated);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updated.filter((m) => !m.failed).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setMessages([...updated, { role: "assistant", content: `Error: ${data.error ?? res.status}`, failed: true }]);
      } else {
        setMessages([
          ...updated,
          { role: "assistant", content: data.response, tool_calls: data.tool_calls, engine: data.engine, notice: data.notice },
        ]);
      }
    } catch {
      setMessages([...updated, { role: "assistant", content: "Failed to reach the server. Please try again.", failed: true }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0f]">
      <header className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" /></svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">MCP Enterprise Server</h1>
            <p className="text-xs text-gray-600">Model Context Protocol &middot; 6 tools &middot; Fictional sample data</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href="https://github.com/Gramman87/mcp-web" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-600 hover:text-white transition-colors border border-white/[0.06] rounded-full px-3 py-1">
            View source
          </a>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {messages.length === 0 && (
            <div className="space-y-8">
              <div className="text-center pt-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600/20 to-teal-600/20 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" /></svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">MCP Enterprise Server</h2>
                <p className="text-gray-500 max-w-lg mx-auto mb-8">
                  This is a web interface for an MCP (Model Context Protocol) server with 6 enterprise tools. The agent queries customers, metrics, tickets, docs, and runs database queries to answer your questions.
                </p>

                {/* Tool cards */}
                <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto mb-8">
                  {Object.entries(TOOL_LABELS).map(([key, label]) => (
                    <div key={key} className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                      <p className={`text-xs font-semibold ${TOOL_COLORS[key]}`}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => send(ex)} className="text-left text-sm text-gray-400 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 hover:border-emerald-500/30 hover:text-white transition-colors">
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`mb-6 ${msg.role === "user" ? "flex justify-end" : ""}`}>
              {msg.role === "user" ? (
                <div className="bg-emerald-600/20 border border-emerald-500/20 rounded-2xl rounded-tr-md px-5 py-3 max-w-lg">
                  <p className="text-sm text-white whitespace-pre-wrap">{msg.content}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {msg.tool_calls.map((tc, j) => {
                        const key = `${i}-${j}`;
                        const isExpanded = expandedTool === key;
                        return (
                          <div key={j} className="w-full">
                            <button
                              onClick={() => setExpandedTool(isExpanded ? null : key)}
                              className="flex items-center gap-2 text-xs bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 hover:border-emerald-500/30 transition-colors w-full text-left"
                            >
                              <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              <span className={`font-medium ${TOOL_COLORS[tc.name] || "text-emerald-300"}`}>{TOOL_LABELS[tc.name] || tc.name}</span>
                              <span className="text-gray-600 truncate">{JSON.stringify(tc.input)}</span>
                              <svg className={`w-3 h-3 text-gray-600 ml-auto shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </button>
                            {isExpanded && (
                              <pre className="mt-1 text-xs text-gray-500 bg-black/30 border border-white/[0.04] rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto">
                                {JSON.stringify(tc.result, null, 2)}
                              </pre>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                  {msg.engine && (
                    <p className="text-xs text-gray-600">
                      {msg.engine === "claude" ? "Answered by Claude" : "Rule-based demo"}
                      {msg.notice && <span className="text-amber-300/80"> &middot; {msg.notice}</span>}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="mb-6">
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2.5 w-fit">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                Querying tools...
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-white/[0.06] px-6 py-4 shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about customers, metrics, tickets, docs..."
              rows={1}
              className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 resize-none"
            />
            <button onClick={() => send()} disabled={!input.trim() || loading} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-5 py-3 rounded-xl transition-colors text-sm font-semibold shrink-0">
              Send
            </button>
          </div>
          <p className="text-xs text-gray-700 mt-2 text-center">
            The agent reaches these tools over MCP at /api/mcp &middot; the same tools run over stdio in the mcp-server repo
          </p>
        </div>
      </div>
    </div>
  );
}
