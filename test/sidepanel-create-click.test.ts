import test from 'node:test';
import assert from 'node:assert/strict';
import { SidePanelApp } from '../src/sidepanel/sidepanel.ts';
import { RuntimeBridge } from '../src/integration/service-bridge.ts';
import { setupMockDocument, MockElement } from './mock-dom.ts';

test('RED: Clicking #btnCycleMockRef cycles reference asset and refreshes view', async () => {
  const { panelContent } = setupMockDocument();
  const fakeBridge = new RuntimeBridge();
  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  await app.init();
  app.switchTab('create');

  // Switch to single-ref mode to display reference asset container
  app.createController.setMode('single-ref');
  app.render();

  const btnCycle = panelContent.querySelector<MockElement>('#btnCycleMockRef');
  assert.ok(btnCycle, 'Create view must render #btnCycleMockRef');

  const initialName = panelContent.querySelector<MockElement>('#refFileName')?.textContent;
  await btnCycle.click();

  const updatedName = panelContent.querySelector<MockElement>('#refFileName')?.textContent;
  assert.notEqual(updatedName, initialName, 'Clicking #btnCycleMockRef must cycle reference asset name');
});

test('RED: Clicking #btnLoadSamplePrompts populates prompts and updates prompt count', async () => {
  const { panelContent } = setupMockDocument();
  const fakeBridge = new RuntimeBridge();
  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  await app.init();
  app.switchTab('create');

  const btnLoad = panelContent.querySelector<MockElement>('#btnLoadSamplePrompts');
  assert.ok(btnLoad, 'Create view must render #btnLoadSamplePrompts');

  await btnLoad.click();

  const prompts = app.createController.getState().promptsText;
  assert.ok(prompts.length > 0, 'Prompts must be populated after clicking #btnLoadSamplePrompts');
  assert.ok(prompts.includes('Cyberpunk') || prompts.includes('macro shot'), 'Sample prompts text expected');

  const txtPrompts = panelContent.querySelector<MockElement>('#txtPrompts');
  assert.equal(txtPrompts?.value, prompts, 'Textarea value must match populated sample prompts');
});

test('RED: Clicking #btnOpenPromptHelper toggles accordion and displays template card', async () => {
  const { panelContent } = setupMockDocument();
  const fakeBridge = new RuntimeBridge();
  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  await app.init();
  app.switchTab('create');

  const btnHelper = panelContent.querySelector<MockElement>('#btnOpenPromptHelper');
  assert.ok(btnHelper, 'Create view must render #btnOpenPromptHelper');

  assert.equal(app.createController.getState().isPromptHelperOpen, false);
  await btnHelper.click();

  assert.equal(app.createController.getState().isPromptHelperOpen, true, 'Helper must be open after click');
  const helperCard = panelContent.querySelector<MockElement>('#promptHelperCard');
  assert.equal(helperCard?.style['display'] ?? '', '', 'Helper card must be visible when open');
});

test('RED: Clicking #btnAppendTemplatePrompt appends formatted template to prompt editor', async () => {
  const { panelContent } = setupMockDocument();
  const fakeBridge = new RuntimeBridge();
  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  await app.init();
  app.switchTab('create');

  // Open helper
  app.createController.togglePromptHelper(true);
  app.render();

  const btnAppend = panelContent.querySelector<MockElement>('#btnAppendTemplatePrompt');
  assert.ok(btnAppend, 'Helper card must render #btnAppendTemplatePrompt');

  const selTheme = panelContent.querySelector<MockElement>('#selStyleTheme');
  const selLighting = panelContent.querySelector<MockElement>('#selLighting');
  if (selTheme) selTheme.value = 'cyberpunk';
  if (selLighting) selLighting.value = 'dramatic';

  await btnAppend.click();

  const text = app.createController.getState().promptsText;
  assert.ok(text.length > 0, 'PromptsText must contain appended template prompt');
  const txtPrompts = panelContent.querySelector<MockElement>('#txtPrompts');
  assert.equal(txtPrompts?.value, text, 'Textarea must reflect appended template prompt');
});

