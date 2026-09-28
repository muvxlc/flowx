import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  importJobBatch,
  previewImport,
  parsePromptText,
  DEFAULT_IMPORT_LIMITS,
  type ImportInput,
  type ImportResult,
  type ImportPreview
} from '../../src/import/index.ts';
import {
  fixtureM1_ImageTextOnly,
  fixtureM2_ImageSingleRef,
  fixtureM3_ImagePairedRef,
  fixtureM4_VideoTextOnly,
  fixtureM5_VideoSingleRef,
  fixtureM6_VideoPairedRef,
  thaiEnglishPromptText,
  sampleRefA,
  sampleRefB,
  sampleRefC,
  oversizedRef,
  unsupportedMimeRef
} from './fixtures.ts';

test('UTF-8 prompt parser handles mixed Thai and English with CRLF/LF normalization', () => {
  // Given: prompt text with mixed Thai, English, accented chars, and mixed CRLF/LF
  const mixedRaw = [
    '  ป่าสนเมืองหนาวหมอกยามเช้า แสงแดดสีทอง  ',
    'Nordic pine forest, crème brûlée café vibe',
    '',
    '   ',
    'วัดอรุณราชวรารามยามพระอาทิตย์ตก'
  ].join('\r\n');

  // When: parsed
  const lines = parsePromptText(mixedRaw);

  // Then: empty/whitespace lines stripped, non-empty trimmed, UTF-8 intact
  assert.equal(lines.length, 3);
  assert.equal(lines[0], 'ป่าสนเมืองหนาวหมอกยามเช้า แสงแดดสีทอง');
  assert.equal(lines[1], 'Nordic pine forest, crème brûlée café vibe');
  assert.equal(lines[2], 'วัดอรุณราชวรารามยามพระอาทิตย์ตก');
});

test('Rejects completely empty or whitespace-only prompt input', () => {
  // Given: empty string or whitespace-only string
  const emptyInput: ImportInput = {
    media: 'image',
    mode: 'text-only',
    promptSource: { type: 'paste', rawText: '   \n\r\n   \t  ' },
    references: []
  };

  // When: imported
  const result = importJobBatch(emptyInput);

  // Then: validation failure with precise error code
  assert.equal(result.success, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]?.code, 'EMPTY_PROMPTS');
});

test('M1: Image Text-Only mode imports prompts with null reference', () => {
  // Given: fixture M1
  // When: imported
  const result = importJobBatch(fixtureM1_ImageTextOnly);

  // Then: 4 jobs created, media=image, mode=text-only, referenceId is null
  assert.equal(result.success, true);
  assert.equal(result.jobs.length, 4);
  for (const job of result.jobs) {
    assert.equal(job.media, 'image');
    assert.equal(job.mode, 'text-only');
    assert.equal(job.referenceId, null);
    assert.ok(job.prompt.length > 0);
  }
});

test('M2: Image Single-Ref mode reuses single reference across all prompts', () => {
  // Given: fixture M2 (4 prompts, 1 reference image)
  // When: imported
  const result = importJobBatch(fixtureM2_ImageSingleRef);

  // Then: 4 jobs created, each referencing sampleRefA.id
  assert.equal(result.success, true);
  assert.equal(result.jobs.length, 4);
  for (const job of result.jobs) {
    assert.equal(job.media, 'image');
    assert.equal(job.mode, 'single-ref');
    assert.equal(job.referenceId, sampleRefA.id);
  }
});

test('M3: Image Paired-Ref mode pairs N prompts to N references 1:1', () => {
  // Given: fixture M3 (3 prompts, 3 references)
  // When: imported
  const result = importJobBatch(fixtureM3_ImagePairedRef);

  // Then: 3 jobs created, strict 1:1 mapping
  assert.equal(result.success, true);
  assert.equal(result.jobs.length, 3);
  assert.equal(result.jobs[0]?.referenceId, sampleRefA.id);
  assert.equal(result.jobs[1]?.referenceId, sampleRefB.id);
  assert.equal(result.jobs[2]?.referenceId, sampleRefC.id);
});

