import type { Job } from '../queue/types.ts';
import type { MetadataStorage, MediaStorage, RecoveryManager } from '../persistence/index.ts';

export interface SchedulerConfig {
  readonly alarmName?: string;
  readonly periodInMinutes?: number;
  readonly baseBackoffMs?: number;
  readonly maxBackoffMs?: number;
  readonly backoffFactor?: number;
  readonly maxRetries?: number;
  readonly staleRunningTimeoutMs?: number;
}

export interface AlarmEvent {
  readonly name: string;
  readonly scheduledTime?: number;
}

export interface AlarmClock {
  now(): number;
  sleep(ms: number): Promise<void>;
  createAlarm(name: string, periodInMinutes: number): void;
  scheduleWakeup?(name: string, delayMs: number): void;
  clearAlarm(name: string): void;
  onAlarm(listener: (alarm: AlarmEvent) => void | Promise<void>): void;
}

export interface SafeQueueSchedulerOptions extends SchedulerConfig {
  readonly queue: {
    step(): Promise<Job | null>;
    getJobs(): Job[];
    getJob(id: string): Job | undefined;
    pause(reason?: string): void;
    resume(): void;
    getQueueStatus(): {
      total: number;
      pending: number;
      running: number;
      completed: number;
      failed: number;
      paused: number;
      needsReview: number;
    };
  };
  readonly clock?: AlarmClock;
  readonly recovery?: RecoveryManager;
  readonly executeStep?: () => Promise<Job | null>;
}

export interface CleanupOptions {
  readonly userConfirmed: boolean;
  readonly deleteQuarantine?: boolean;
}

export interface CleanupContext {
  readonly metadata: MetadataStorage;
  readonly media: MediaStorage;
  readonly options: CleanupOptions;
}

export interface CleanupResult {
  readonly clearedTempBlobsCount: number;
  readonly clearedQuarantineCount: number;
  readonly preservedQueueJobsCount: number;
  readonly preservedKeysCount: number;
  readonly bytesFreed: number;
}

export interface SchedulerStatus {
  readonly isRunning: boolean;
  readonly isPaused: boolean;
  readonly pauseReason: string | null;
  readonly currentBackoffDelayMs: number;
  readonly concurrency: number;
  readonly lastWakeupAt: number | null;
}
