import type { Job } from '../queue/types.ts';
import { QueueManager } from '../queue/queue.ts';
import { PersistenceService } from '../persistence/service.ts';
import type { ChromeStorageArea, RehydrationReport } from '../persistence/types.ts';
import { createMemoryChromeStorage } from '../persistence/memory-storage.ts';
import { FakeAlarmClock, SystemAlarmClock } from '../scheduler/clock.ts';
import type { AlarmClock } from '../scheduler/types.ts';
import { MetaMockAdapter } from '../providers/meta/mock-adapter.ts';
import type { MetaAdapter } from '../providers/meta/types.ts';
import { G0_VERDICT } from '../providers/meta/gate.ts';
import { G1_VERDICT } from '../jev/gate.ts';
import { JevGate } from './jev-gate.ts';
import { SettingsService } from '../settings/service.ts';
import { ChromeLocalStorageAdapter, MemoryStorageAdapter } from '../settings/storage.ts';
import type { StorageAdapter, UpdateSettingsInput } from '../settings/types.ts';
import type { EnqueuePayload, SafeSettingsSummary } from './types.ts';
import type { WorkerRuntimeOptions, WorkerQueueStatus } from './worker-runtime-types.ts';
import type { JobEditPayload } from '../ui/queue/types.ts';
import { executeWorkerEnqueue } from './worker-enqueue.ts';
import { executeWorkerStep } from './worker-step-executor.ts';
import {
  clearCompletedFromWorker,
  moveWorkerJob,
  reorderWorkerJobs,
  editWorkerJob,
  duplicateWorkerJob,
  cancelWorkerJob,
  retryWorkerJob,
} from './worker-queue-mutations.ts';
import {
  ChromeStorageAreaAdapter,
  getWorkerSettings,
  updateWorkerSettings,
  saveWorkerSettingsKey,
  removeWorkerSettingsKey,
  type WorkerSettingsSummary,
} from './worker-settings.ts';

const INTENT_KEY = 'meta_automator_queue_intent';

export class WorkerRuntime {
  private readonly queue = new QueueManager();
  private readonly storageArea: ChromeStorageArea;
  private readonly persistence: PersistenceService;
  private readonly metaAdapter: MetaAdapter;
  private readonly clock: AlarmClock;
  private readonly alarmName: string;
  private readonly settingsStorage: StorageAdapter;
  private readonly settingsService: SettingsService;
  private readonly jevGate: JevGate;
  private intent: 'idle' | 'active' | 'paused' = 'idle';
  private paused = true;
  private pauseReason: string | null = null;
  private isProcessing = false;

  constructor(options?: WorkerRuntimeOptions) {
    this.storageArea =
      options?.storageArea ??
      (typeof chrome !== 'undefined' && chrome.storage?.local
        ? (chrome.storage.local as unknown as ChromeStorageArea)
        : createMemoryChromeStorage());
    this.persistence = new PersistenceService({ storage: this.storageArea });
    this.metaAdapter = options?.metaAdapter ?? new MetaMockAdapter();
    this.clock =
      options?.clock ??
      (typeof chrome !== 'undefined' && chrome.alarms ? new SystemAlarmClock() : new FakeAlarmClock());
    this.alarmName = options?.alarmName ?? 'meta_automator_queue_alarm';

    const settingsStorage =
      options?.settingsStorage ??
      (options?.storageArea
        ? new ChromeStorageAreaAdapter(options.storageArea)
        : typeof chrome !== 'undefined' && chrome.storage?.local
          ? new ChromeLocalStorageAdapter()
          : new MemoryStorageAdapter());
    this.settingsStorage = settingsStorage;
    this.settingsService = new SettingsService(settingsStorage);
    this.jevGate = new JevGate({ live: false, enabled: false, consent: false });
  }

  async init(): Promise<RehydrationReport & { resetToPendingCount: number }> {
    const rawData = await this.storageArea.get(INTENT_KEY);
    const rawIntent = rawData[INTENT_KEY];
    if (rawIntent && typeof rawIntent === 'object') {
      const intentObj = rawIntent as { intent?: string; reason?: string };
      if (intentObj.intent === 'paused') {
        this.intent = 'paused';
        this.paused = true;
        this.pauseReason = intentObj.reason ?? 'Operator paused queue';
      } else if (intentObj.intent === 'active') {
        this.intent = 'active';
        this.paused = false;
        this.pauseReason = null;
        this.clock.createAlarm(this.alarmName, 1);
      } else {
        this.intent = 'idle';
        this.paused = true;
        this.pauseReason = null;
      }
    } else {
      this.intent = 'idle';
      this.paused = true;
      this.pauseReason = null;
    }

    const report = await this.persistence.rehydrateQueue();
    (this.queue as unknown as { jobs: Job[] }).jobs = [];
    for (const j of report.jobs) {
      this.queue.addJob(j as Job);
    }
    return {
      ...report,
      resetToPendingCount: report.interruptedResetCount,
    };
  }

  async enqueue(
    payload: EnqueuePayload
  ): Promise<{ success: boolean; jobs: Job[]; error?: string }> {
    return executeWorkerEnqueue(this.queue, this.persistence, payload);
  }

