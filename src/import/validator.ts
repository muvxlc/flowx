import type {
  ImportInput,
  ImportLimits,
  ImportError
} from './types.ts';
import { parsePromptText } from './parser.ts';

export interface ValidationOutput {
  isValid: boolean;
  errors: ImportError[];
  prompts: string[];
}

export function validateImportInput(
  input: ImportInput,
  limits: ImportLimits
): ValidationOutput {
  const errors: ImportError[] = [];
  const prompts = parsePromptText(input.promptSource.rawText);

  // 1. Prompt list emptiness check
  if (prompts.length === 0) {
    errors.push({
      code: 'EMPTY_PROMPTS',
      message: 'No valid prompt lines found in input.',
      details: { rawLength: input.promptSource.rawText.length },
    });
  }

  // 2. Batch count ceiling check
  if (prompts.length > limits.maxBatchCount) {
    errors.push({
      code: 'BATCH_SIZE_EXCEEDED',
      message: `Prompt count (${prompts.length}) exceeds maximum batch limit of ${limits.maxBatchCount}.`,
      details: { count: prompts.length, max: limits.maxBatchCount },
    });
  }

  // 3. Individual prompt length check
  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    if (prompt && prompt.length > limits.maxPromptLength) {
      errors.push({
        code: 'PROMPT_TOO_LONG',
        message: `Prompt at line ${i + 1} exceeds maximum length (${prompt.length} > ${limits.maxPromptLength}).`,
        details: { index: i, length: prompt.length, max: limits.maxPromptLength },
      });
    }
  }

  // 4. Reference assets MIME and size checks
  for (let i = 0; i < input.references.length; i++) {
    const ref = input.references[i];
    if (!ref) continue;

    if (!limits.allowedMimeTypes.includes(ref.mimeType)) {
      errors.push({
        code: 'UNSUPPORTED_MIME_TYPE',
        message: `Reference "${ref.name}" has unsupported MIME type "${ref.mimeType}". Allowed: ${limits.allowedMimeTypes.join(', ')}.`,
        details: { assetId: ref.id, name: ref.name, mimeType: ref.mimeType },
      });
    }

    if (ref.sizeBytes > limits.maxFileSizeBytes) {
      errors.push({
        code: 'FILE_SIZE_EXCEEDED',
        message: `Reference "${ref.name}" size (${ref.sizeBytes} bytes) exceeds limit of ${limits.maxFileSizeBytes} bytes.`,
        details: { assetId: ref.id, name: ref.name, sizeBytes: ref.sizeBytes, max: limits.maxFileSizeBytes },
      });
    }
  }

  // 5. Mode-specific pairing and reference cardinality checks
  switch (input.mode) {
    case 'text-only':
      if (input.references.length > 0) {
        errors.push({
          code: 'REFERENCES_NOT_ALLOWED_IN_TEXT_MODE',
          message: `Text-only mode does not accept reference assets (received ${input.references.length}).`,
          details: { referenceCount: input.references.length },
        });
      }
      break;

    case 'single-ref':
      if (input.references.length === 0 || !input.references[0]) {
        errors.push({
          code: 'MISSING_SINGLE_REFERENCE',
          message: 'Single reference mode requires exactly 1 reference asset (received 0).',
          details: { referenceCount: input.references.length },
        });
      } else if (input.references.length > 1) {
        errors.push({
          code: 'MULTIPLE_REFERENCES_IN_SINGLE_MODE',
          message: `Single reference mode requires exactly 1 reference asset (received ${input.references.length}).`,
          details: { referenceCount: input.references.length },
        });
      }
      break;

    case 'paired-ref':
      if (prompts.length !== input.references.length) {
        errors.push({
          code: 'PAIRED_COUNT_MISMATCH',
          message: `Paired mode requires equal prompt and reference counts: found ${prompts.length} prompts and ${input.references.length} references.`,
          details: { promptCount: prompts.length, referenceCount: input.references.length },
        });
      }
      for (let i = 0; i < input.references.length; i++) {
        const ref = input.references[i];
        if (!ref || typeof ref !== 'object' || !ref.id) {
          errors.push({
            code: 'INVALID_PAIRED_REFERENCE',
            message: `Paired mode reference at index ${i} is missing, null, or undefined.`,
            details: { index: i },
          });
        }
      }
      break;
  }

  return {
    isValid: errors.length === 0,
    errors,
    prompts,
  };
}
