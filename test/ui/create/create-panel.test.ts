import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CreateController,
  renderCreateView,
  getCreateViewStyles,
  type CreatePanelState,
  type EnqueueCommand,
} from '../../../src/ui/create/index.ts';

test('CreateController - initializes with Image Text-Only mode and Prototype A defaults', () => {
  const controller = new CreateController();
  const state = controller.getState();

  assert.equal(state.media, 'image');
  assert.equal(state.mode, 'text-only');
  assert.equal(state.unsupportedSettings.customNegativePrompt.disabled, true);
  assert.equal(state.unsupportedSettings.videoAspectRatioOverride.disabled, true);
  assert.match(state.unsupportedSettings.customNegativePrompt.reason, /unsupported upstream/i);
});

test('CreateController - handles all six generation modes', () => {
  const controller = new CreateController();

  // Mode 1: Image Text-Only
  controller.setMedia('image');
  controller.setMode('text-only');
  assert.equal(controller.getState().media, 'image');
  assert.equal(controller.getState().mode, 'text-only');
  assert.equal(controller.getSummaryLabel(), 'Image • Text-Only (1:0)');

  // Mode 2: Image Single-Ref
  controller.setMode('single-ref');
  assert.equal(controller.getState().mode, 'single-ref');
  assert.equal(controller.getSummaryLabel(), 'Image • Single Ref (1:N)');

  // Mode 3: Image Paired-Ref
  controller.setMode('paired-ref');
  assert.equal(controller.getState().mode, 'paired-ref');
  assert.equal(controller.getSummaryLabel(), 'Image • Paired 1:1 (N:N)');

  // Mode 4: Video Text-Only
  controller.setMedia('video');
  controller.setMode('text-only');
  assert.equal(controller.getState().media, 'video');
  assert.equal(controller.getState().mode, 'text-only');
  assert.equal(controller.getSummaryLabel(), 'Video • Text-Only (1:0)');

  // Mode 5: Video Single-Ref
  controller.setMode('single-ref');
  assert.equal(controller.getState().mode, 'single-ref');
  assert.equal(controller.getSummaryLabel(), 'Video • Single Ref (1:N)');

  // Mode 6: Video Paired-Ref
  controller.setMode('paired-ref');
  assert.equal(controller.getState().mode, 'paired-ref');
  assert.equal(controller.getSummaryLabel(), 'Video • Paired 1:1 (N:N)');
});

test('CreateController - paired mismatch is strictly blocked with error', async () => {
  const controller = new CreateController();
  controller.setMedia('image');
  controller.setMode('paired-ref');

  // 3 prompts, but only 2 references
  controller.setPromptsText('Prompt line 1\nPrompt line 2\nPrompt line 3');
  controller.setReferences([
    { id: 'ref_1', name: 'image1.png', mimeType: 'image/png', sizeBytes: 1024 },
    { id: 'ref_2', name: 'image2.png', mimeType: 'image/png', sizeBytes: 2048 },
  ]);

  const preview = controller.getPreview();
  assert.equal(preview.isValid, false);
  assert.ok(preview.errors.some((e) => e.code === 'PAIRED_COUNT_MISMATCH' || /mismatch|equal/i.test(e.message)));

  // Enqueue attempt must fail
  let enqueued = false;
  controller.onEnqueue(async () => {
    enqueued = true;
  });

  const result = await controller.submitEnqueue();
  assert.equal(result.success, false);
  assert.equal(enqueued, false);
  const firstErr = controller.getState().validationErrors[0];
  assert.ok(firstErr !== undefined);
  assert.match(firstErr, /count mismatch|paired|equal/i);
});

test('CreateController - single-ref with missing reference is blocked', async () => {
  const controller = new CreateController();
  controller.setMedia('image');
  controller.setMode('single-ref');
  controller.setPromptsText('Single ref prompt line');
  controller.setReferences([]); // No reference

  const preview = controller.getPreview();
  assert.equal(preview.isValid, false);

  const result = await controller.submitEnqueue();
  assert.equal(result.success, false);
});

test('CreateController - empty prompt input is blocked', async () => {
  const controller = new CreateController();
  controller.setPromptsText('   \n\n  ');

  const preview = controller.getPreview();
  assert.equal(preview.isValid, false);

  const result = await controller.submitEnqueue();
  assert.equal(result.success, false);
});

