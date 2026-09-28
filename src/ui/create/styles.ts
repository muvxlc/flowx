/**
 * Create Panel Styles conforming to DESIGN.md (Variant A - Technical Operator Console)
 * Strict 420px side-panel baseline with 320px fluid narrow viewport adaptation.
 */

export function getCreateViewStyles(): string {
  return `
#tabContentCreate {
  display: flex; flex-direction: column; gap: 12px; padding: 14px;
  background: var(--bg-surface, #151821); color: var(--text-main, #f0f3f8);
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  max-width: 420px; box-sizing: border-box;
}
@media (max-width: 380px) {
  #tabContentCreate { padding: 10px; gap: 10px; max-width: 100%; }
  .mode-matrix { grid-template-columns: 1fr !important; }
  .media-toggle { flex-direction: column; }
}
.walkthrough-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 8px 10px; background: rgba(157, 92, 255, 0.1);
  border: 1px dashed rgba(157, 92, 255, 0.4); border-radius: var(--radius-md, 4px);
  color: var(--text-main, #f0f3f8);
}
.mock-watermark {
  font-family: var(--font-mono, monospace); font-size: 9.5px;
  color: var(--jev-purple-text, #c084fc); letter-spacing: 0.5px;
}
.section-title {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 11px; font-weight: 600; color: var(--text-muted, #8b95a5);
  text-transform: uppercase; margin-bottom: 6px;
}
.media-toggle { display: flex; gap: 6px; }
.media-toggle-btn {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 10px; background: var(--bg-input, #11141c);
  border: 1px solid var(--border-subtle, #2d3748); border-radius: var(--radius-md, 4px);
  color: var(--text-muted, #8b95a5); font-size: 11.5px; font-weight: 500;
  cursor: pointer; transition: all 0.15s ease;
}
.media-toggle-btn:hover { background: var(--bg-surface-active, #242938); color: var(--text-main, #f0f3f8); }
.media-toggle-btn.active {
  background: var(--accent-subtle, rgba(59, 102, 255, 0.15));
  border-color: var(--accent-primary, #3b66ff); color: #fff; font-weight: 600;
}
.media-toggle-btn:focus-visible, .mode-pill:focus-visible, .btn:focus-visible, .textarea:focus-visible, .select:focus-visible {
  outline: none; border-color: var(--border-focus, #4f68ff); box-shadow: 0 0 0 2px rgba(79, 104, 255, 0.25);
}
.mode-matrix {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
  background: var(--bg-input, #11141c); padding: 6px;
  border-radius: var(--radius-md, 4px); border: 1px solid var(--border-subtle, #2d3748);
}
.mode-pill {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  background: var(--bg-surface, #151821); border: 1px solid var(--border-subtle, #2d3748);
  border-radius: var(--radius-sm, 2px); padding: 6px 4px; cursor: pointer;
  color: var(--text-muted, #8b95a5); font-size: 10.5px; font-weight: 500; transition: all 0.15s ease;
}
.mode-pill:hover { background: var(--bg-surface-active, #242938); color: var(--text-main, #f0f3f8); }
.mode-pill.active {
  background: var(--accent-subtle, rgba(59, 102, 255, 0.15));
  border-color: var(--accent-primary, #3b66ff); color: #fff;
}
.mode-tag { font-size: 9px; font-family: var(--font-mono, monospace); opacity: 0.8; }
.card {
  background: var(--bg-surface-elevated, #161b26); border: 1px solid var(--border-subtle, #2d3748);
  border-radius: var(--radius-md, 4px); padding: 10px;
}
.card-title {
  display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; margin-bottom: 6px;
}
.label {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 11px; font-weight: 500; color: var(--text-muted, #8b95a5); margin-bottom: 4px;
}
.helper { font-size: 10px; color: var(--text-subtle, #576071); }
.textarea {
  width: 100%; box-sizing: border-box; background: var(--bg-input, #11141c);
  border: 1px solid var(--border-subtle, #2d3748); border-radius: var(--radius-md, 4px);
  color: var(--text-main, #f0f3f8); font-family: var(--font-mono, monospace); font-size: 11.5px;
  line-height: 1.5; padding: 8px 10px; min-height: 80px; resize: vertical;
}
.select {
  background: var(--bg-input, #11141c); border: 1px solid var(--border-subtle, #2d3748);
  border-radius: var(--radius-md, 4px); color: var(--text-main, #f0f3f8); font-size: 11.5px; padding: 6px 8px;
}
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 7px 12px; border-radius: var(--radius-md, 4px); font-size: 12px;
  font-weight: 500; cursor: pointer; transition: all 0.15s ease; border: 1px solid transparent;
}
.btn-primary { background: var(--accent-primary, #3b66ff); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover, #4e75ff); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary {
  background: var(--bg-surface-elevated, #161b26); color: var(--text-main, #f0f3f8);
  border-color: var(--border-subtle, #2d3748);
}
.btn-secondary:hover:not(:disabled) {
  background: var(--bg-surface-active, #242938); border-color: var(--border-strong, #363d52);
}
.btn-sm { padding: 4px 8px; font-size: 10.5px; border-radius: var(--radius-sm, 2px); }
.btn-outline-purple {
  background: var(--jev-purple-subtle, rgba(157, 92, 255, 0.15));
  color: var(--jev-purple-text, #c084fc); border: 1px solid rgba(157, 92, 255, 0.4);
}
.btn-outline-purple:hover { background: rgba(157, 92, 255, 0.25); }
.unsupported-settings-card { border-color: #3b4252; background: #11141c; opacity: 0.85; }
.unsupported-setting-item {
  display: flex; align-items: flex-start; gap: 8px; padding: 4px 0;
  font-size: 11px; color: var(--text-subtle, #576071);
}
.unsupported-badge {
  font-family: var(--font-mono, monospace); font-size: 9px; padding: 1px 4px;
  border-radius: 2px; background: #242938; color: #94a3b8; border: 1px dashed #4b5563; white-space: nowrap;
}
.create-alert { padding: 8px 10px; border-radius: var(--radius-md, 4px); font-size: 11.5px; line-height: 1.4; }
.create-alert.error { background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; }
.create-alert.info { background: rgba(59, 102, 255, 0.15); border: 1px solid rgba(59, 102, 255, 0.35); color: #93c5fd; }
`.trim();
}
