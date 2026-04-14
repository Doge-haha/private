/**
 * Circuit Breaker for compaction provider.
 * Tracks consecutive failures and automatically degrades when threshold is reached.
 */
export class CircuitBreaker {
  private failureCount = 0;
  private state: "closed" | "open" | "half-open" = "closed";
  private openedAt = 0;

  constructor(
    private readonly threshold = 3,
    private readonly resetMs = 60_000,
  ) {}

  /** Check if requests are allowed. */
  get isAvailable(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open") {
      if (Date.now() - this.openedAt >= this.resetMs) {
        this.state = "half-open";
        return true; // allow one probe
      }
      return false;
    }
    return true; // half-open: allow probe
  }

  /** Record a successful call. */
  recordSuccess(): void {
    this.failureCount = 0;
    this.state = "closed";
  }

  /** Record a failure. Opens circuit when threshold is hit. */
  recordFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.threshold) {
      this.state = "open";
      this.openedAt = Date.now();
    }
  }

  /** Current breaker state for diagnostics. */
  get status(): { state: string; failures: number } {
    return { state: this.state, failures: this.failureCount };
  }
}
