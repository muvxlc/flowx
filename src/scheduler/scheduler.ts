import type {
  AlarmClock,
  AlarmEvent,
  SafeQueueSchedulerOptions,
  SchedulerStatus,
} from './types.ts';
import { BoundedBackoffTracker } from './backoff.ts';
import { SystemAlarmClock } from './clock.ts';
import type { Job } from '../queue/types.ts';
import type { RecoveryManager } from '../persistence/index.ts';

export class SafeQueueScheduler {
  private readonly queue: SafeQueueSchedulerOptions['queue'];
  private readonly clock: AlarmClock;
  private readonly recovery?: RecoveryManager | undefined;
  private readonly alarmName: string;
  private readonly periodInMinutes: number;
  private readonly staleRunningTimeoutMs: number;
  private readonly backoffTracker: BoundedBackoffTracker;

  private executeStep: () => Promise<Job | null>;
  private isProcessing = false;
  private paused = false;
  private pauseReason: string | null = null;
  private lastWakeupAt: number | null = null;
  private nextEligibleRunTime = 0;

  constructor(options: SafeQueueSchedulerOptions) {
    this.queue = options.queue;
    this.clock = options.clock ?? new SystemAlarmClock();
    if (options.recovery) {
      this.recovery = options.recovery;
    }
    this.alarmName = options.alarmName ?? 'meta_automator_queue_alarm';
    this.periodInMinutes = options.periodInMinutes ?? 1;
    this.staleRunningTimeoutMs = options.staleRunningTimeoutMs ?? 180_000;

    this.backoffTracker = new BoundedBackoffTracker({
      baseBackoffMs: options.baseBackoffMs ?? 1000,
      maxBackoffMs: options.maxBackoffMs ?? 60000,
      backoffFactor: options.backoffFactor ?? 2,
    });

    this.executeStep = options.executeStep ?? (() => this.queue.step());

    this.clock.onAlarm(async (alarm) => {
      await this.handleAlarm(alarm);
    });
  }

  start(): void {
    this.clock.createAlarm(this.alarmName, this.periodInMinutes);
  }

  stop(): void {
    this.clock.clearAlarm(this.alarmName);
  }

  pause(reason = 'Scheduler paused'): void {
    this.paused = true;
    this.pauseReason = reason;
    this.queue.pause(reason);
  }

  resume(): void {
    this.paused = false;
    this.pauseReason = null;
    this.backoffTracker.reset();
    this.nextEligibleRunTime = 0;
    this.queue.resume();
  }

  isPaused(): boolean {
    return this.paused;
  }

  getPauseReason(): string | null {
    return this.pauseReason;
  }

  getCurrentBackoffDelay(): number {
    return this.backoffTracker.getCurrentDelay();
  }

  getStatus(): SchedulerStatus {
    return {
      isRunning: !this.paused,
      isPaused: this.paused,
      pauseReason: this.pauseReason,
      currentBackoffDelayMs: this.backoffTracker.getCurrentDelay(),
      concurrency: this.isProcessing ? 1 : 0,
      lastWakeupAt: this.lastWakeupAt,
    };
  }

  setStepExecutor(executor: () => Promise<Job | null>): void {
    this.executeStep = executor;
  }

  async probeAndRecoverStaleJobs(): Promise<number> {
    const now = this.clock.now();
    let recoveredCount = 0;
    const jobs = this.queue.getJobs();

    for (const job of jobs) {
      if (job.state === 'running') {
        const startedAt = job.startedAt ?? 0;
        const isStale = (now - startedAt) >= this.staleRunningTimeoutMs;
        if (isStale) {
          recoveredCount++;
          const target = this.queue.getJob(job.id);
          if (!target) continue;

          if (this.recovery) {
            const rehydrateResult = this.recovery.rehydrateOnWorkerRestart([target as unknown as import('../persistence/types.ts').PersistedJob]);
            const recovered = rehydrateResult.jobs[0];
            if (recovered) {
              target.state = recovered.state as Job['state'];
              // @ts-expect-error sync interruptCount
              target.interruptCount = recovered.interruptCount;
              target.startedAt = recovered.startedAt ?? null;
              target.updatedAt = recovered.updatedAt;
              target.error = recovered.error ?? null;
            }
          } else {
            target.state = 'pending';
            target.startedAt = null;
            target.updatedAt = now;
            target.error = `Stale execution timeout (${now - startedAt}ms). Reset to pending.`;
          }
        }
      }
    }

    return recoveredCount;
  }

  async handleAlarm(alarm: AlarmEvent): Promise<void> {
    if (alarm.name !== this.alarmName) {
      return;
    }

    // Never auto-wake when paused
    if (this.paused) {
      return;
    }

    // Concurrency = 1 guard: Coalesce rapid or overlapping alarm fires
    if (this.isProcessing) {
      return;
    }

    const now = this.clock.now();
    if (now < this.nextEligibleRunTime) {
      return;
    }

    this.isProcessing = true;
    this.lastWakeupAt = now;

    try {
      await this.probeAndRecoverStaleJobs();

      const result = await this.executeStep();
      if (result) {
        if (result.state === 'paused') {
          this.paused = true;
          this.pauseReason = result.error ?? 'Queue paused';
        }
        this.backoffTracker.recordSuccess();
        this.nextEligibleRunTime = 0;
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const is429OrChallenge = /429|rate[- ]?limit|challenge|captcha/i.test(errorMsg);

      if (is429OrChallenge) {
        this.paused = true;
        this.pauseReason = errorMsg;
        this.queue.pause(errorMsg);
        this.backoffTracker.reset();
        this.nextEligibleRunTime = 0;
      } else {
        const delay = this.backoffTracker.recordFailure();
        this.nextEligibleRunTime = this.clock.now() + delay;
        if (typeof this.clock.scheduleWakeup === 'function') {
          this.clock.scheduleWakeup(this.alarmName, delay);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
