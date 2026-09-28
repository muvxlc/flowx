import type { CreatePanelState } from './types.ts';

function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderCreateView(state: CreatePanelState): string {
  const isImage = state.media === 'image';
  const isVideo = state.media === 'video';
  const isText = state.mode === 'text-only';
  const isSingle = state.mode === 'single-ref';
  const isPaired = state.mode === 'paired-ref';

  const modeLabels: Record<string, string> = {
    'text-only': 'Text-Only (1:0)',
    'single-ref': 'Single Ref (1:N)',
    'paired-ref': 'Paired 1:1 (N:N)',
  };
  const summaryText = `${isImage ? 'Image' : 'Video'} • ${modeLabels[state.mode]}`;

  const currentRef = state.references[state.currentRefIndex] ?? state.sampleRefs[0];
  const refDisplay = isText ? 'none' : 'flex';

  const promptLines = state.promptsText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const promptCount = promptLines.length;

  const errorHtml =
    state.validationErrors.length > 0
      ? `<div class="create-alert error" role="alert" id="createValidationError">
          <strong>Validation Notice:</strong>
          <ul style="margin: 4px 0 0 16px; padding: 0;">
            ${state.validationErrors.map((err) => `<li>${escapeHtml(err)}</li>`).join('')}
          </ul>
        </div>`
      : '';

  const statusHtml = state.statusMessage
    ? `<div class="create-alert ${escapeHtml(state.statusType ?? 'info')}" role="status">${escapeHtml(state.statusMessage)}</div>`
    : '';

  let jevContent = 'Simulate 9router System One typed rubric scoring (<code>choice</code>, <code>score</code>, <code>noul</code>) before enqueueing.';
  if (state.jevStatus === 'evaluating') {
    jevContent = '<span style="color: #c084fc;">⚡ Simulating 9router Jev System One evaluation (~140ms)...</span>';
  } else if (state.jevStatus === 'completed' && state.jevResult) {
    const res = state.jevResult;
    jevContent = `
      <div style="background: rgba(157, 92, 255, 0.15); padding: 8px; border-radius: 4px; border: 1px solid rgba(157, 92, 255, 0.4);">
        <div style="font-weight: 600; color: #d8b4fe; margin-bottom: 2px;">
          ✓ Jev Typed Decision: score=${res.score}/100 • noul=${res.noul} (PASS)
        </div>
        <div style="font-size: 10px; color: #e9d5ff;">
          Classification: <code>choice: ${escapeHtml(res.choice)}</code> | Rubric: ${escapeHtml(res.rubric)}
        </div>
      </div>`.trim();
  }

  return `
<section class="tab-body" id="tabContentCreate" role="tabpanel" aria-label="Create Generation Jobs">
  <!-- Prototype Tour Banner -->
  <div class="walkthrough-banner">
    <div>
      <div class="mock-watermark">[PROTOTYPE • SIMULATED] v2.0-mock</div>
      <strong style="font-size: 11.5px;">Interactive Prototype Tour</strong>
      <div style="font-size: 10px; opacity: 0.85;">คลิกปุ่มเพื่อทดสอบ 6 โหมด + Jev Score (G0/G1 Live Blocked)</div>
    </div>
    <button type="button" class="btn btn-sm btn-outline-purple" id="btnRunWalkthrough">Play Demo</button>
  </div>

  ${errorHtml}
  ${statusHtml}

  <!-- 1. Media Type Selector -->
  <div class="form-group">
    <div class="section-title">
      <span>1. Media Target (เป้าหมายสื่อ)</span>
      <span style="font-size: 10px; font-weight: normal; color: var(--text-muted);">Meta AI Canvas</span>
    </div>
    <div class="media-toggle" role="radiogroup" aria-label="Media Target">
      <button type="button" role="radio" aria-checked="${isImage}" class="media-toggle-btn ${isImage ? 'active' : ''}" data-media="image" id="btnMediaImage">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <span>Image (ภาพนิ่ง)</span>
      </button>
      <button type="button" role="radio" aria-checked="${isVideo}" class="media-toggle-btn ${isVideo ? 'active' : ''}" data-media="video" id="btnMediaVideo">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
        <span>Video (วิดีโอแอนิเมชัน)</span>
      </button>
    </div>
  </div>

  <!-- 2. Generation Mode Matrix -->
  <div class="form-group">
    <div class="section-title">
      <span>2. Generation Mode (โหมดเชื่อมโยง)</span>
      <span id="lblModeSummary" style="color: var(--accent-hover, #4e75ff); font-size: 10.5px; font-family: var(--font-mono, monospace);">${escapeHtml(summaryText)}</span>
    </div>
    <div class="mode-matrix" role="radiogroup" aria-label="Generation Mode">
      <button type="button" role="radio" aria-checked="${isText}" class="mode-pill ${isText ? 'active' : ''}" data-mode="text-only" id="pillModeText">
        <span>Text Only</span>
        <span class="mode-tag">1:0 ไม่มีรูปอ้างอิง</span>
      </button>
      <button type="button" role="radio" aria-checked="${isSingle}" class="mode-pill ${isSingle ? 'active' : ''}" data-mode="single-ref" id="pillModeSingle">
        <span>Single Ref</span>
        <span class="mode-tag">1:N ใช้รูปเดิมซ้ำ</span>
      </button>
      <button type="button" role="radio" aria-checked="${isPaired}" class="mode-pill ${isPaired ? 'active' : ''}" data-mode="paired-ref" id="pillModePaired">
        <span>Paired 1:1</span>
        <span class="mode-tag">N:N รูปคู่ข้อความ</span>
      </button>
    </div>
  </div>

  <!-- 3. Reference Asset Area -->
  <div class="form-group" id="refAssetContainer" style="display: ${refDisplay};">
    <div class="label">
      <span id="refAssetTitle">${isPaired ? 'Paired Reference Assets (N:N)' : 'Reference Image (รูปอ้างอิง 1:N)'}</span>
      <span class="helper" id="refAssetHint">${state.references.length} asset(s) ready</span>
    </div>
    <div class="card" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <div id="refThumbPreview" style="width: 36px; height: 36px; background: #1f2937; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: var(--text-muted); border: 1px solid var(--border-subtle);">
          ${isPaired ? 'PAIR' : '1:N'}
        </div>
        <div>
          <div id="refFileName" style="font-weight: 500; font-size: 11px;">${escapeHtml(currentRef?.name ?? 'none')}</div>
          <div id="refFileSize" style="font-size: 10px; color: var(--text-muted);">${Math.round((currentRef?.sizeBytes ?? 0) / 1024)} KB • ${escapeHtml(currentRef?.mimeType ?? 'image/png')}</div>
        </div>
      </div>
      <button type="button" class="btn btn-sm btn-secondary" id="btnCycleMockRef">Change Asset</button>
    </div>
  </div>

  <!-- 4. Prompts Input Area -->
  <div class="form-group">
    <div class="label">
      <span>Prompts (รายการคำสั่งสร้างสื่อ)</span>
      <span class="helper">1 line = 1 generation job</span>
    </div>
    <textarea class="textarea" id="txtPrompts" aria-label="Prompts input" placeholder="Enter one prompt per line...">${escapeHtml(state.promptsText)}</textarea>
    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; color: var(--text-muted); margin-top: 4px;">
      <span id="promptLineCount">${promptCount} prompt${promptCount === 1 ? '' : 's'} ready</span>
      <div style="display: flex; gap: 6px;">
        <button type="button" class="btn btn-sm btn-secondary" id="btnLoadSamplePrompts">Load Samples</button>
        <button type="button" class="btn btn-sm btn-secondary" id="btnOpenPromptHelper" aria-expanded="${state.isPromptHelperOpen}">Template Helper</button>
      </div>
    </div>
  </div>

  <!-- 5. Deterministic Local Prompt Helper Accordion -->
  <div class="card" id="promptHelperCard" style="display: ${state.isPromptHelperOpen ? 'block' : 'none'}; border-color: rgba(79, 104, 255, 0.4);">
    <div class="card-title" style="color: #93c5fd;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>
      <span>Deterministic Local Prompt Helper (ตัวช่วยจัดโครงสร้างคำสั่ง)</span>
    </div>
    <div style="font-size: 10.5px; color: var(--text-muted); margin-bottom: 8px;">
      สร้าง template ในเครื่องโดยไม่ต้องต่อโมเดลสร้างข้อความภายนอก (Jev ใช้ประเมินคะแนน ไม่ได้สร้างข้อความ)
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px;">
      <select class="select" id="selStyleTheme" aria-label="Style Theme">
        <option value="cinematic">Cinematic 35mm film, moody</option>
        <option value="minimalist">Minimalist Scandinavian clean</option>
        <option value="cyberpunk">Cyberpunk neon rain aesthetic</option>
        <option value="thai_contemporary">Contemporary Thai modern</option>
      </select>
      <select class="select" id="selLighting" aria-label="Lighting Selection">
        <option value="golden_hour">Golden hour warm glow</option>
        <option value="studio_soft">Studio softbox diffusion</option>
        <option value="dramatic">High-contrast chiaroscuro</option>
      </select>
    </div>
    <button type="button" class="btn btn-sm btn-secondary" id="btnAppendTemplatePrompt" style="width: 100%;">
      Append Formatted Prompt to Editor
    </button>
  </div>

  <!-- 6. Unsupported Upstream Settings Card -->
  <div class="card unsupported-settings-card" aria-label="Unsupported Upstream Settings">
    <div class="card-title" style="color: var(--text-muted); font-size: 11px;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
      <span>Unsupported Upstream Settings (ปิดการทำงานตาม Meta AI UI จริง)</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 4px;">
      <div class="unsupported-setting-item">
        <span class="unsupported-badge">DISABLED</span>
        <div>
          <strong style="color: var(--text-muted);">Custom Negative Prompt:</strong>
          <span style="font-size: 10px;"> ${escapeHtml(state.unsupportedSettings.customNegativePrompt.reason)}</span>
        </div>
      </div>
      <div class="unsupported-setting-item">
        <span class="unsupported-badge">DISABLED</span>
        <div>
          <strong style="color: var(--text-muted);">Video Aspect Ratio Override:</strong>
          <span style="font-size: 10px;"> ${escapeHtml(state.unsupportedSettings.videoAspectRatioOverride.reason)}</span>
        </div>
      </div>
      <div class="unsupported-setting-item">
        <span class="unsupported-badge">DISABLED</span>
        <div>
          <strong style="color: var(--text-muted);">Custom Generation Seed:</strong>
          <span style="font-size: 10px;"> ${escapeHtml(state.unsupportedSettings.customSeed.reason)}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- 7. Jev Quality Pre-Check Simulation Card -->
  <div class="card" style="background: rgba(157, 92, 255, 0.08); border-color: rgba(157, 92, 255, 0.3);">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
      <div class="card-title" style="margin-bottom: 0; color: #d8b4fe;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <span>Jev 1.13 Quality Pre-Check</span>
        <span style="font-size: 9px; font-family: var(--font-mono); color: var(--text-muted);">(Display-only label)</span>
      </div>
      <button type="button" class="btn btn-sm btn-outline-purple" id="btnEvalJev">Run Evaluation</button>
    </div>
    <div id="jevEvalResult" style="font-size: 11px; color: var(--text-muted); line-height: 1.4;">
      ${jevContent}
    </div>
    <div style="font-size: 9.5px; color: var(--text-subtle); margin-top: 4px;">
      ⚠️ ${escapeHtml(state.jevNotice)}
    </div>
  </div>

  <!-- 8. Action Buttons -->
  <div style="display: flex; gap: 8px; margin-top: 8px;">
    <button type="button" class="btn btn-secondary" id="btnImportTxt" style="flex: 1;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
      <span>Import .txt</span>
    </button>
    <button type="button" class="btn btn-primary" id="btnEnqueuePrompts" style="flex: 2;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
      <span>Add to Queue (<span id="btnEnqueueCount">${promptCount}</span> jobs)</span>
    </button>
  </div>
</section>
`.trim();
}
