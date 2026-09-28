import assert from 'node:assert/strict';
import {
  SettingsService,
  MemoryStorageAdapter,
  PINNED_9ROUTER_ENDPOINT,
  UNKNOWN_MODEL_ID,
  JEV_DISPLAY_LABEL,
  SettingsError,
} from '../../src/settings/index.ts';
import { renderSettingsView } from '../../src/ui/settings/index.ts';

export async function runManualQASettingsScenario() {
  console.log('====================================================');
  console.log('TASK 13: MANUAL QA SETTINGS & KEY LIFECYCLE SCENARIO');
  console.log('====================================================\n');

  const storage = new MemoryStorageAdapter();
  const service = new SettingsService(storage);

  // 1. Initial State Inspection
  console.log('--- 1. Initial Default State ---');
  const initial = await service.getPublicSettings();
  console.log('Endpoint:', initial.endpoint);
  console.log('Model ID:', initial.modelId);
  console.log('Display Label:', initial.displayLabel);
  console.log('Has Personal Key:', initial.hasPersonalKey);
  console.log('G1 Blocked:', initial.isG1Blocked);
  assert.equal(initial.endpoint, PINNED_9ROUTER_ENDPOINT);
  assert.equal(initial.modelId, UNKNOWN_MODEL_ID);
  assert.equal(initial.displayLabel, JEV_DISPLAY_LABEL);
  assert.equal(initial.hasPersonalKey, false);
  assert.equal(initial.isG1Blocked, true);

  // 2. Safe Save Personal Key with dummy_secret
  console.log('\n--- 2. Saving Personal Key (dummy_secret) ---');
  const dummySecret = 'dummy_secret_sk_test_mock_12345';
  await service.savePersonalKey(dummySecret);
  const afterSave = await service.getPublicSettings();
  console.log('Key saved. hasPersonalKey:', afterSave.hasPersonalKey);
  console.log('Masked Key:', afterSave.maskedKey);
  assert.equal(afterSave.hasPersonalKey, true);
  assert.equal(afterSave.maskedKey, '••••••••••••••••');
  assert.ok(!JSON.stringify(afterSave).includes(dummySecret), 'Secret must never leak in public JSON');

  // 3. UI HTML Rendering & Reveal-Free Check
  console.log('\n--- 3. UI View Rendering & Reveal-Free Audit ---');
  const viewHtml = renderSettingsView(afterSave);
  assert.ok(viewHtml.includes('id="tabContentSettings"'));
  assert.ok(!viewHtml.includes('btnToggleKeyMask'), 'NO reveal toggle button in DOM');
  assert.ok(!viewHtml.includes(dummySecret), 'Secret string NOT in rendered DOM');
  assert.ok(viewHtml.includes('Strict Pinned Policy'));
  assert.ok(viewHtml.includes('G1 BLOCKED • Disabled'));
  console.log('DOM check PASSED: No reveal toggle, no raw secret in attributes/text.');

  // 4. Updating Settings (Consent, Enable, Timeout)
  console.log('\n--- 4. Updating Settings ---');
  const updated = await service.updateSettings({
    enabled: true,
    consent: true,
    timeoutMs: 6500,
  });
  console.log('Updated: enabled =', updated.enabled, ', consent =', updated.consent, ', timeoutMs =', updated.timeoutMs);
  assert.equal(updated.enabled, true);
  assert.equal(updated.consent, true);
  assert.equal(updated.timeoutMs, 6500);

  // 5. Background Internal Key Retrieval (Gated on Consent)
  console.log('\n--- 5. Background Key Access (Requires Consent) ---');
  const internalKey = await service.getInternalKeyForBackground();
  assert.equal(internalKey, dummySecret);
  console.log('Background service worker successfully received internal key when consent is granted.');

  // 6. G1 BLOCKED Live Test Verification
  console.log('\n--- 6. Live Test Call Guard (G1 BLOCKED) ---');
  let blockedCaught = false;
  try {
    await service.executeLiveTest();
  } catch (err: unknown) {
    if (err instanceof SettingsError && err.code === 'G1_BLOCKED') {
      blockedCaught = true;
      console.log('Live test cleanly rejected with G1_BLOCKED:', err.message);
    }
  }
  assert.ok(blockedCaught, 'Must reject live test with G1_BLOCKED');

  // 7. Endpoint Override Protection
  console.log('\n--- 7. Pinned Endpoint Override Protection ---');
  let overrideCaught = false;
  try {
    await service.updateSettings({ endpoint: 'https://evil.target.com/v1/systemone' });
  } catch (err: unknown) {
    if (err instanceof SettingsError && err.code === 'INVALID_ENDPOINT') {
      overrideCaught = true;
      console.log('Endpoint override cleanly rejected with INVALID_ENDPOINT:', err.message);
    }
  }
  assert.ok(overrideCaught, 'Must reject endpoint override');

  // 8. Key Removal
  console.log('\n--- 8. Removing Personal Key ---');
  await service.removePersonalKey();
  const cleared = await service.getPublicSettings();
  assert.equal(cleared.hasPersonalKey, false);
  assert.equal(cleared.maskedKey, null);
  console.log('Key cleanly removed. hasPersonalKey:', cleared.hasPersonalKey);

  console.log('\n====================================================');
  console.log('ALL MANUAL QA SETTINGS SCENARIOS COMPLETED (PASS)');
  console.log('====================================================\n');
}

if (process.argv[1]?.endsWith('manual-qa-settings.ts')) {
  runManualQASettingsScenario().catch((err) => {
    console.error('Manual QA scenario failed:', err);
    process.exit(1);
  });
}
