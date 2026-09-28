import type { Job, JobResult } from '../../queue/types.ts';
import type {
  MetaAdapter,
  MetaAdapterOptions,
  MetaAdapterResult,
  MetaLifecycleEvent,
  MetaMockResult,
} from './types.ts';

export function isMockArtifactUrl(url: string): boolean {
  return url.startsWith('mock://') || url.startsWith('mock:');
}

export function isDownloadableArtifact(result: JobResult): boolean {
  if ('downloadable' in result && typeof (result as Record<string, unknown>).downloadable === 'boolean') {
    return Boolean((result as Record<string, unknown>).downloadable);
  }
  return !isMockArtifactUrl(result.mediaUrl);
}

export class MetaMockAdapter implements MetaAdapter {
  private readonly defaultOptions: MetaAdapterOptions;
  private readonly inFlight = new Set<string>();
  private readonly completedCache = new Map<string, JobResult>();

  constructor(options: MetaAdapterOptions = {}) {
    this.defaultOptions = options;
  }

  async execute(job: Job, overrideOptions?: MetaAdapterOptions): Promise<MetaAdapterResult> {
    const opts = { ...this.defaultOptions, ...overrideOptions };
    const simulatedState = opts.simulatedState ?? 'normal';

    // 1. Idempotency check: if job was already completed, return cached result
    if (this.completedCache.has(job.id)) {
      const cached = this.completedCache.get(job.id)!;
      return { status: 'completed', result: cached };
    }

    if (job.result && job.idempotencyKey) {
      this.completedCache.set(job.id, job.result);
      return { status: 'completed', result: job.result };
    }

    // 2. In-flight check: reject duplicate concurrent execution of the same job
    if (this.inFlight.has(job.id)) {
      this.emitEvent(opts, {
        type: 'FAIL',
        jobId: job.id,
        timestamp: Date.now(),
        details: { reason: 'DUPLICATE_SUBMISSION' }
      });
      return {
        status: 'failed',
        code: 'DUPLICATE_SUBMISSION',
        error: `Duplicate submission rejected: Job ${job.id} is already in-flight.`,
        retryable: false
      };
    }

    this.inFlight.add(job.id);
    this.emitEvent(opts, {
      type: 'START',
      jobId: job.id,
      timestamp: Date.now()
    });

    try {
      if (opts.latencyMs && opts.latencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, opts.latencyMs));
      }

      // 3. Fail-closed safety gate simulations
      if (simulatedState === 'changed-ui') {
        this.emitEvent(opts, {
          type: 'FAIL',
          jobId: job.id,
          timestamp: Date.now()
        });
        return {
          status: 'needs-review',
          code: 'UI_CHANGED',
          error: 'Selector not found (missing selector): Meta AI layout changed. Operator review required.',
          retryable: false
        };
      }

      if (simulatedState === 'login-required') {
        this.emitEvent(opts, {
          type: 'PAUSE',
          jobId: job.id,
          timestamp: Date.now()
        });
        return {
          status: 'paused',
          code: 'AUTH_REQUIRED',
          error: 'Authentication required: Meta session expired or login required.',
          retryable: false
        };
      }

      if (simulatedState === 'challenge') {
        this.emitEvent(opts, {
          type: 'PAUSE',
          jobId: job.id,
          timestamp: Date.now()
        });
        return {
          status: 'paused',
          code: 'CHALLENGE_DETECTED',
          error: 'Verification challenge detected: CAPTCHA required. Zero silent retries.',
          retryable: false
        };
      }

      if (simulatedState === 'rate-limited') {
        this.emitEvent(opts, {
          type: 'PAUSE',
          jobId: job.id,
          timestamp: Date.now()
        });
        return {
          status: 'paused',
          code: 'RATE_LIMITED',
          error: 'HTTP 429: Meta AI generation rate limit reached. Queue paused.',
          retryable: true
        };
      }

      if (simulatedState === 'timeout') {
        this.emitEvent(opts, {
          type: 'FAIL',
          jobId: job.id,
          timestamp: Date.now()
        });
        return {
          status: 'needs-review',
          code: 'TIMEOUT',
          error: 'Execution timeout: Upstream generation exceeded 180s limit.',
          retryable: false
        };
      }

      // 4. Generate deterministic result based on media target and mode
      const result = this.generateMockResult(job, opts);
      this.completedCache.set(job.id, result);

      this.emitEvent(opts, {
        type: 'COMPLETE',
        jobId: job.id,
        timestamp: Date.now(),
        details: { mediaUrl: result.mediaUrl }
      });

      return {
        status: 'completed',
        result
      };
    } finally {
      this.inFlight.delete(job.id);
    }
  }

  private generateMockResult(job: Job, opts: MetaAdapterOptions): MetaMockResult {
    const isVideo = job.media === 'video';
    const refSuffix = job.referenceId ? `_${job.referenceId}` : '';
    const ext = isVideo ? 'mp4' : 'png';
    const mimeType = isVideo ? 'video/mp4' : 'image/png';
    const format = opts.artifactFormat ?? 'mock-protocol';

    let mediaUrl: string;
    let downloadable: boolean;

    if (format === 'safe-data-uri') {
      mediaUrl = isVideo
        ? 'data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29tYXZjMQAA'
        : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      downloadable = true;
    } else {
      mediaUrl = `mock://meta-ai/generated/${isVideo ? 'vid' : 'img'}_${job.id}${refSuffix}.${ext}`;
      downloadable = false;
    }

    const result: MetaMockResult = {
      idempotencyKey: job.idempotencyKey ?? `idem_meta_${job.id}`,
      mediaUrl,
      mediaType: job.media,
      mimeType,
      width: isVideo ? 1280 : 1024,
      height: isVideo ? 720 : 1024,
      completedAt: Date.now(),
      downloadable,
      isMockArtifact: true
    };

    if (isVideo) {
      result.durationSeconds = 5;
    }

    return result;
  }

  private emitEvent(opts: MetaAdapterOptions, event: MetaLifecycleEvent): void {
    if (opts.onLifecycleEvent) {
      opts.onLifecycleEvent(event);
    }
  }

  async cancel(jobId: string): Promise<boolean> {
    const wasActive = this.inFlight.has(jobId);
    this.inFlight.delete(jobId);
    return wasActive;
  }
}
