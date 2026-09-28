import { WorkflowOrchestrator } from '../integration/workflow-orchestrator.ts';
import { RuntimeBridge } from '../integration/service-bridge.ts';
import { QueueController } from '../ui/queue/queue-controller.ts';
import { CreateController } from '../ui/create/create-controller.ts';
import { renderDownloadsView } from '../ui/downloads/downloads-view.ts';
import type { DownloadItem } from '../exports/types.ts';
import { SettingsController } from '../ui/settings/settings-controller.ts';
import { SettingsService } from '../settings/service.ts';
import { ChromeLocalStorageAdapter, MemoryStorageAdapter } from '../settings/storage.ts';
import { PersistenceService } from '../persistence/service.ts';
import type { Job } from '../queue/types.ts';
import { WorkerMediatedSettings } from './settings-mediator.ts';
import { renderAndBindQueueTab } from './queue-glue.ts';
import { renderAndBindCreateTab } from './create-glue.ts';
import type { WorkerQueueStatus } from '../integration/worker-runtime-types.ts';

export type TabId = 'queue' | 'create' | 'downloads' | 'settings';

export class SidePanelApp {
  private activeTab: TabId = 'queue';
  readonly orchestrator: WorkflowOrchestrator;
  readonly bridge: RuntimeBridge;
  readonly queueController: QueueController;
  readonly createController: CreateController;
  readonly settingsController: SettingsController;
  readonly settingsMediator: WorkerMediatedSettings;
  readonly settingsService: SettingsService;
  readonly persistence: PersistenceService;
  private downloadsFilter: 'all' | 'image' | 'video' = 'all';
  private jobs: Job[] = [];
  private queueRunning = false;
  private statusAlert: string | null = null;
  private errorMessage: string | null = null;
  private inspectingJobId: string | null = null;

  constructor(options?: {
    orchestrator?: WorkflowOrchestrator;
    persistence?: PersistenceService;
    settingsService?: SettingsService;
    bridge?: RuntimeBridge;
  }) {
    this.persistence = options?.persistence ?? new PersistenceService();
    const storageAdapter =
      typeof chrome !== 'undefined' && chrome.storage?.local
        ? new ChromeLocalStorageAdapter()
        : new MemoryStorageAdapter();
    this.settingsService = options?.settingsService ?? new SettingsService(storageAdapter);
    this.orchestrator =
      options?.orchestrator ?? new WorkflowOrchestrator({ persistence: this.persistence });
    this.bridge = options?.bridge ?? new RuntimeBridge();

    this.queueController = new QueueController({
      persistence: this.persistence,
      onStateChange: () => {
        if (this.activeTab === 'queue') this.render();
      },
    });

    this.createController = new CreateController();

    const dummyContainer =
      typeof document !== 'undefined'
        ? (document.getElementById('panel-content') ?? document.createElement('div'))
        : ({} as HTMLElement);
    this.settingsController = new SettingsController(this.settingsService, dummyContainer);
    this.settingsMediator = new WorkerMediatedSettings(this.bridge, dummyContainer);
  }

  getActiveTab(): TabId {
    return this.activeTab;
  }

  async init(): Promise<void> {
    await this.updateWorkerStatus();
    await this.syncQueueFromWorker();
    await this.settingsMediator.init();
    this.render();
  }

  async updateWorkerStatus(): Promise<boolean> {
    const isAlive = await this.bridge.ping();
    if (typeof document !== 'undefined') {
      const statusText = document.getElementById('worker-status-text');
      const statusIndicator = document.getElementById('worker-status-indicator');
      if (statusText) statusText.textContent = isAlive ? 'SW Active' : 'SW Standby';
      if (statusIndicator) statusIndicator.style.opacity = isAlive ? '1' : '0.6';
    }
    return isAlive;
  }

  async syncQueueFromWorker(): Promise<void> {
    try {
      const resp = (await this.bridge.sendCommand('QUEUE_COMMAND', { command: 'STATUS' })) as {
        success?: boolean;
        status?: WorkerQueueStatus;
        error?: string;
      };
      if (resp?.success && resp.status) {
        this.jobs = resp.status.jobs ?? [];
        this.queueRunning = !resp.status.isPaused;
        return;
      }
      if (this.bridge.hasRuntime()) {
        this.errorMessage = resp?.error ?? 'Extension worker rejected status query';
        this.jobs = [];
        this.queueRunning = false;
        return;
      }
    } catch (err: unknown) {
      if (this.bridge.hasRuntime()) {
        this.errorMessage = err instanceof Error ? err.message : 'Failed to communicate with extension worker';
        this.jobs = [];
        this.queueRunning = false;
        return;
      }
    }
    await this.queueController.loadFromPersistence();
    this.jobs = [...this.queueController.getState().jobs];
    this.queueRunning = this.queueController.getState().queueRunning;
  }

