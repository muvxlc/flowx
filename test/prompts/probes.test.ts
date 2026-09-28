import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePrompt,
  generateVariations,
  editPrompt,
  appendClause,
  toPromptTextList,
  PromptError,
  type PromptTemplateInput
} from '../../src/prompts/index.ts';
import { parsePromptText } from '../../src/import/parser.ts';

test('Unicode probe: handles Thai, Japanese, CJK, and accented characters verbatim', () => {
  // Given: complex multi-script theme
  const thaiTheme = 'ป่าสนเมืองหนาวหมอกยามเช้า ภูเขาไฟฟูจิยามพระอาทิตย์ตก 8k ✨';
  const input: PromptTemplateInput = {
    mediaTarget: 'image',
    theme: thaiTheme,
    styleId: 'thai_contemporary',
    sceneId: 'wide_landscape',
    lightingId: 'golden_hour',
    seed: 42
  };

  // When: generating prompt
  const draft = generatePrompt(input);

  // Then: unicode text is preserved exactly without corruption
  assert.ok(draft.formattedPrompt.includes(thaiTheme));
  assert.equal(draft.components.theme, thaiTheme);
});

test('Adversarial probe: HTML, script tags, and SQL injections are treated strictly as inert literals', () => {
  // Given: adversarial prompt input with script tags and SQL
  const payload = "<script>alert('xss')</script> SELECT * FROM users; DROP TABLE prompt;";
  const input: PromptTemplateInput = {
    mediaTarget: 'video',
    theme: payload,
    styleId: 'cyberpunk',
    sceneId: 'close_up_portrait',
    lightingId: 'neon_cyber',
    motionId: 'slow_pan',
    seed: 777
  };

  // When: generating prompt
  const draft = generatePrompt(input);

  // Then: string payload is preserved inertly without execution or dropping
  assert.ok(draft.formattedPrompt.includes(payload));
  assert.equal(draft.components.theme, payload);
});

test('Boundary probe: handles negative, zero, and floating-point seeds deterministically', () => {
  // Given: unusual numeric seeds
  const seedZero = generatePrompt({ mediaTarget: 'image', theme: 'Test', seed: 0 });
  const seedNegative = generatePrompt({ mediaTarget: 'image', theme: 'Test', seed: -42 });
  const seedFloat = generatePrompt({ mediaTarget: 'image', theme: 'Test', seed: 42.87 });

  // Then: all produce valid seeds and reproducible drafts
  assert.ok(Number.isInteger(seedZero.seed));
  assert.ok(Number.isInteger(seedNegative.seed));
  assert.ok(Number.isInteger(seedFloat.seed));
  assert.ok(seedZero.formattedPrompt.length > 0);
  assert.ok(seedNegative.formattedPrompt.length > 0);
  assert.ok(seedFloat.formattedPrompt.length > 0);
});

test('appendClause attaches custom modifiers and updates prompt text', () => {
  // Given: an initial draft
  const draft = generatePrompt({
    mediaTarget: 'image',
    theme: 'Minimalist ceramic vase',
    styleId: 'minimalist',
    sceneId: 'macro_detail',
    lightingId: 'studio_soft'
  });

  // When: appending custom artistic clause
  const appended = appendClause(draft, 'subtle white porcelain glaze texture');

  // Then: clause is attached to formattedPrompt and customSuffix
  assert.ok(appended.formattedPrompt.includes('subtle white porcelain glaze texture'));
  assert.ok(appended.customSuffix?.includes('subtle white porcelain glaze texture'));
});

test('toPromptTextList formats batch drafts into import-compatible multiline prompt text', () => {
  // Given: 3 generated variations
  const drafts = generateVariations(
    {
      mediaTarget: 'video',
      theme: 'Ancient brass astrolabe turning slowly',
      styleId: 'cinematic',
      sceneId: 'macro_detail',
      lightingId: 'dramatic',
      motionId: 'smooth_orbit'
    },
    3,
    100
  );

  // When: converting to text list and passing to import parser
  const rawTextList = toPromptTextList(drafts);
  const parsedLines = parsePromptText(rawTextList);

  // Then: produces exactly 3 non-empty prompt lines matching drafts
  assert.equal(parsedLines.length, 3);
  for (let i = 0; i < 3; i += 1) {
    assert.equal(parsedLines[i], drafts[i]?.formattedPrompt);
  }
});

test('Unknown style or lighting gracefully falls back to default without throwing', () => {
  // Given: input with unrecognized style and lighting IDs
  const input: PromptTemplateInput = {
    mediaTarget: 'image',
    theme: 'Glass conservatory',
    styleId: 'non_existent_style_xyz',
    lightingId: 'unknown_lighting_123',
    sceneId: 'invalid_scene_456'
  };

  // When: generating prompt
  const draft = generatePrompt(input);

  // Then: falls back to default catalog options
  assert.ok(draft.components.style);
  assert.ok(draft.components.lighting);
  assert.ok(draft.components.scene);
  assert.ok(draft.formattedPrompt.includes('Glass conservatory'));
});
