import type { Job, JobResult, MediaTarget, JobMode } from '../../queue/types.ts';

export type MetaErrorCode =
  | 'G0_BLOCKED'
  | 'AUTH_REQUIRED'
  | 'CHALLENGE_DETECTED'
  | 'UI_CHANGED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'DUPLICATE_SUBMISSION'
  | 'INVALID_JOB';

export type SimulatedMetaState =
  | 'normal'
  | 'changed-ui'
  | 'login-required'
  | 'challenge'
  | 'rate-limited'
  | 'timeout';

export type MockArtifactFormat = 'mock-protocol' | 'safe-data-uri';

export interface MetaMockResult extends JobResult {
  readonly downloadable: boolean;
  readonly isMockArtifact: true;
}

export interface MetaAdapterSuccess {
  status: 'completed';
  result: MetaMockResult | JobResult;
  code?: never;
  error?: never;
  retryable?: never;
}

export interface MetaAdapterFailure {
  status: 'failed' | 'needs-review' | 'paused';
  code: MetaErrorCode;
  error: string;
  result?: null;
  retryable: boolean;
}

export type MetaAdapterResult = MetaAdapterSuccess | MetaAdapterFailure;

export interface MetaLifecycleEvent {
  type: 'START' | 'PROGRESS' | 'COMPLETE' | 'FAIL' | 'PAUSE';
  jobId: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

export interface MetaAdapterOptions {
  simulatedState?: SimulatedMetaState;
  latencyMs?: number;
  onLifecycleEvent?: (event: MetaLifecycleEvent) => void;
  artifactFormat?: MockArtifactFormat;
}

export interface MetaAdapter {
  execute(job: Job, options?: MetaAdapterOptions): Promise<MetaAdapterResult>;
  cancel?(jobId: string): Promise<boolean>;
}
