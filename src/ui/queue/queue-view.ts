import type { Job } from '../../queue/types.ts';
import type { QueueViewOptions } from './types.ts';

export function escapeHtml(text: unknown): string {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface JevGateMeta {
  readonly status?: string;
  readonly mode?: string;
  readonly decision?: {
    readonly decisionType?: 'score' | 'choice' | 'noul';
    readonly questionId?: string;
    readonly value?: unknown;
    readonly confidence?: number;
    readonly rationale?: string;
    readonly label?: string;
  };
  readonly fallbackType?: string;
  readonly reason?: string;
  readonly evaluatedAt?: number;
  readonly modelId?: string;
}

export interface JevPillData {
  readonly text: string;
  readonly title: string;
  readonly ariaLabel: string;
  readonly badgeClass: string;
  readonly reason?: string | undefined;
}

export function getJevPillData(job: Job): JevPillData {
  const jevMeta = job.settings?.customParameters?.jevGate as JevGateMeta | undefined;
  const isNeedsReview =
    job.state === 'needs-review' ||
    jevMeta?.status === 'needs-review' ||
    Boolean(jevMeta?.fallbackType && jevMeta.fallbackType !== 'disabled_deterministic');

  if (isNeedsReview) {
    const rawReason = jevMeta?.reason ?? (job.state === 'needs-review' ? job.error : undefined);
    const reason = rawReason ? String(rawReason) : undefined;
    return {
      text: '⚠️ Jev: needs review (G1 blocked)',
      title: reason
        ? `Jev Gate: needs review — ${reason} (G1 contract gate BLOCKED: simulated only)`
        : 'Jev Gate: needs review (G1 contract gate BLOCKED: simulated only)',
      ariaLabel: 'Jev status: needs review (G1 blocked)',
      badgeClass: 'jev-score-pill needs-review',
      reason,
    };
  }

  if (jevMeta?.status === 'reviewed') {
    const decision = jevMeta.decision;
    let detail = '';
    if (decision) {
      if (decision.decisionType === 'score' && typeof decision.value === 'number') {
        const scorePct = Math.round(decision.value * 100);
        detail = ` (${scorePct}/100)`;
      } else if (decision.decisionType === 'choice' && decision.value !== undefined) {
        detail = ` (${String(decision.value)})`;
      } else if (decision.decisionType === 'noul') {
        detail = decision.value ? ' (flagged)' : ' (pass)';
      }
    } else if (jevMeta.mode === 'deterministic_fallback') {
      detail = ' (fallback)';
    }

    return {
      text: `⚡ Jev: mock reviewed [SIMULATED]${detail} (G1 blocked)`,
      title: 'Jev Gate: mock reviewed [SIMULATED] (G1 contract gate BLOCKED: no live calls)',
      ariaLabel: `Jev status: mock reviewed [SIMULATED]${detail} (G1 blocked)`,
      badgeClass: 'jev-score-pill mock-reviewed',
    };
  }

  return {
    text: '⚡ Jev: not evaluated (G1 blocked)',
    title: 'Jev Gate: not evaluated (G1 contract gate BLOCKED: live Jev prohibited)',
    ariaLabel: 'Jev status: not evaluated (G1 blocked)',
    badgeClass: 'jev-score-pill not-evaluated',
  };
}

export function renderQueueView(options: QueueViewOptions): string {
  const jobs = options.jobs;
  const total = jobs.length;
  const completed = jobs.filter((j) => j.state === 'completed').length;
  const pct = options.progressPercentage ?? (total === 0 ? 0 : Math.round((completed / total) * 100));
  const isRunning = Boolean(options.queueRunning);
  const activeId = options.activeJobId ?? null;

  // 1. Loading state
  if (options.isLoading) {
    return `
<section class="tab-body" id="tabContentQueue" aria-label="Generation Queue" aria-busy="true">
  <div class="mock-watermark" aria-hidden="true">[PROTOTYPE • SIMULATED] Sample Data</div>
  <div class="queue-list" id="queueListContainer" role="status">
    <div class="queue-item-skeleton"><div class="skeleton-shimmer"></div></div>
    <div class="queue-item-skeleton"><div class="skeleton-shimmer"></div></div>
  </div>
</section>`.trim();
  }

  // 2. Error banner or status alert
  const alertText = options.errorMessage ?? options.statusAlert;
  const alertHtml = alertText
    ? `<div id="queueStatusAlert" class="status-alert ${options.errorMessage ? 'alert-danger' : 'alert-info'}" role="${options.errorMessage ? 'alert' : 'status'}">${escapeHtml(alertText)}</div>`
    : `<div id="queueStatusAlert" style="display: none;"></div>`;

  // 3. Inspect dialog modal
  const inspectingJob = options.inspectingJobId
    ? jobs.find((j) => j.id === options.inspectingJobId) ?? null
    : null;
  const inspectingJev = inspectingJob ? getJevPillData(inspectingJob) : null;

  const inspectModalHtml = inspectingJob
    ? `
<div class="modal-overlay" role="presentation">
  <div class="inspect-dialog" role="dialog" aria-modal="true" aria-labelledby="inspectDialogTitle" data-restore-focus="btn-inspect-${escapeHtml(inspectingJob.id)}">
    <div class="dialog-header">
      <h3 id="inspectDialogTitle">Job Details: ${escapeHtml(inspectingJob.id)}</h3>
      <button type="button" class="icon-btn" data-action="close-inspect" aria-label="Close details">✕</button>
    </div>
    <div class="dialog-body">
      <div class="detail-row"><span class="detail-label">Status:</span><span class="status-badge ${escapeHtml(inspectingJob.state)}">${escapeHtml(inspectingJob.state)}</span></div>
      <div class="detail-row"><span class="detail-label">Jev Gate:</span><span class="${escapeHtml(inspectingJev?.badgeClass)}">${escapeHtml(inspectingJev?.text)}</span></div>
      ${inspectingJev?.reason ? `<div class="detail-row error-row"><span class="detail-label">Jev Reason:</span><span class="detail-error">${escapeHtml(inspectingJev.reason)}</span></div>` : ''}
      <div class="detail-row"><span class="detail-label">Media:</span><span>${escapeHtml(inspectingJob.media)} (${escapeHtml(inspectingJob.mode)})</span></div>
      <div class="detail-row"><span class="detail-label">Prompt:</span><p class="detail-prompt">${escapeHtml(inspectingJob.prompt)}</p></div>
      <div class="detail-row"><span class="detail-label">Provider:</span><span>${escapeHtml(inspectingJob.provider)}</span></div>
      <div class="detail-row"><span class="detail-label">Retries:</span><span>${inspectingJob.retryCount} / ${inspectingJob.maxRetries}</span></div>
      ${inspectingJob.error ? `<div class="detail-row error-row"><span class="detail-label">Error:</span><span class="detail-error">${escapeHtml(inspectingJob.error)}</span></div>` : ''}
      ${inspectingJob.result?.mediaUrl ? `<div class="detail-row"><span class="detail-label">Output:</span><code class="detail-url">${escapeHtml(inspectingJob.result.mediaUrl)}</code></div>` : ''}
    </div>
    <div class="dialog-footer">
      <button type="button" class="btn btn-sm btn-secondary" data-action="close-inspect">Close</button>
    </div>
  </div>
</div>`.trim()
    : '';

  // 4. Queue items list HTML
  let itemsHtml = '';
  if (total === 0) {
    itemsHtml = `
      <div class="empty-state" role="status">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 8px; opacity: 0.5;">
          <path d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
        <div>No jobs in queue</div>
        <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">Add prompts in the Create tab to start generating</div>
      </div>`;
  } else {
    itemsHtml = jobs
      .map((job, idx) => {
        const isJobRunning = job.state === 'running' || job.id === activeId;
        const safeId = escapeHtml(job.id);
        const safePrompt = escapeHtml(job.prompt);
        const safeState = escapeHtml(job.state);
        const safeMedia = escapeHtml(job.media);
        const safeMode = escapeHtml(job.mode);
        const canEdit = !isJobRunning;
        const canRetry = job.state === 'failed' || job.state === 'needs-review';
        const jevData = getJevPillData(job);

        return `
      <article class="queue-item ${safeState}" id="queueItem_${safeId}" data-id="${safeId}" data-running="${isJobRunning}" role="listitem">
        <div class="queue-item-header">
          <div class="item-identity">
            <span class="job-id">#${idx + 1} ${safeId}</span>
            <span class="mode-tag">${safeMedia === 'video' ? '🎬' : '🖼️'} ${safeMode.toUpperCase()}</span>
          </div>
          <div class="item-controls">
            <span class="status-badge ${safeState}">${safeState}</span>
            <div class="queue-actions" role="group" aria-label="Job actions for ${safeId}">
              <button type="button" class="icon-btn" data-action="move-up" data-id="${safeId}" title="Move Up" aria-label="Move job up" ${idx === 0 || isJobRunning ? 'disabled' : ''}>▲</button>
              <button type="button" class="icon-btn" data-action="move-down" data-id="${safeId}" title="Move Down" aria-label="Move job down" ${idx === total - 1 || isJobRunning ? 'disabled' : ''}>▼</button>
              <button type="button" class="icon-btn" id="btn-inspect-${safeId}" data-action="inspect" data-id="${safeId}" title="Inspect job" aria-label="Inspect job ${safeId}">🔍</button>
              <button type="button" class="icon-btn" data-action="edit" data-id="${safeId}" title="Edit prompt" aria-label="Edit prompt for ${safeId}" ${!canEdit ? 'disabled aria-disabled="true"' : ''}>✎</button>
              <button type="button" class="icon-btn" data-action="duplicate" data-id="${safeId}" title="Duplicate job" aria-label="Duplicate job ${safeId}" ${!canEdit ? 'disabled aria-disabled="true"' : ''}>⧉</button>
              <button type="button" class="icon-btn" data-action="cancel" data-id="${safeId}" title="Cancel job" aria-label="Cancel job ${safeId}" ${job.state === 'completed' ? 'disabled' : ''}>✕</button>
            </div>
          </div>
        </div>
        <div class="queue-prompt-text" title="${safePrompt}">${safePrompt}</div>
        ${
          isJobRunning
            ? `<div class="progress-bar-wrap" aria-label="Job running progress"><div class="progress-bar-fill animated" style="width: 50%;"></div></div>`
            : ''
        }
        <div class="queue-meta-row">
          <span class="${escapeHtml(jevData.badgeClass)}" title="${escapeHtml(jevData.title)}" aria-label="${escapeHtml(jevData.ariaLabel)}" role="status">${escapeHtml(jevData.text)}</span>
          <span class="ref-asset-tag">${job.referenceId ? `Ref: ${escapeHtml(job.referenceId)}` : 'Text only'}</span>
          ${canRetry ? `<button type="button" class="btn btn-sm btn-secondary btn-retry-job" data-action="retry" data-id="${safeId}" aria-label="Retry job ${safeId}">Retry</button>` : ''}
        </div>
      </article>`.trim();
      })
      .join('\n');
  }

  return `
<section class="tab-body" id="tabContentQueue" aria-label="Generation Queue">
  <div class="mock-watermark" aria-hidden="true">[PROTOTYPE • SIMULATED] Sample Data</div>
  
  <!-- Queue Top Controls -->
  <div class="toolbar-strip" role="toolbar" aria-label="Queue Controls">
    <div class="toolbar-group">
      <button type="button" class="btn btn-sm ${isRunning ? 'btn-danger' : 'btn-primary'}" id="btnToggleQueue" data-action="toggle-queue">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          ${isRunning ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>' : '<polygon points="5 3 19 12 5 21 5 3"/>'}
        </svg>
        <span id="lblToggleQueue">${isRunning ? 'Pause Queue' : 'Start Queue'}</span>
      </button>
      <button type="button" class="btn btn-sm btn-secondary" id="btnStepQueue" data-action="step-queue" title="Execute 1 job simulation" aria-label="Step 1 job">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>
        </svg>
        <span>Step 1 Job</span>
      </button>
    </div>
    <div class="toolbar-group">
      <button type="button" class="btn btn-sm btn-danger" id="btnSimulateError" data-action="simulate-error" title="Simulate 429 Challenge Pause" aria-label="Simulate 429 Challenge Pause">
        <span>Simulate 429</span>
      </button>
      <button type="button" class="btn btn-sm btn-secondary" id="btnClearCompleted" data-action="clear-completed" title="Clear Completed Jobs" aria-label="Clear completed jobs">
        <span>Clear Done</span>
      </button>
    </div>
  </div>

  <!-- Overall Progress Bar Card -->
  <div class="card progress-card" role="region" aria-label="Queue Progress Overview">
    <div class="progress-card-header">
      <span id="queueProgressLabel">Queue Progress: ${completed} of ${total} Completed</span>
      <span class="progress-percentage" id="queueProgressPct">${pct}%</span>
    </div>
    <div class="progress-bar-wrap" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-bar-fill" id="queueProgressBar" style="width: ${pct}%;"></div>
    </div>
  </div>

  ${alertHtml}

  <!-- Queue Items List -->
  <div class="queue-list" id="queueListContainer" role="list" aria-label="Queue items">
    ${itemsHtml}
  </div>

  ${inspectModalHtml}
</section>
`.trim();
}

export { getQueueViewStyles } from './styles.ts';