test('M4: Video Text-Only mode imports video motion prompts with null reference', () => {
  // Given: fixture M4 (2 video prompts, 0 references)
  // When: imported
  const result = importJobBatch(fixtureM4_VideoTextOnly);

  // Then: 2 video jobs created
  assert.equal(result.success, true);
  assert.equal(result.jobs.length, 2);
  for (const job of result.jobs) {
    assert.equal(job.media, 'video');
    assert.equal(job.mode, 'text-only');
    assert.equal(job.referenceId, null);
  }
});

test('M5: Video Single-Ref mode reuses starting reference across motion prompts', () => {
  // Given: fixture M5 (2 video prompts, 1 reference image)
  // When: imported
  const result = importJobBatch(fixtureM5_VideoSingleRef);

  // Then: 2 video jobs created with same referenceId
  assert.equal(result.success, true);
  assert.equal(result.jobs.length, 2);
  for (const job of result.jobs) {
    assert.equal(job.media, 'video');
    assert.equal(job.mode, 'single-ref');
    assert.equal(job.referenceId, sampleRefA.id);
  }
});

test('M6: Video Paired-Ref mode pairs N video prompts to N starting frames 1:1', () => {
  // Given: fixture M6 (3 video prompts, 3 references)
  // When: imported
  const result = importJobBatch(fixtureM6_VideoPairedRef);

  // Then: 3 video jobs created with 1:1 reference pairs
  assert.equal(result.success, true);
  assert.equal(result.jobs.length, 3);
  assert.equal(result.jobs[0]?.referenceId, sampleRefA.id);
  assert.equal(result.jobs[1]?.referenceId, sampleRefB.id);
  assert.equal(result.jobs[2]?.referenceId, sampleRefC.id);
});

test('Single-ref mode rejects if reference is missing or more than one provided', () => {
  const resMissing = importJobBatch({
    media: 'image',
    mode: 'single-ref',
    promptSource: { type: 'paste', rawText: 'Prompt 1\nPrompt 2' },
    references: []
  });
  assert.equal(resMissing.success, false);
  assert.equal(resMissing.errors[0]?.code, 'MISSING_SINGLE_REFERENCE');

  const resMultiple = importJobBatch({
    media: 'image',
    mode: 'single-ref',
    promptSource: { type: 'paste', rawText: 'Prompt 1\nPrompt 2' },
    references: [sampleRefA, sampleRefB]
  });
  assert.equal(resMultiple.success, false);
  assert.equal(resMultiple.errors[0]?.code, 'MULTIPLE_REFERENCES_IN_SINGLE_MODE');
});

test('Paired-ref mode rejects count mismatch with precise counts and zero partial jobs', () => {
  const resA = importJobBatch({
    media: 'image',
    mode: 'paired-ref',
    promptSource: { type: 'paste', rawText: 'Prompt 1\nPrompt 2\nPrompt 3' },
    references: [sampleRefA, sampleRefB]
  });
  assert.equal(resA.success, false);
  assert.equal(resA.jobs.length, 0);
  assert.equal(resA.errors[0]?.code, 'PAIRED_COUNT_MISMATCH');
  assert.match(resA.errors[0]?.message ?? '', /3 prompts.*2 references/);

  const resB = importJobBatch({
    media: 'image',
    mode: 'paired-ref',
    promptSource: { type: 'paste', rawText: 'Prompt 1\nPrompt 2' },
    references: [sampleRefA, sampleRefB, sampleRefC]
  });
  assert.equal(resB.success, false);
  assert.equal(resB.jobs.length, 0);
  assert.equal(resB.errors[0]?.code, 'PAIRED_COUNT_MISMATCH');
  assert.match(resB.errors[0]?.message ?? '', /2 prompts.*3 references/);
});

test('Rejects unsupported MIME type with clear error', () => {
  const result = importJobBatch({
    media: 'image',
    mode: 'single-ref',
    promptSource: { type: 'paste', rawText: 'Vector illustration of robot' },
    references: [unsupportedMimeRef]
  });
  assert.equal(result.success, false);
  assert.equal(result.errors[0]?.code, 'UNSUPPORTED_MIME_TYPE');
  assert.match(result.errors[0]?.message ?? '', /image\/svg\+xml/);
});