  switchTab(tabId: TabId): void {
    this.activeTab = tabId;
    if (typeof document === 'undefined') return;

    const tabs: TabId[] = ['queue', 'create', 'downloads', 'settings'];
    for (const id of tabs) {
      const btn = document.getElementById(`tab-${id}`);
      if (btn) {
        const isActive = id === tabId;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
      }
    }
    this.render();
  }

  render(): void {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('panel-content');
    if (!container) return;

    if (this.activeTab === 'queue') {
      renderAndBindQueueTab(
        container,
        {
          jobs: this.jobs,
          queueRunning: this.queueRunning,
          statusAlert: this.statusAlert,
          errorMessage: this.errorMessage,
          inspectingJobId: this.inspectingJobId,
        },
        this.bridge,
        {
          onStateUpdate: (patch) => {
            if (patch.jobs !== undefined) this.jobs = patch.jobs;
            if (patch.queueRunning !== undefined) this.queueRunning = patch.queueRunning;
            if (patch.statusAlert !== undefined) this.statusAlert = patch.statusAlert;
            if (patch.errorMessage !== undefined) this.errorMessage = patch.errorMessage;
            if (patch.inspectingJobId !== undefined) this.inspectingJobId = patch.inspectingJobId;
            this.render();
          },
          onFallbackStep: async () => {
            if (this.bridge.hasRuntime()) return null;
            const stepped = await this.orchestrator.step();
            if (stepped) {
              this.jobs = this.orchestrator.getJobs();
            }
            return stepped;
          },
          onFallbackToggle: async (start) => {
            if (this.bridge.hasRuntime()) return;
            if (start) {
              this.orchestrator.resume();
              await this.queueController.resumeQueue();
            } else {
              this.orchestrator.pause('Operator paused queue');
              await this.queueController.pauseQueue('Operator paused queue');
            }
            this.queueRunning = start;
            this.render();
          },
        }
      );
    } else if (this.activeTab === 'create') {
      renderAndBindCreateTab(container, this.createController, this.bridge, {
        onBatchEnqueued: (newJobs) => {
          this.jobs = [...this.jobs, ...newJobs];
          this.switchTab('queue');
        },
        onRefresh: () => this.render(),
      });
    } else if (this.activeTab === 'downloads') {
      this.renderDownloadsTab(container);
    } else if (this.activeTab === 'settings') {
      this.settingsMediator.container = container;
      this.settingsMediator.bridge = this.bridge;
      this.settingsMediator.render();
    }
  }

  private renderDownloadsTab(container: HTMLElement): void {
    const completed = this.jobs.filter((j) => j.state === 'completed');
    const items: DownloadItem[] = completed.map((j) => {
      const isMock = j.result?.mediaUrl?.startsWith('mock://') || false;
      return {
        id: j.id,
        jobId: j.id,
        filename: `${j.id}.${j.media === 'video' ? 'mp4' : 'png'}`,
        mediaType: j.media,
        downloadStatus: isMock ? 'error' : 'completed',
        resolution: '1024x1024',
        url: j.result?.mediaUrl ?? '',
        completedAt: j.completedAt ?? Date.now(),
      };
    });

    container.innerHTML = renderDownloadsView({
      items,
      activeFilter: this.downloadsFilter,
    });

    container.querySelector('#btnExportCsv')?.addEventListener('click', () => {
      const csv = this.orchestrator.exportCsv({ includePrompt: true });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meta_automator_export_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}

export async function pingServiceWorker(): Promise<boolean> {
  const bridge = new RuntimeBridge();
  return bridge.ping();
}

let appInstance: SidePanelApp | null = null;

export function initSidePanel(): SidePanelApp {
  if (!appInstance) {
    appInstance = new SidePanelApp();
    if (typeof document !== 'undefined') {
      const tabs: TabId[] = ['queue', 'create', 'downloads', 'settings'];
      for (const tabId of tabs) {
        document.getElementById(`tab-${tabId}`)?.addEventListener('click', () => {
          appInstance?.switchTab(tabId);
        });
      }
      void appInstance.init();
    }
  }
  return appInstance;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initSidePanel());
  } else {
    initSidePanel();
  }
}
