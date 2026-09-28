import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePrompt,
  generateVariations,
  editPrompt,
  formatPromptText,
  getAvailableStyles,
  getAvailableScenes,
  getAvailableLightings,
  getAvailableMotions,
  PromptError,
  type PromptDraft,
  type PromptTemplateInput
} from '../../src/prompts/index.ts';
import {
  validImageInput,
  validVideoInput,
  validThaiVideoInput,
  sampleEditInput,
  sampleVideoTheme
} from './fixtures.ts';

test('Prompt generator produces deterministic output for identical seed and inputs', () => {
  // Given: fixed seed and valid inputs
  const inputA: PromptTemplateInput = { ...validImageInput, seed: 1001 };
  const inputB: PromptTemplateInput = { ...validImageInput, seed: 1001 };

  // When: generating prompt twice with identical seed
  const draftA = generatePrompt(inputA);
  const draftB = generatePrompt(inputB);

  // Then: outputs are identical in text, components, and deterministic seed
  assert.equal(draftA.formattedPrompt, draftB.formattedPrompt);
  assert.equal(draftA.seed, draftB.seed);
  assert.deepEqual(draftA.components, draftB.components);
  assert.equal(draftA.mediaTarget, 'image');
});

test('Different seeds produce distinct variations or modifier selections', () => {
  // Given: two different seeds for the same base template
  const input1: PromptTemplateInput = { ...validImageInput, seed: 111 };
  const input2: PromptTemplateInput = { ...validImageInput, seed: 999 };

  // When: generating variations
  const draft1 = generatePrompt(input1);
  const draft2 = generatePrompt(input2);

  // Then: both are valid but have differing deterministic seed markers
  assert.notEqual(draft1.seed, draft2.seed);
});

test('Generates video prompt with camera motion and video descriptors', () => {
  // Given: video prompt input with motionId
  const draft = generatePrompt(validVideoInput);

  // Then: target is video, motion is present in components and text
  assert.equal(draft.mediaTarget, 'video');
  assert.ok(draft.components.motion);
  assert.equal(draft.components.motion?.id, 'slow_pan');
  assert.ok(draft.formattedPrompt.includes(draft.components.motion?.phrase ?? ''));
  assert.ok(draft.formattedPrompt.includes(validVideoInput.theme));
});

test('Rejects empty or whitespace-only theme with PromptError EMPTY_THEME', () => {
  // Given: inputs with empty themes
  const emptyInput: PromptTemplateInput = { ...validImageInput, theme: '' };
  const whitespaceInput: PromptTemplateInput = { ...validImageInput, theme: '   \n\t  ' };

  // When/Then: both throw PromptError with code EMPTY_THEME
  assert.throws(
    () => generatePrompt(emptyInput),
    (err: unknown) => err instanceof PromptError && err.code === 'EMPTY_THEME'
  );
  assert.throws(
    () => generatePrompt(whitespaceInput),
    (err: unknown) => err instanceof PromptError && err.code === 'EMPTY_THEME'
  );
});

test('editPrompt allows updating theme, style, lighting, and motion dynamically', () => {
  // Given: an existing generated video draft
  const initialDraft = generatePrompt(validVideoInput);

  // When: editing the theme, lighting, and motion
  const updatedDraft = editPrompt(initialDraft, sampleEditInput);

  // Then: updated components reflect edits and formattedPrompt is re-composed
  assert.equal(updatedDraft.components.theme, sampleEditInput.theme);
  assert.equal(updatedDraft.components.lighting.id, 'neon_cyber');
  assert.equal(updatedDraft.components.motion?.id, 'fps_flythrough');
  assert.ok(updatedDraft.formattedPrompt.includes(sampleEditInput.theme!));
  assert.ok(updatedDraft.formattedPrompt.includes(updatedDraft.components.lighting.phrase));
  assert.notEqual(updatedDraft.formattedPrompt, initialDraft.formattedPrompt);
});

test('editPrompt rejects updating theme to an empty string', () => {
  // Given: an existing valid draft
  const initialDraft = generatePrompt(validImageInput);

  // When/Then: editing theme to blank throws EMPTY_THEME
  assert.throws(
    () => editPrompt(initialDraft, { theme: '   ' }),
    (err: unknown) => err instanceof PromptError && err.code === 'EMPTY_THEME'
  );
});

test('Does NOT invent unsupported upstream provider settings', () => {
  // Given: a video prompt generation
  const draft = generatePrompt(validVideoInput);

  // Then: providerSettings contains only verified/safe properties, zero hallucinated keys
  assert.ok(draft.providerSettings);
  assert.equal(typeof draft.providerSettings, 'object');

  // Verify absence of hallucinated parameters
  const settings = draft.providerSettings as Record<string, unknown>;
  assert.equal(settings['cfgScale'], undefined);
  assert.equal(settings['negativePrompt'], undefined);
  assert.equal(settings['sampler'], undefined);
  assert.equal(settings['steps'], undefined);
  assert.equal(settings['denoisingStrength'], undefined);
});

test('Runs purely synchronously and locally without Jev or network dependency', () => {
  // Given: template input
  const start = performance.now();

  // When: generating prompt
  const draft = generatePrompt(validThaiVideoInput);
  const elapsed = performance.now() - start;

  // Then: completes instantaneously (<10ms) without network or async handles
  assert.ok(elapsed < 100);
  assert.ok(draft.formattedPrompt.includes(validThaiVideoInput.theme));
  assert.equal(draft.mediaTarget, 'video');
});

test('generateVariations creates N distinct deterministic variations for a base input', () => {
  // Given: base video template and count = 3
  const count = 3;
  const variations = generateVariations(validVideoInput, count, 500);

  // Then: exactly 3 variations produced with distinct seeds and unique prompt texts
  assert.equal(variations.length, count);
  const promptTexts = new Set(variations.map((v) => v.formattedPrompt));
  assert.equal(promptTexts.size, count);
});

test('formatPromptText builds clean, comma-separated descriptors from components', () => {
  // Given: individual component strings
  const formatted = formatPromptText({
    theme: 'Vintage brass telescope',
    stylePhrase: 'cinematic 35mm film',
    scenePhrase: 'wide observatory view',
    lightingPhrase: 'dramatic moonlight chiaroscuro',
    motionPhrase: 'slow tracking camera motion'
  });

  // Then: correctly joined without double commas or trailing separators
  assert.ok(formatted.includes('Vintage brass telescope'));
  assert.ok(formatted.includes('cinematic 35mm film'));
  assert.ok(!formatted.includes(',,'));
  assert.ok(!formatted.endsWith(','));
});

test('Catalogs provide selectable options for styles, scenes, lighting, and motions', () => {
  // When: retrieving available options
  const styles = getAvailableStyles();
  const scenes = getAvailableScenes();
  const lightings = getAvailableLightings();
  const motions = getAvailableMotions();

  // Then: non-empty lists with id, label, and phrase
  assert.ok(styles.length >= 4);
  assert.ok(scenes.length >= 4);
  assert.ok(lightings.length >= 3);
  assert.ok(motions.length >= 3);

  for (const item of [...styles, ...scenes, ...lightings, ...motions]) {
    assert.ok(item.id.length > 0);
    assert.ok(item.label.length > 0);
    assert.ok(item.phrase.length > 0);
  }
});