test('Rejects oversized file with conservative limit and supports custom config', () => {
  const oversizedInput: ImportInput = {
    media: 'image',
    mode: 'single-ref',
    promptSource: { type: 'paste', rawText: 'Ultra detailed texture map' },
    references: [oversizedRef]
  };
  const defaultRes = importJobBatch(oversizedInput);
  assert.equal(defaultRes.success, false);
  assert.equal(defaultRes.errors[0]?.code, 'FILE_SIZE_EXCEEDED');

  // When: imported with relaxed configurable limits (20 MB max)
  const customRes = importJobBatch(oversizedInput, {
    limits: {
      ...DEFAULT_IMPORT_LIMITS,
      maxFileSizeBytes: 20 * 1024 * 1024
    }
  });
  assert.equal(customRes.success, true);
  assert.equal(customRes.jobs.length, 1);
});

test('Limits explicitly declare unverified upstream status and UI unsupported flag', () => {
  // Then: Default import limits must be marked unverified
  assert.equal(DEFAULT_IMPORT_LIMITS.isVerifiedUpstream, false);
  assert.equal(DEFAULT_IMPORT_LIMITS.uiUnsupportedFlag, 'UNVERIFIED_UPSTREAM_LIMIT');
  assert.ok(DEFAULT_IMPORT_LIMITS.maxFileSizeBytes > 0);
  assert.ok(DEFAULT_IMPORT_LIMITS.allowedMimeTypes.includes('image/png'));
  assert.ok(DEFAULT_IMPORT_LIMITS.allowedMimeTypes.includes('image/jpeg'));
  assert.ok(DEFAULT_IMPORT_LIMITS.allowedMimeTypes.includes('image/webp'));
});

test('previewImport provides non-destructive summary and validation status', () => {
  // Case A: Valid single-ref preview
  const previewValid = previewImport(fixtureM2_ImageSingleRef);
  assert.equal(previewValid.promptCount, 4);
  assert.equal(previewValid.referenceCount, 1);
  assert.equal(previewValid.estimatedJobs, 4);
  assert.equal(previewValid.isValid, true);
  assert.equal(previewValid.errors.length, 0);

  // Case B: Invalid paired preview (mismatch)
  const previewMismatch = previewImport({
    media: 'image',
    mode: 'paired-ref',
    promptSource: { type: 'paste', rawText: 'Prompt 1\nPrompt 2\nPrompt 3' },
    references: [sampleRefA]
  });
  assert.equal(previewMismatch.promptCount, 3);
  assert.equal(previewMismatch.referenceCount, 1);
  assert.equal(previewMismatch.estimatedJobs, 0);
  assert.equal(previewMismatch.isValid, false);
  assert.equal(previewMismatch.errors[0]?.code, 'PAIRED_COUNT_MISMATCH');
});

test('Import does NOT perform upload or external side-effects', () => {
  // Given: input with reference assets
  const input = fixtureM3_ImagePairedRef;

  // When: imported
  const result = importJobBatch(input);

  // Then: output contains local job records, references remain in-memory metadata
  assert.equal(result.success, true);
  assert.equal(result.jobs.length, 3);
  for (const job of result.jobs) {
    // Assert no remote URLs or upload status present
    assert.ok(job.id.startsWith('job_'));
    assert.equal(job.state, 'draft');
  }
});

test('Paired-ref mode rejects null, undefined, or sparse reference entries without creating partial or null-ref jobs', () => {
  const sparseRefs = new Array(2);
  sparseRefs[1] = sampleRefB;
  const badCases = [
    [null as any, sampleRefB],
    [sampleRefA, undefined as any],
    sparseRefs
  ];
  for (const references of badCases) {
    const res = importJobBatch({
      media: 'image',
      mode: 'paired-ref',
      promptSource: { type: 'paste', rawText: 'Prompt 1\nPrompt 2' },
      references
    });
    assert.equal(res.success, false);
    assert.equal(res.jobs.length, 0);
    assert.ok(res.errors.some(e => e.code === 'INVALID_PAIRED_REFERENCE'));
  }
});
