/**
 * Caps Claude-backed chats per UTC day. The count is per server instance and resets on a cold
 * start, so it limits runaway use. The spending limit on the API key is the real ceiling.
 */
export class DailyBudget {
  private day = "";
  private used = 0;

  constructor(
    private readonly limit: number,
    private readonly today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {}

  tryAcquire(): boolean {
    const today = this.today();
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
    }
    if (this.used >= this.limit) return false;
    this.used += 1;
    return true;
  }
}

let shared: DailyBudget | null = null;

export function sharedBudget(): DailyBudget {
  shared ??= new DailyBudget(Number(process.env.CLAUDE_DAILY_LIMIT) || 200);
  return shared;
}

/** Starts the count over. Only tests need this. */
export function resetSharedBudget(): void {
  shared = null;
}
