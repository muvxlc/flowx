export function calculateBackoffDelay(
  attempt: number,
  baseMs = 1000,
  maxMs = 60000,
  factor = 2
): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const exponential = baseMs * Math.pow(factor, safeAttempt);
  return Math.min(exponential, maxMs);
}

export interface BackoffTrackerOptions {
  readonly baseBackoffMs?: number;
  readonly maxBackoffMs?: number;
  readonly backoffFactor?: number;
}

export class BoundedBackoffTracker {
  private readonly baseMs: number;
  private readonly maxMs: number;
  private readonly factor: number;
  private attemptCount = 0;
  private currentDelay = 0;

  constructor(options?: BackoffTrackerOptions) {
    this.baseMs = options?.baseBackoffMs ?? 1000;
    this.maxMs = options?.maxBackoffMs ?? 60000;
    this.factor = options?.backoffFactor ?? 2;
  }

  recordFailure(): number {
    this.currentDelay = calculateBackoffDelay(
      this.attemptCount,
      this.baseMs,
      this.maxMs,
      this.factor
    );
    this.attemptCount++;
    return this.currentDelay;
  }

  recordSuccess(): void {
    this.attemptCount = 0;
    this.currentDelay = 0;
  }

  getCurrentDelay(): number {
    return this.currentDelay;
  }

  getAttemptCount(): number {
    return this.attemptCount;
  }

  reset(): void {
    this.attemptCount = 0;
    this.currentDelay = 0;
  }
}
