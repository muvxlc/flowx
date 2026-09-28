import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CreateController,
  renderCreateView,
} from '../../../src/ui/create/index.ts';

test('Probe 1: XSS & HTML injection in prompt text is strictly escaped in view', () => {
  const controller = new CreateController();
  const maliciousPrompt = '<script>alert("pwned")</script><img src=x onerror=alert(1)>';
  controller.setPromptsText(maliciousPrompt);

  const html = renderCreateView(controller.getState());

  assert.ok(!html.includes('<script>alert("pwned")</script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;script&gt;alert(&quot;pwned&quot;)&lt;/script&gt;'));
});

test('Probe 2: Thai & Unicode complex characters are preserved verbatim in drafts', async () => {
  const controller = new CreateController();
  controller.setMedia('image');
  controller.setMode('text-only');

  const thaiPrompt = 'ภาพวาดจิตรกรรมไทยร่วมสมัย ลายกนกสีทองอร่าม แสงแดดยามเช้าในกรุงเทพฯ';
  controller.setPromptsText(thaiPrompt);

  let capturedPrompt = '';
  controller.onEnqueue(async (cmd) => {
    capturedPrompt = cmd.jobs[0]?.prompt ?? '';
  });

  const res = await controller.submitEnqueue();
  assert.equal(res.success, true);
  assert.equal(capturedPrompt, thaiPrompt);
});

test('Probe 3: CRLF and empty lines normalization in prompt counting', () => {
  const controller = new CreateController();
  controller.setPromptsText('Line 1\r\n\r\nLine 2\r\n   \r\nLine 3\n');

  const preview = controller.getPreview();
  assert.equal(preview.promptCount, 3);
});

test('Probe 4: Adversarial paired mismatch boundary tests', async () => {
  const controller = new CreateController();
  controller.setMedia('video');
  controller.setMode('paired-ref');

  // Case A: 0 prompts and 2 references
  controller.setPromptsText('');
  controller.setReferences([
    { id: 'ref_1', name: 'ref1.png', mimeType: 'image/png', sizeBytes: 100 },
    { id: 'ref_2', name: 'ref2.png', mimeType: 'image/png', sizeBytes: 100 },
  ]);
  const previewA = controller.getPreview();
  assert.equal(previewA.isValid, false);
  const resA = await controller.submitEnqueue();
  assert.equal(resA.success, false);

  // Case B: 5 prompts and 1 reference
  controller.setPromptsText('p1\np2\np3\np4\np5');
  controller.setReferences([
    { id: 'ref_1', name: 'ref1.png', mimeType: 'image/png', sizeBytes: 100 },
  ]);
  const previewB = controller.getPreview();
  assert.equal(previewB.isValid, false);
  const resB = await controller.submitEnqueue();
  assert.equal(resB.success, false);
});

test('Probe 5: Unsupported settings are strictly immutable and disabled', () => {
  const controller = new CreateController();
  const state = controller.getState();

  const settings = state.unsupportedSettings;
  assert.equal(settings.customNegativePrompt.disabled, true);
  assert.equal(settings.videoAspectRatioOverride.disabled, true);
  assert.equal(settings.customSeed.disabled, true);
  assert.equal(settings.highResUpscale.disabled, true);

  // Confirm reasons contain upstream limitation notice
  assert.match(settings.customNegativePrompt.reason, /upstream/i);
  assert.match(settings.videoAspectRatioOverride.reason, /upstream|override/i);
});

test('Probe 6: Rapid mode switching preserves isolation of reference requirements', async () => {
  const controller = new CreateController();
  controller.setPromptsText('Valid prompt line');
  controller.setReferences([
    { id: 'ref_x', name: 'x.png', mimeType: 'image/png', sizeBytes: 500 },
  ]);

  // Switch to text-only: reference is ignored
  controller.setMode('text-only');
  assert.equal(controller.getPreview().isValid, true);

  // Switch to single-ref: valid (1 ref provided)
  controller.setMode('single-ref');
  assert.equal(controller.getPreview().isValid, true);

  // Switch to paired-ref: valid (1 prompt, 1 ref)
  controller.setMode('paired-ref');
  assert.equal(controller.getPreview().isValid, true);

  // Add 1 more prompt without ref: paired becomes invalid
  controller.setPromptsText('Valid prompt line 1\nValid prompt line 2');
  assert.equal(controller.getPreview().isValid, false);

  // Switch back to text-only: becomes valid again
  controller.setMode('text-only');
  assert.equal(controller.getPreview().isValid, true);
});

test('Probe 7: Verify NO direct Meta DOM or API calls in src/ui/create/*', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const createDir = path.resolve('src/ui/create');
  const files = fs.readdirSync(createDir);

  for (const file of files) {
    const fullPath = path.join(createDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');

    // Forbid direct meta.ai domain API calls or DOM querySelectors for meta page
    assert.ok(!content.includes('https://www.meta.ai/api'), `Direct Meta API call in ${file}`);
    assert.ok(!content.includes('fetch("https://www.meta.ai'), `Direct fetch to Meta in ${file}`);
    assert.ok(!content.includes('chrome.tabs.executeScript'), `Direct script injection in ${file}`);
  }
});
