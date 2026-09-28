import type { SettingsViewState } from './types.ts';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderSettingsView(state: SettingsViewState): string {
  const safeEndpoint = escapeHtml(state.endpoint);
  const safeModelId = escapeHtml(state.modelId);
  const safeDisplayLabel = escapeHtml(state.displayLabel);
  const keyPlaceholder = state.hasPersonalKey
    ? (state.maskedKey ?? '••••••••••••••••')
    : 'Enter personal API key (sk-...)';
  const hasKey = state.hasPersonalKey;
  const isG1Blocked = state.isG1Blocked;

  const statusBanner = state.statusMessage
    ? `<div class="settings-alert status-${escapeHtml(state.statusType ?? 'info')}" role="alert">
        <span>${escapeHtml(state.statusMessage)}</span>
      </div>`
    : '';

  return `
<section class="tab-body" id="tabContentSettings" aria-label="Extension Settings and Jev Configuration">
  ${statusBanner}

  <!-- CARD 1: PINNED 9ROUTER TARGET -->
  <div class="card card-pinned-target" style="border-color: rgba(157, 92, 255, 0.3);">
    <div class="card-title" style="color: var(--jev-purple-text, #c084fc); display: flex; align-items: center; gap: 6px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <span>Pinned 9router Target (Endpoint คงที่)</span>
      <span class="badge badge-pinned" style="font-size: 10px; font-family: var(--font-mono); margin-left: auto;">Strict Pinned Policy</span>
    </div>
    <div class="form-group" style="margin-top: 8px;">
      <label class="label" for="cfgEndpoint">
        <span>System One API Endpoint</span>
        <span class="helper">Read-only destination</span>
      </label>
      <input
        type="text"
        class="input-text font-mono"
        id="cfgEndpoint"
        value="${safeEndpoint}"
        readonly
        aria-readonly="true"
        aria-describedby="endpointHelp"
      />
      <div id="endpointHelp" class="field-help" style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
        🔒 ล็อกตายตัวเพื่อความปลอดภัย ไม่อนุญาตให้เปลี่ยน URL ป้องกัน credential รั่วไหลออกนอกโดเมนที่รับรอง
      </div>
    </div>
  </div>

  <!-- CARD 2: MODEL IDENTIFIER & DISPLAY STATUS -->
  <div class="card card-model-info" style="margin-top: 10px;">
    <div class="form-group">
      <div style="display: flex; justify-content: space-between; align-items: baseline;">
        <label class="label" for="cfgModelId">
          <span>Verified Model ID</span>
          <span class="helper">Technical identifier</span>
        </label>
        <span class="badge badge-model-label" style="font-size: 10px; font-family: var(--font-mono); color: var(--text-accent);">
          Display Label: ${safeDisplayLabel}
        </span>
      </div>
      <input
        type="text"
        class="input-text font-mono"
        id="cfgModelId"
        value="${safeModelId}"
        readonly
        aria-readonly="true"
        aria-describedby="modelHelp"
      />
      <div id="modelHelp" class="field-help" style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
        หมายเหตุ: ป้าย "Jev 1.13 Free" เป็น display-only label สำหรับแสดงผลเท่านั้น ทางการระบุ ID เป็น <strong>${safeModelId}</strong> (G1 contract gate BLOCKED: ยังไม่มีโมเดลยืนยันจาก upstream route)
      </div>
    </div>
  </div>

  <!-- CARD 3: PERSONAL API KEY (REVEAL-FREE LIFECYCLE) -->
  <div class="card card-key-lifecycle" style="margin-top: 10px;">
    <div class="form-group">
      <label class="label" for="cfgApiKey">
        <span>Personal API Key</span>
        <span class="helper">Masked & Extension-Local Only</span>
      </label>
      <div class="key-input-row" style="display: flex; gap: 6px;">
        <input
          type="password"
          class="input-text font-mono"
          id="cfgApiKey"
          placeholder="${escapeHtml(keyPlaceholder)}"
          autocomplete="off"
          spellcheck="false"
          aria-describedby="keyHelp"
        />
        ${
          hasKey
            ? `<button type="button" class="btn btn-secondary btn-sm" id="btnRemoveKey" title="Remove stored key">Remove</button>`
            : ''
        }
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
        <span id="keyHelp" style="font-size: 11px; color: var(--text-muted);">
          ${hasKey ? 'Key configured (masked). Local storage only.' : 'Stored in chrome.storage.local; never synced.'}
        </span>
        <button type="button" class="btn btn-sm btn-secondary" id="btnSetDummyKey" style="font-size: 10px; padding: 2px 6px;">
          Insert Dummy Key
        </button>
      </div>
    </div>
  </div>

  <!-- CARD 4: CONNECTION TEST (G1 BLOCKED • DISABLED) -->
  <div class="card card-connection-test" style="margin-top: 10px; background: rgba(16, 185, 129, 0.03); border-color: rgba(16, 185, 129, 0.2);">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-weight: 600; font-size: 12px; color: #6ee7b7; display: flex; align-items: center; gap: 6px;">
          <span>Connection Test (ทดสอบสัญญาณ)</span>
          <span class="badge badge-blocked" style="font-size: 10px; font-family: var(--font-mono); color: #fca5a5; background: rgba(239, 68, 68, 0.15); padding: 1px 4px; border-radius: 2px;">
            G1 BLOCKED • Disabled
          </span>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
          Live connection test disabled: G1 contract gate BLOCKED pending verified credentials and endpoint contract.
        </div>
      </div>
      <button type="button" class="btn btn-sm btn-secondary" id="btnTestConnection" disabled aria-disabled="true">
        Test Ping
      </button>
    </div>
  </div>

  <!-- CARD 5: JEV TOGGLE & TIMEOUT CONTROLS -->
  <div class="card card-controls" style="margin-top: 10px;">
    <div class="form-group" style="display: flex; justify-content: space-between; align-items: center;">
      <label class="label-toggle" for="chkEnableJev" style="cursor: pointer; display: flex; flex-direction: column;">
        <span style="font-weight: 500;">Enable Jev Decision Gate</span>
        <span style="font-size: 11px; color: var(--text-muted);">เปิดใช้งานการประเมิน prompt ด้วย Jev เมื่อพร้อม</span>
      </label>
      <input type="checkbox" id="chkEnableJev" ${state.enabled ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;"/>
    </div>

    <div class="form-group" style="margin-top: 8px;">
      <label class="label" for="numTimeout">
        <span>Request Timeout (ms)</span>
        <span class="helper">Range: 1000 - 30000 ms</span>
      </label>
      <input
        type="number"
        class="input-text font-mono"
        id="numTimeout"
        value="${String(state.timeoutMs)}"
        min="1000"
        max="30000"
        step="500"
      />
    </div>
  </div>

  <!-- CARD 6: SECURITY & PRIVACY CONSENT -->
  <div class="card card-consent" style="margin-top: 10px; border-top: 1px solid var(--border-subtle); padding-top: 10px;">
    <div class="label" style="font-weight: 600; margin-bottom: 6px;">
      <span>Security & Privacy Consent</span>
    </div>
    <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 11px; color: var(--text-muted); cursor: pointer;">
      <input type="checkbox" id="chkConsent" ${state.consent ? 'checked' : ''} style="margin-top: 2px;">
      <span>ฉันยินยอมให้ส่วนขยายส่งเฉพาะข้อความ prompt ไปประเมินความชัดเจนที่ 9router (ไม่ส่งไฟล์ภาพและไม่เก็บประวัติถาวร)</span>
    </label>

    <div class="warning-callout" style="margin-top: 8px; font-size: 10.5px; color: #fcd34d; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); padding: 6px 8px; border-radius: 4px;">
      ⚠️ Proxy Operator Warning: Personal API key and prompt text transit third-party proxy (9router.bangkhan.com). Meta web page also receives submitted prompt. Never use production secrets without operator trust agreement.
    </div>
  </div>

  <!-- ACTION BAR -->
  <div class="settings-actions" style="display: flex; gap: 8px; margin-top: 16px;">
    <button type="button" class="btn btn-secondary" id="btnResetSettings" style="flex: 1;">
      Reset Defaults
    </button>
    <button type="button" class="btn btn-primary" id="btnSaveSettings" style="flex: 2;">
      Save Settings
    </button>
  </div>
</section>
`.trim();
}
