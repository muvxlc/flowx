import type {
  ChromeStorageArea,
  MediaReference,
  PersistedJob,
  QuarantinedRecord,
  RehydrationReport,
  StoredMedia,
} from './types.ts';
import { MetadataStorage, type MetadataStorageOptions } from './metadata-storage.ts';
import { MediaStorage } from './media-storage.ts';
import { RecoveryManager } from './recovery.ts';

export interface PersistenceServiceOptions extends MetadataStorageOptions {
  readonly mediaStorage?: MediaStorage | undefined;
  readonly recoveryManager?: RecoveryManager | undefined;
}

export class PersistenceService {
  private readonly metadataStorage: MetadataStorage;
  private readonly mediaStorage: MediaStorage;
  private readonly recoveryManager: RecoveryManager;

  constructor(options?: PersistenceServiceOptions) {
    this.metadataStorage = new MetadataStorage({ storage: options?.storage });
    this.mediaStorage = options?.mediaStorage ?? new MediaStorage();
    this.recoveryManager = options?.recoveryManager ?? new RecoveryManager();
  }

  getMetadataStorage(): MetadataStorage {
    return this.metadataStorage;
  }

  getMediaStorage(): MediaStorage {
    return this.mediaStorage;
  }

  getRecoveryManager(): RecoveryManager {
    return this.recoveryManager;
  }

  async saveQueue(jobs: PersistedJob[]): Promise<void> {
    await this.metadataStorage.saveJobs(jobs);
  }

  async rehydrateQueue(): Promise<RehydrationReport> {
    // 1. Load jobs and quarantine corrupt records
    const { validJobs, quarantinedCount } = await this.metadataStorage.loadWithQuarantine();

    // 2. Worker restart recovery (reset interrupted running jobs, preserve completed)
    const restartResult = this.recoveryManager.rehydrateOnWorkerRestart(validJobs);

    // 3. Verify media integrity for jobs with reference IDs
    const integrityResult = await this.recoveryManager.verifyMediaIntegrity(
      restartResult.jobs,
      async (refId) => this.mediaStorage.hasMedia(refId)
    );

    // 4. Save sanitized/rehydrated jobs if state changed
    const needsStateUpdate =
      restartResult.interruptedResetCount > 0 ||
      integrityResult.missingMediaCount > 0 ||
      quarantinedCount > 0;

    if (needsStateUpdate) {
      await this.metadataStorage.saveJobs(integrityResult.jobs);
    }

    return {
      jobs: integrityResult.jobs,
      interruptedResetCount: restartResult.interruptedResetCount,
      missingMediaCount: integrityResult.missingMediaCount,
      quarantinedCount,
    };
  }

  async saveMediaBlob(
    id: string,
    data: Uint8Array | ArrayBuffer | Blob,
    mimeType: string
  ): Promise<MediaReference> {
    return this.mediaStorage.saveMedia(id, data, mimeType);
  }

  async getMediaBlob(id: string): Promise<StoredMedia | null> {
    return this.mediaStorage.getMedia(id);
  }

  async deleteMediaBlob(id: string): Promise<boolean> {
    return this.mediaStorage.deleteMedia(id);
  }

  async getQuarantinedRecords(): Promise<QuarantinedRecord[]> {
    return this.metadataStorage.getQuarantinedRecords();
  }

  async clearAll(): Promise<void> {
    await this.metadataStorage.saveJobs([]);
    await this.metadataStorage.clearQuarantine();
    await this.mediaStorage.clear();
  }
}
