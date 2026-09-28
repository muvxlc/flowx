export function getQueueViewStyles(): string {
  return `
    :root {
      --bg-canvas: #0c0e12;
      --bg-surface: #151821;
      --bg-surface-elevated: #161b26;
      --bg-surface-active: #242938;
      --bg-input: #11141c;
      --border-subtle: #2d3748;
      --border-strong: #363d52;
      --border-focus: #4f68ff;
      --text-main: #f0f3f8;
      --text-muted: #8b95a5;
      --text-subtle: #576071;
      --text-accent: #60a5fa;
      --accent-primary: #3b66ff;
      --accent-hover: #4e75ff;
      --accent-subtle: rgba(59, 102, 255, 0.15);
      --jev-purple: #9d5cff;
      --status-success: #6ee7b7;
      --status-warning: #fcd34d;
      --status-danger: #fca5a5;
      --radius-sm: 2px;
      --radius-md: 4px;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
    }
    .tab-body {
      width: 420px;
      max-width: 100%;
      box-sizing: border-box;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: var(--bg-surface);
      color: var(--text-main);
      font-family: var(--font-sans);
    }
    .mock-watermark {
      font-size: 9.5px;
      font-family: var(--font-mono);
      color: var(--text-subtle);
      text-align: right;
      letter-spacing: 0.05em;
    }
    .toolbar-strip {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      background: var(--bg-input);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 6px;
    }
    .toolbar-group { display: flex; gap: 4px; align-items: center; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 500;
      border-radius: var(--radius-sm);
      cursor: pointer;
      border: 1px solid transparent;
      transition: background 0.15s ease;
    }
    .btn:focus-visible, .icon-btn:focus-visible {
      outline: 2px solid var(--border-focus);
      outline-offset: 2px;
    }
    .btn-primary { background: var(--accent-primary); color: #fff; }
    .btn-secondary { background: var(--bg-surface-elevated); color: var(--text-main); border-color: var(--border-subtle); }
    .btn-danger { background: rgba(239, 68, 68, 0.2); color: var(--status-danger); border-color: rgba(239, 68, 68, 0.4); }
    .icon-btn {
      width: 22px;
      height: 22px;
      padding: 0;
      background: var(--bg-surface-elevated);
      color: var(--text-muted);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 10px;
    }
    .icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .card {
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 8px 10px;
    }
    .progress-card-header {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin-bottom: 4px;
    }
    .progress-percentage { font-family: var(--font-mono); color: var(--text-accent); }
    .progress-bar-wrap {
      height: 6px;
      background: var(--bg-input);
      border-radius: 3px;
      overflow: hidden;
      border: 1px solid var(--border-subtle);
    }
    .progress-bar-fill { height: 100%; background: var(--accent-primary); transition: width 0.3s ease; }
    .queue-list { display: flex; flex-direction: column; gap: 8px; }
    .queue-item {
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .queue-item.running { border-color: var(--accent-primary); box-shadow: 0 0 8px rgba(59, 102, 255, 0.2); }
    .queue-item.failed { border-color: var(--status-danger); }
    .queue-item.needs-review { border-color: var(--status-warning); }
    .queue-item-header { display: flex; justify-content: space-between; align-items: center; }
    .item-identity { display: flex; align-items: center; gap: 6px; }
    .job-id { font-family: var(--font-mono); font-size: 10.5px; color: var(--text-muted); }
    .mode-tag { font-family: var(--font-mono); font-size: 9.5px; color: var(--text-subtle); }
    .item-controls { display: flex; align-items: center; gap: 6px; }
    .status-badge {
      font-family: var(--font-mono);
      font-size: 9px;
      padding: 2px 4px;
      border-radius: var(--radius-sm);
      text-transform: uppercase;
    }
    .status-badge.pending { background: var(--bg-surface-active); color: var(--text-muted); }
    .status-badge.running { background: var(--accent-subtle); color: #93c5fd; }
    .status-badge.completed { background: rgba(16, 185, 129, 0.15); color: var(--status-success); }
    .status-badge.failed { background: rgba(239, 68, 68, 0.15); color: var(--status-danger); }
    .status-badge.paused { background: #374151; color: #d1d5db; }
    .queue-actions { display: flex; gap: 2px; }
    .queue-prompt-text {
      font-size: 11.5px;
      color: var(--text-main);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      line-height: 1.4;
    }
    .queue-meta-row { display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: var(--text-muted); }
    .jev-score-pill {
      font-family: var(--font-mono);
      font-size: 9.5px;
      padding: 1px 4px;
      border-radius: var(--radius-sm);
      background: var(--bg-input);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
    }
    .jev-score-pill.mock-reviewed {
      color: var(--text-accent);
      background: rgba(59, 102, 255, 0.1);
      border-color: rgba(59, 102, 255, 0.3);
    }
    .jev-score-pill.needs-review {
      color: var(--status-warning);
      background: rgba(245, 158, 11, 0.12);
      border-color: rgba(245, 158, 11, 0.3);
    }
    .jev-score-pill.not-evaluated {
      color: var(--text-subtle);
      background: var(--bg-surface-active);
      border-color: var(--border-subtle);
    }
    .empty-state { text-align: center; padding: 24px 12px; color: var(--text-muted); font-size: 11.5px; }
    .status-alert { padding: 6px 8px; border-radius: var(--radius-sm); font-size: 11px; }
    .alert-danger { background: rgba(239, 68, 68, 0.2); color: var(--status-danger); border: 1px solid rgba(239, 68, 68, 0.3); }
    .alert-info { background: var(--bg-surface-active); color: var(--text-main); border: 1px solid var(--border-subtle); }
    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .inspect-dialog {
      background: var(--bg-surface-elevated); border: 1px solid var(--border-strong); border-radius: var(--radius-md); padding: 12px; width: 380px; max-width: 90%;
    }
    .dialog-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .dialog-body { display: flex; flex-direction: column; gap: 6px; font-size: 11px; max-height: 300px; overflow-y: auto; }
    .detail-row { display: flex; gap: 6px; }
    .detail-label { color: var(--text-muted); min-width: 60px; }
    .dialog-footer { margin-top: 10px; display: flex; justify-content: flex-end; }
    @media (max-width: 360px) {
      .tab-body { width: 100%; padding: 6px; }
      .toolbar-strip { flex-direction: column; }
      .queue-item-header { flex-direction: column; align-items: flex-start; gap: 4px; }
    }
    @media (prefers-reduced-motion: reduce) {
      * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
    }
  `;
}
