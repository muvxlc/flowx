export type MediaTarget = 'image' | 'video';
export type JobMode = 'text-only' | 'single-ref' | 'paired-ref';
export type ProviderId = 'meta' | 'mock';

export interface ReferenceAsset {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  lastModified?: number;
}

export interface PromptSource {
  type: 'paste' | 'file';
  fileName?: string;
  rawText: string;
}

export interface ImportLimits {
  readonly maxFileSizeBytes: number;
  readonly allowedMimeTypes: readonly string[];
  readonly maxPromptLength: number;
  readonly maxBatchCount: number;
  readonly isVerifiedUpstream: boolean;
  readonly uiUnsupportedFlag: string;
}

export interface ImportConfig {
  limits?: Partial<ImportLimits>;
}

export interface ImportError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ImportInput {
  media: MediaTarget;
  mode: JobMode;
  promptSource: PromptSource;
  references: readonly (ReferenceAsset | null | undefined)[];
  provider?: ProviderId;
  settings?: Record<string, unknown>;
}

export interface ImportedJobDraft {
  id: string;
  media: MediaTarget;
  mode: JobMode;
  prompt: string;
  referenceId: string | null;
  provider: ProviderId;
  settings: Record<string, unknown>;
  state: 'draft';
  createdAt: number;
}

export interface ImportPreview {
  promptCount: number;
  referenceCount: number;
  estimatedJobs: number;
  mode: JobMode;
  media: MediaTarget;
  isValid: boolean;
  errors: readonly ImportError[];
  isVerifiedUpstream: boolean;
  uiUnsupportedFlag: string;
}

export interface ImportResult {
  success: boolean;
  jobs: readonly ImportedJobDraft[];
  errors: readonly ImportError[];
  preview: ImportPreview;
}
