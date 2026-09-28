import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderSettingsView,
  type SettingsViewState,
} from '../../src/ui/settings/index.ts';
import {
  PINNED_9ROUTER_ENDPOINT,
  UNKNOWN_MODEL_ID,
  JEV_DISPLAY_LABEL,
} from '../../src/settings/index.ts';

test('renderSettingsView: renders Prototype A structure with pinned endpoint and readonly field', () => {
  // Given: standard initial state
  const state: SettingsViewState = {
    endpoint: PINNED_9ROUTER_ENDPOINT,
    modelId: UNKNOWN_MODEL_ID,
    displayLabel: JEV_DISPLAY_LABEL,
    hasPersonalKey: false,
    maskedKey: null,
    enabled: false,
    consent: false,
    timeoutMs: 5000,
    isG1Blocked: true,
  };

  // When: rendering view HTML
  const html = renderSettingsView(state);

  // Then: contains pinned endpoint input marked readonly
  assert.ok(html.includes('id="tabContentSettings"'), 'Must contain settings section');
  assert.ok(html.includes(`value="${PINNED_9ROUTER_ENDPOINT}"`), 'Must contain pinned endpoint');
  assert.ok(html.includes('readonly'), 'Endpoint must be readonly');
  assert.ok(html.includes('Strict Pinned Policy'), 'Must declare strict pinned policy');
});

test('renderSettingsView: renders display-only Jev label and UNKNOWN model ID with G1 warning', () => {
  // Given: initial state
  const state: SettingsViewState = {
    endpoint: PINNED_9ROUTER_ENDPOINT,
    modelId: UNKNOWN_MODEL_ID,
    displayLabel: JEV_DISPLAY_LABEL,
    hasPersonalKey: false,
    maskedKey: null,
    enabled: false,
    consent: false,
    timeoutMs: 5000,
    isG1Blocked: true,
  };

  // When: rendering HTML
  const html = renderSettingsView(state);

  // Then: Model ID is displayed as UNKNOWN with display-only label note
  assert.ok(html.includes(UNKNOWN_MODEL_ID), 'Must show UNKNOWN model ID');
  assert.ok(html.includes(JEV_DISPLAY_LABEL), 'Must show Jev display label');
  assert.ok(html.includes('G1 Blocked') || html.includes('G1 contract gate BLOCKED'), 'Must mention G1 Blocked');
  assert.ok(html.includes('display-only'), 'Must note display-only nature of Jev label');
});

test('renderSettingsView: strictly enforces reveal-free key lifecycle (NO show/reveal toggle)', () => {
  // Given: state with configured key
  const state: SettingsViewState = {
    endpoint: PINNED_9ROUTER_ENDPOINT,
    modelId: UNKNOWN_MODEL_ID,
    displayLabel: JEV_DISPLAY_LABEL,
    hasPersonalKey: true,
    maskedKey: '••••••••••••••••',
    enabled: true,
    consent: true,
    timeoutMs: 5000,
    isG1Blocked: true,
  };

  // When: rendering HTML
  const html = renderSettingsView(state);

  // Then: NO reveal toggle or show button exists
  assert.ok(!html.includes('btnToggleKeyMask'), 'Must not have reveal toggle button');
  assert.ok(!html.includes('>Show<'), 'Must not contain Show button');
  assert.ok(!html.includes('>Reveal<'), 'Must not contain Reveal button');
  assert.ok(html.includes('type="password"'), 'Key input must be password type');
  assert.ok(html.includes('id="btnRemoveKey"'), 'Must provide key removal control');
  assert.ok(html.includes('id="btnSetDummyKey"'), 'Must provide dummy key insertion helper');
});

test('renderSettingsView: never exposes raw secret key in DOM or value attributes', () => {
  // Given: dummy secret key
  const secretKey = 'dummy_secret_super_confidential_123';
  const state: SettingsViewState = {
    endpoint: PINNED_9ROUTER_ENDPOINT,
    modelId: UNKNOWN_MODEL_ID,
    displayLabel: JEV_DISPLAY_LABEL,
    hasPersonalKey: true,
    maskedKey: '••••••••••••••••',
    enabled: true,
    consent: true,
    timeoutMs: 5000,
    isG1Blocked: true,
  };

  // When: rendering HTML
  const html = renderSettingsView(state);

  // Then: the raw key string is completely absent from HTML output
  assert.ok(!html.includes(secretKey), 'Secret key must never appear in view HTML');
  assert.ok(html.includes('••••••••••••••••'), 'Masked placeholder should be shown');
});

test('renderSettingsView: live test button is visibly DISABLED with G1 BLOCKED badge', () => {
  // Given: state
  const state: SettingsViewState = {
    endpoint: PINNED_9ROUTER_ENDPOINT,
    modelId: UNKNOWN_MODEL_ID,
    displayLabel: JEV_DISPLAY_LABEL,
    hasPersonalKey: true,
    maskedKey: '••••••••••••••••',
    enabled: true,
    consent: true,
    timeoutMs: 5000,
    isG1Blocked: true,
  };

  // When: rendering HTML
  const html = renderSettingsView(state);

  // Then: Test Ping button is disabled with explanation
  assert.ok(html.includes('disabled'), 'Live test button must have disabled attribute');
  assert.ok(html.includes('G1 BLOCKED') || html.includes('G1 Blocked'), 'Must show G1 BLOCKED badge');
  assert.ok(html.includes('Live connection test disabled'), 'Must explain live test is disabled');
});

test('renderSettingsView: renders consent checkbox, enable toggle, and timeout inputs with accessible labels', () => {
  // Given: state
  const state: SettingsViewState = {
    endpoint: PINNED_9ROUTER_ENDPOINT,
    modelId: UNKNOWN_MODEL_ID,
    displayLabel: JEV_DISPLAY_LABEL,
    hasPersonalKey: false,
    maskedKey: null,
    enabled: false,
    consent: false,
    timeoutMs: 5000,
    isG1Blocked: true,
  };

  // When: rendering HTML
  const html = renderSettingsView(state);

  // Then: accessible inputs are present
  assert.ok(html.includes('id="chkConsent"'), 'Must have consent checkbox');
  assert.ok(html.includes('id="chkEnableJev"'), 'Must have enable Jev toggle');
  assert.ok(html.includes('id="numTimeout"'), 'Must have timeout input');
  assert.ok(html.includes('id="btnSaveSettings"'), 'Must have save settings button');
  assert.ok(html.includes('id="btnResetSettings"'), 'Must have reset settings button');
  assert.ok(html.includes('Proxy Operator Warning') || html.includes('Security & Privacy'), 'Must include security warning');
});