  async start(): Promise<{ success: boolean; status: WorkerQueueStatus }> {
    this.intent = 'active';
    this.paused = false;
    this.pauseReason = null;
    await this.storageArea.set({ [INTENT_KEY]: { intent: 'active' } });
    this.clock.createAlarm(this.alarmName, 1);
    return { success: true, status: await this.getStatus() };
  }

  async pause(reason?: string): Promise<{ success: boolean; status: WorkerQueueStatus }> {
    this.intent = 'paused';
    this.paused = true;
    this.pauseReason = reason ?? 'Operator paused queue';
    await this.storageArea.set({
      [INTENT_KEY]: {
        intent: 'paused',
        reason: this.pauseReason,
      },
    });
    this.clock.clearAlarm(this.alarmName);
    return { success: true, status: await this.getStatus() };
  }

  private replaceJob(job: Job): void {
    const list = (this.queue as unknown as { jobs: Job[] }).jobs;
    const idx = list.findIndex((j) => j.id === job.id);
    if (idx !== -1) {
      list[idx] = job;
    }
  }

  async step(): Promise<{ success: boolean; job: Job | null; status: WorkerQueueStatus }> {
    if (this.isProcessing || this.intent === 'paused') {
      return { success: true, job: null, status: await this.getStatus() };
    }

    this.isProcessing = true;
    try {
      const res = await executeWorkerStep({
        queue: this.queue,
        persistence: this.persistence,
        jevGate: this.jevGate,
        metaAdapter: this.metaAdapter,
        replaceJob: (job) => this.replaceJob(job),
        onPause: async (reason) => {
          await this.pause(reason);
        },
      });
      return { ...res, status: await this.getStatus() };
    } finally {
      this.isProcessing = false;
    }
  }

  async handleAlarm(name: string): Promise<void> {
    if (name === this.alarmName && !this.paused && this.intent === 'active') {
      await this.step();
    }
  }

  async clearCompleted(): Promise<{ success: boolean; clearedCount: number; status: WorkerQueueStatus }> {
    const res = await clearCompletedFromWorker(this.queue, this.persistence);
    return { ...res, status: await this.getStatus() };
  }

  async moveJob(
    jobId: string,
    direction: -1 | 1
  ): Promise<{ success: boolean; error?: string; status: WorkerQueueStatus }> {
    const res = await moveWorkerJob(this.queue, this.persistence, jobId, direction);
    return { ...res, status: await this.getStatus() };
  }

  async reorderJobs(
    orderedIds: readonly string[]
  ): Promise<{ success: boolean; error?: string; status: WorkerQueueStatus }> {
    const res = await reorderWorkerJobs(this.queue, this.persistence, orderedIds);
    return { ...res, status: await this.getStatus() };
  }

  async editJob(
    jobId: string,
    updates: JobEditPayload
  ): Promise<{ success: boolean; job?: Job; error?: string; status: WorkerQueueStatus }> {
    const res = await editWorkerJob(this.queue, this.persistence, jobId, updates);
    return { ...res, status: await this.getStatus() };
  }

  async duplicateJob(
    jobId: string
  ): Promise<{ success: boolean; duplicate?: Job; error?: string; status: WorkerQueueStatus }> {
    const res = await duplicateWorkerJob(this.queue, this.persistence, jobId);
    return { ...res, status: await this.getStatus() };
  }

  async cancelJob(
    jobId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string; status: WorkerQueueStatus }> {
    const res = await cancelWorkerJob(this.queue, this.persistence, jobId, reason);
    return { ...res, status: await this.getStatus() };
  }

  async retryJob(
    jobId: string
  ): Promise<{ success: boolean; retried?: Job; error?: string; status: WorkerQueueStatus }> {
    const res = await retryWorkerJob(this.queue, this.persistence, jobId);
    return { ...res, status: await this.getStatus() };
  }

  async saveSettingsKey(
    key: string,
    preferences?: UpdateSettingsInput
  ): Promise<{ success: boolean; hasKey: boolean; settings?: WorkerSettingsSummary }> {
    return saveWorkerSettingsKey(this.settingsService, this.settingsStorage, key, preferences);
  }

  async removeSettingsKey(): Promise<{ success: boolean; hasKey: boolean; settings?: WorkerSettingsSummary }> {
    return removeWorkerSettingsKey(this.settingsService);
  }

  async updateSettings(input: UpdateSettingsInput): Promise<WorkerSettingsSummary> {
    return updateWorkerSettings(this.settingsService, input);
  }

  async getSettings(): Promise<WorkerSettingsSummary> {
    return getWorkerSettings(this.settingsService);
  }

  async getStatus(): Promise<WorkerQueueStatus> {
    const jobs = this.queue.getJobs();
    return {
      totalJobs: jobs.length,
      pendingCount: jobs.filter((j) => j.state === 'pending').length,
      runningCount: jobs.filter((j) => j.state === 'running').length,
      completedCount: jobs.filter((j) => j.state === 'completed').length,
      failedCount: jobs.filter((j) => j.state === 'failed').length,
      needsReviewCount: jobs.filter((j) => j.state === 'needs-review').length,
      isPaused: this.paused,
      pauseReason: this.pauseReason,
      isRunning: this.intent === 'active' && !this.paused,
      intent: this.intent,
      jobs,
    };
  }
}