test('RED: Clicking #btnEvalJev executes local simulated rubric check with error feedback on empty', async () => {
  const { panelContent } = setupMockDocument();
  const fakeBridge = new RuntimeBridge();
  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  await app.init();
  app.switchTab('create');

  const btnEval = panelContent.querySelector<MockElement>('#btnEvalJev');
  assert.ok(btnEval, 'Create view must render #btnEvalJev');

  // Case 1: Empty prompts -> error feedback
  app.createController.setPromptsText('');
  app.render();
  await btnEval.click();

  const stateAfterEmpty = app.createController.getState();
  assert.equal(stateAfterEmpty.jevStatus, 'error', 'Evaluating empty prompt must set error status');

  // Case 2: Valid prompt -> local mock check completes
  app.createController.setPromptsText('Cinematic portrait of a Thai craftsman in Chiang Mai');
  app.render();
  await btnEval.click();

  const stateAfterValid = app.createController.getState();
  assert.equal(stateAfterValid.jevStatus, 'completed');
  assert.ok(stateAfterValid.jevResult, 'Jev result must be populated');
  assert.equal(stateAfterValid.jevResult.isMock, true, 'Must strictly be simulated local check');
});

test('RED: Fallback enqueue never claims success on validation error or drops jobs silently', async () => {
  const { panelContent } = setupMockDocument();
  const failingBridge = new RuntimeBridge();
  failingBridge.sendCommand = async () => ({ success: false, error: 'Worker unavailable' });

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = failingBridge;
  await app.init();
  app.switchTab('create');

  // Mode: paired-ref with count mismatch (2 prompts, 0 refs) -> invalid!
  app.createController.setMode('paired-ref');
  app.createController.setPromptsText('Prompt 1\nPrompt 2');
  app.render();

  const btnEnqueue = panelContent.querySelector<MockElement>('#btnEnqueuePrompts');
  assert.ok(btnEnqueue, 'Create view must render #btnEnqueuePrompts');

  await btnEnqueue.click();

  // Must NOT switch tab to queue, must display validation notice, must NOT clear prompts
  assert.equal(app.getActiveTab(), 'create', 'Must remain on create tab on validation failure');
  assert.ok(app.createController.getState().validationErrors.length > 0, 'Validation errors must be set');
  assert.equal(app.createController.getState().promptsText, 'Prompt 1\nPrompt 2', 'Prompts must not be dropped');
});

test('RED: Fallback enqueue switches to queue tab and retains jobs on valid enqueue', async () => {
  const { panelContent } = setupMockDocument();
  const failingBridge = new RuntimeBridge();
  failingBridge.sendCommand = async () => ({ success: false, error: 'Worker bridge offline' });

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = failingBridge;
  await app.init();
  app.switchTab('create');

  app.createController.setMode('text-only');
  app.createController.setPromptsText('Valid fallback prompt 1\nValid fallback prompt 2');
  app.render();

  const btnEnqueue = panelContent.querySelector<MockElement>('#btnEnqueuePrompts');
  assert.ok(btnEnqueue, 'Create view must render #btnEnqueuePrompts');

  await btnEnqueue.click();

  assert.equal(app.getActiveTab(), 'queue', 'Must transition to queue tab on successful fallback enqueue');
  assert.equal(app.createController.getState().promptsText, '', 'Prompts in controller must be reset');
});

test('RED: Clicking #btnImportTxt prompts or triggers text import and validates state', async () => {
  const { panelContent } = setupMockDocument();
  const fakeBridge = new RuntimeBridge();
  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  await app.init();
  app.switchTab('create');

  const btnImport = panelContent.querySelector<MockElement>('#btnImportTxt');
  assert.ok(btnImport, 'Create view must render #btnImportTxt');

  await btnImport.click();
  const fileInput = panelContent.querySelector<MockElement>('input[type="file"]');
  assert.ok(fileInput, 'File input element must exist or be triggered for .txt import');
});