test('CreateController - valid enqueue dispatches typed EnqueueCommand for six modes', async () => {
  const controller = new CreateController();

  let lastCommand: EnqueueCommand | null = null;
  controller.onEnqueue(async (cmd) => {
    lastCommand = cmd;
  });

  const getCmd = (): EnqueueCommand => {
    assert.ok(lastCommand !== null);
    return lastCommand;
  };

  // Test Mode 1: Image Text-Only
  controller.setMedia('image');
  controller.setMode('text-only');
  controller.setPromptsText('A futuristic cityscape in Bangkok\nTraditional Thai dancer');
  controller.setReferences([]);

  const res1 = await controller.submitEnqueue();
  assert.equal(res1.success, true);
  assert.equal(getCmd().media, 'image');
  assert.equal(getCmd().mode, 'text-only');
  assert.equal(getCmd().jobs.length, 2);
  assert.equal(getCmd().jobs[0]?.referenceId, null);
  assert.equal(getCmd().jobs[1]?.referenceId, null);

  // Test Mode 2: Image Single-Ref
  controller.setMode('single-ref');
  controller.setReferences([
    { id: 'ref_shared', name: 'base.png', mimeType: 'image/png', sizeBytes: 5000 },
  ]);
  const res2 = await controller.submitEnqueue();
  assert.equal(res2.success, true);
  assert.equal(getCmd().jobs[0]?.referenceId, 'ref_shared');
  assert.equal(getCmd().jobs[1]?.referenceId, 'ref_shared');

  // Test Mode 3: Image Paired-Ref
  controller.setMode('paired-ref');
  controller.setReferences([
    { id: 'ref_p1', name: 'p1.png', mimeType: 'image/png', sizeBytes: 1000 },
    { id: 'ref_p2', name: 'p2.png', mimeType: 'image/png', sizeBytes: 2000 },
  ]);
  const res3 = await controller.submitEnqueue();
  assert.equal(res3.success, true);
  assert.equal(getCmd().jobs[0]?.referenceId, 'ref_p1');
  assert.equal(getCmd().jobs[1]?.referenceId, 'ref_p2');

  // Test Mode 4: Video Text-Only
  controller.setMedia('video');
  controller.setMode('text-only');
  const res4 = await controller.submitEnqueue();
  assert.equal(res4.success, true);
  assert.equal(getCmd().media, 'video');
  assert.equal(getCmd().mode, 'text-only');

  // Test Mode 5: Video Single-Ref
  controller.setMode('single-ref');
  controller.setReferences([
    { id: 'ref_video_start', name: 'start.png', mimeType: 'image/png', sizeBytes: 5000 },
  ]);
  const res5 = await controller.submitEnqueue();
  assert.equal(res5.success, true);
  assert.equal(getCmd().media, 'video');
  assert.equal(getCmd().mode, 'single-ref');

  // Test Mode 6: Video Paired-Ref
  controller.setMode('paired-ref');
  controller.setReferences([
    { id: 'ref_v1', name: 'v1.png', mimeType: 'image/png', sizeBytes: 1000 },
    { id: 'ref_v2', name: 'v2.png', mimeType: 'image/png', sizeBytes: 2000 },
  ]);
  const res6 = await controller.submitEnqueue();
  assert.equal(res6.success, true);
  assert.equal(getCmd().media, 'video');
  assert.equal(getCmd().mode, 'paired-ref');
});

test('CreateController - deterministic local prompt template generation', () => {
  const controller = new CreateController();
  controller.setPromptsText('Base prompt');

  const appended = controller.appendTemplatePrompt({
    styleTheme: 'cinematic',
    lighting: 'golden_hour',
  });

  assert.ok(appended.includes('cinematic'));
  assert.ok(appended.includes('golden_hour') || appended.includes('golden') || appended.includes('Golden'));
  assert.ok(controller.getState().promptsText.includes('Base prompt'));
  assert.ok(controller.getState().promptsText.includes(appended));
});

test('CreateController - simulated Jev quality pre-check runs local rubric only', async () => {
  const controller = new CreateController();
  controller.setPromptsText('Cyberpunk street scene with vibrant neon lighting');

  const result = await controller.runSimulatedJevCheck();
  assert.equal(result.isMock, true);
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(typeof result.choice === 'string');
  assert.ok(typeof result.rubric === 'string');
  assert.match(controller.getState().jevNotice, /simulated rubric|display-only/i);
});

test('renderCreateView - outputs accessible Prototype A HTML matching DESIGN.md', () => {
  const controller = new CreateController();
  const html = renderCreateView(controller.getState());

  // Check Prototype A / DESIGN.md landmarks & ids
  assert.ok(html.includes('id="tabContentCreate"'));
  assert.ok(html.includes('role="tabpanel"'));
  assert.ok(html.includes('id="btnMediaImage"'));
  assert.ok(html.includes('id="btnMediaVideo"'));
  assert.ok(html.includes('role="radiogroup"'));
  assert.ok(html.includes('id="pillModeText"'));
  assert.ok(html.includes('id="pillModeSingle"'));
  assert.ok(html.includes('id="pillModePaired"'));
  assert.ok(html.includes('id="txtPrompts"'));
  assert.ok(html.includes('id="btnEnqueuePrompts"'));
  assert.ok(html.includes('id="btnImportTxt"'));
  assert.ok(html.includes('id="btnOpenPromptHelper"'));
  assert.ok(html.includes('id="btnEvalJev"'));

  // Check mock watermarks and G0/G1 blocked disclosures
  assert.ok(html.includes('[PROTOTYPE • SIMULATED]'));
  assert.ok(html.includes('Jev 1.13 Free'));
  assert.ok(html.includes('Unsupported upstream'));
});
