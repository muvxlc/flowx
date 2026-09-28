import type {
  ImportInput,
  ImportConfig,
  ImportPreview,
  ImportResult,
  ImportedJobDraft
} from './types.ts';
import { resolveImportLimits } from './limits.ts';
import { validateImportInput } from './validator.ts';

export * from './types.ts';
export * from './limits.ts';
export * from './parser.ts';
export * from './validator.ts';

/**
 * Generate a lightweight non-destructive preview of the import batch.
 * Does not mutate any store or upload any file.
 */
export function previewImport(
  input: ImportInput,
  config?: ImportConfig
): ImportPreview {
  const limits = resolveImportLimits(config?.limits);
  const validation = validateImportInput(input, limits);

  return {
    promptCount: validation.prompts.length,
    referenceCount: input.references.length,
    estimatedJobs: validation.isValid ? validation.prompts.length : 0,
    mode: input.mode,
    media: input.media,
    isValid: validation.isValid,
    errors: validation.errors,
    isVerifiedUpstream: limits.isVerifiedUpstream,
    uiUnsupportedFlag: limits.uiUnsupportedFlag,
  };
}

/**
 * Validate and construct job draft items from raw prompts and reference assets.
 * Performs zero network uploads and inserts no partial jobs on failure.
 */
export function importJobBatch(
  input: ImportInput,
  config?: ImportConfig
): ImportResult {
  const limits = resolveImportLimits(config?.limits);
  const validation = validateImportInput(input, limits);

  const preview = previewImport(input, config);

  if (!validation.isValid) {
    return {
      success: false,
      jobs: [],
      errors: validation.errors,
      preview,
    };
  }

  const now = Date.now();
  const provider = input.provider ?? 'meta';
  const settings = input.settings ?? {};

  const jobs: ImportedJobDraft[] = validation.prompts.map((promptText, idx) => {
    let referenceId: string | null = null;
    if (input.mode === 'single-ref') {
      const ref = input.references[0];
      referenceId = ref ? ref.id : null;
    } else if (input.mode === 'paired-ref') {
      const ref = input.references[idx];
      referenceId = ref ? ref.id : null;
    }

    const uniqueSuffix = Math.random().toString(36).slice(2, 8);
    const id = `job_${now.toString(36)}_${idx}_${uniqueSuffix}`;

    return {
      id,
      media: input.media,
      mode: input.mode,
      prompt: promptText,
      referenceId,
      provider,
      settings,
      state: 'draft',
      createdAt: now,
    };
  });

  return {
    success: true,
    jobs,
    errors: [],
    preview,
  };
}
