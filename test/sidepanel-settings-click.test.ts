import test from 'node:test';
import assert from 'node:assert/strict';
import { SidePanelApp } from '../src/sidepanel/sidepanel.ts';
import { RuntimeBridge } from '../src/integration/service-bridge.ts';
import type { SafeSettingsSummary } from '../src/integration/types.ts';
import { setupMockDocument, MockElement } from './mock-dom.ts';

test('RED: Settings mediator persists consent, enable, and timeout via worker commands', async () => {
  const { panelContent } = setupMockDocument();
  const dispatched: Array<{ action: string; payload: any }> = [];

  const fakeBridge = new RuntimeBridge();
  fakeBridge.sendCommand = async (action: string, payload?: any) => {
    dispatched.push({ action, payload });
    if (action === 'SETTINGS_UPDATE' && payload?.action === 'GET') {
      return {
        success: true,
        settings: {
          endpoint: 'https://9router.bangkhan.com/v1/systemone',
          modelId: 'UNKNOWN',
          displayLabel: 'Jev 1.13 Free (9router System One)',
          hasKey: false,
          isG1Blocked: true,
          isG0Blocked: true,
          enabled: false,
          consent: false,
          timeoutMs: 5000,
        } as SafeSettingsSummary,
      };
    }
    if (action === 'SETTINGS_UPDATE') {
      return { success: true, hasKey: payload?.apiKey ? true : false };
    }
    return { success: true };
  };

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  await app.init();
  app.switchTab('settings');

  const chkEnable = panelContent.querySelector<MockElement>('#chkEnableJev');
  const chkConsent = panelContent.querySelector<MockElement>('#chkConsent');
  const numTimeout = panelContent.querySelector<MockElement>('#numTimeout');
  const btnSave = panelContent.querySelector<MockElement>('#btnSaveSettings');

  assert.ok(btnSave, 'Settings view must render #btnSaveSettings');
  assert.ok(chkEnable, 'Settings view must render #chkEnableJev');
  assert.ok(chkConsent, 'Settings view must render #chkConsent');
  assert.ok(numTimeout, 'Settings view must render #numTimeout');

  if (chkEnable) chkEnable.checked = true;
  if (chkConsent) chkConsent.checked = true;
  if (numTimeout) numTimeout.value = '10000';

  await btnSave.click();

  assert.ok(
    dispatched.some(
      (d) =>
        d.action === 'SETTINGS_UPDATE' &&
        (d.payload?.enabled === true || d.payload?.settings?.enabled === true) &&
        (d.payload?.consent === true || d.payload?.settings?.consent === true) &&
        (d.payload?.timeoutMs === 10000 || d.payload?.settings?.timeoutMs === 10000)
    ),
    'Saving settings must persist enabled, consent, and timeout via worker message'
  );
});

test('RED: Settings mediator never stores raw API key in panel state', async () => {
  const { panelContent } = setupMockDocument();
  const rawSecret = 'secret_key_never_store_in_panel_98765';

  const fakeBridge = new RuntimeBridge();
  fakeBridge.sendCommand = async (action: string, payload?: any) => {
    if (action === 'SETTINGS_UPDATE' && payload?.action === 'SAVE_KEY') {
      return { success: true, hasKey: true };
    }
    return {
      success: true,
      settings: {
        endpoint: 'https://9router.bangkhan.com/v1/systemone',
        modelId: 'UNKNOWN',
        displayLabel: 'Jev 1.13 Free (9router System One)',
        hasKey: false,
        isG1Blocked: true,
        isG0Blocked: true,
      } as SafeSettingsSummary,
    };
  };

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = fakeBridge;
  await app.init();
  app.switchTab('settings');

  const keyInput = panelContent.querySelector<MockElement>('#cfgApiKey');
  const btnSave = panelContent.querySelector<MockElement>('#btnSaveSettings');
  if (keyInput) keyInput.value = rawSecret;

  await btnSave?.click();

  const mediatorState = (app.settingsMediator as any).state;
  assert.equal(mediatorState.hasPersonalKey, true);
  assert.equal(mediatorState.maskedKey, '••••••••••••••••');
  assert.equal(mediatorState.apiKey, undefined, 'Raw API key must NOT be stored in mediator state');

  const serialized = JSON.stringify(mediatorState);
  assert.equal(serialized.includes(rawSecret), false, 'Raw API key must not appear in serialized state');
});

test('RED: Settings mediator renders error feedback and does not claim success when worker fails', async () => {
  const { panelContent } = setupMockDocument();

  const failingBridge = new RuntimeBridge();
  failingBridge.sendCommand = async (action: string, payload?: any) => {
    if (action === 'SETTINGS_UPDATE' && payload?.action !== 'GET') {
      return { success: false, error: 'Failed to write settings to storage' };
    }
    return {
      success: true,
      settings: {
        endpoint: 'https://9router.bangkhan.com/v1/systemone',
        modelId: 'UNKNOWN',
        displayLabel: 'Jev 1.13 Free (9router System One)',
        hasKey: false,
        isG1Blocked: true,
        isG0Blocked: true,
      } as SafeSettingsSummary,
    };
  };

  const app = new SidePanelApp();
  (app as unknown as { bridge: RuntimeBridge }).bridge = failingBridge;
  await app.init();
  app.switchTab('settings');

  const keyInput = panelContent.querySelector<MockElement>('#cfgApiKey');
  if (keyInput) keyInput.value = 'dummy_secret';

  const btnSave = panelContent.querySelector<MockElement>('#btnSaveSettings');
  await btnSave?.click();

  const mediatorState = (app.settingsMediator as any).state;
  assert.equal(mediatorState.statusType, 'error');
  assert.ok(mediatorState.statusMessage?.includes('Failed to write settings') || mediatorState.statusMessage?.includes('failed'));
});
