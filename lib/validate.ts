import type { ChatMessage } from "@/lib/agent";

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;

/** Checks the conversation before any of it reaches a paid API. Returns an error message or null. */
export function validateMessages(messages: unknown): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return "messages must be a non-empty array";
  if (messages.length > MAX_MESSAGES) return `conversations are limited to ${MAX_MESSAGES} messages`;
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string" || !m.content.trim()) {
      return "each message needs a role of user or assistant and non-empty text";
    }
    if (m.content.length > MAX_MESSAGE_CHARS) return `messages are limited to ${MAX_MESSAGE_CHARS} characters`;
  }
  if (messages[messages.length - 1].role !== "user") return "the last message must be from the user";
  return null;
}

export type { ChatMessage };
