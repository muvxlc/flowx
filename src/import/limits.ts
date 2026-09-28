import type { ImportLimits } from './types.ts';

/**
 * Conservative configurable import limits.
 * Per G0 Gate findings, Meta AI web canvas does not document or verify
 * official bulk limits in consumer UI. Therefore, limits are marked
 * isVerifiedUpstream = false and uiUnsupportedFlag = 'UNVERIFIED_UPSTREAM_LIMIT'.
 */
export const DEFAULT_IMPORT_LIMITS: ImportLimits = {
  // Conservative 10 MB per reference image
  maxFileSizeBytes: 10 * 1024 * 1024,
  // Conservative standard web image MIME types
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  // 2,000 characters maximum per prompt line
  maxPromptLength: 2000,
  // 500 prompts per import batch
  maxBatchCount: 500,
  // Explicit unverified upstream marker
  isVerifiedUpstream: false,
  // UI flag indicating limits are heuristic/unverified upstream
  uiUnsupportedFlag: 'UNVERIFIED_UPSTREAM_LIMIT',
};

export function resolveImportLimits(overrides?: Partial<ImportLimits>): ImportLimits {
  if (!overrides) {
    return DEFAULT_IMPORT_LIMITS;
  }
  return {
    maxFileSizeBytes: overrides.maxFileSizeBytes ?? DEFAULT_IMPORT_LIMITS.maxFileSizeBytes,
    allowedMimeTypes: overrides.allowedMimeTypes ?? DEFAULT_IMPORT_LIMITS.allowedMimeTypes,
    maxPromptLength: overrides.maxPromptLength ?? DEFAULT_IMPORT_LIMITS.maxPromptLength,
    maxBatchCount: overrides.maxBatchCount ?? DEFAULT_IMPORT_LIMITS.maxBatchCount,
    isVerifiedUpstream: overrides.isVerifiedUpstream ?? DEFAULT_IMPORT_LIMITS.isVerifiedUpstream,
    uiUnsupportedFlag: overrides.uiUnsupportedFlag ?? DEFAULT_IMPORT_LIMITS.uiUnsupportedFlag,
  };
}
