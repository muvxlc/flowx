import type { DownloadsViewOptions } from './types.ts';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderDownloadsView(options: DownloadsViewOptions): string {
  const filter = options.activeFilter ?? 'all';
  const allCount = options.items.length;
  const filteredItems = options.items.filter((item) => {
    if (filter === 'all') return true;
    return item.mediaType === filter;
  });

  const cardsHtml =
    filteredItems.length === 0
      ? `<div class="empty-state" role="status"><p>No downloads yet</p></div>`
      : filteredItems
          .map((item) => {
            const safeFilename = escapeHtml(item.filename);
            const safeRes = escapeHtml(item.resolution ?? 'Unknown');
            const safeType = escapeHtml(item.mediaType);
            const safeJobId = escapeHtml(item.jobId);
            const safeId = escapeHtml(item.id);

            return `
      <article class="download-card" data-id="${safeId}" data-job-id="${safeJobId}">
        <div class="download-thumb" aria-hidden="true">
          <span class="media-icon">${safeType === 'video' ? '🎬' : '🖼️'}</span>
        </div>
        <span class="download-badge">${safeRes}</span>
        <div class="download-info">
          <div class="download-filename" title="${safeFilename}">${safeFilename}</div>
          <div class="download-meta">
            <span class="meta-item">${safeType}</span>
            <span class="meta-item status-${escapeHtml(item.downloadStatus)}">${escapeHtml(item.downloadStatus)}</span>
          </div>
          <button type="button" class="btn btn-sm btn-secondary btn-action-download" data-id="${safeId}">
            Download
          </button>
        </div>
      </article>`.trim();
          })
          .join('\n');

  return `
<section class="tab-body" id="tabContentDownloads" aria-label="Downloads Manager">
  <div class="filter-bar">
    <div class="btn-group" role="tablist" aria-label="Media Type Filters">
      <button class="btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}" role="tab" aria-selected="${filter === 'all'}" id="btnFilterAllMedia">All (${allCount})</button>
      <button class="btn btn-sm ${filter === 'image' ? 'btn-primary' : 'btn-secondary'}" role="tab" aria-selected="${filter === 'image'}" id="btnFilterImages">Images</button>
      <button class="btn btn-sm ${filter === 'video' ? 'btn-primary' : 'btn-secondary'}" role="tab" aria-selected="${filter === 'video'}" id="btnFilterVideos">Videos</button>
    </div>
    <div class="actions">
      <button type="button" class="btn btn-sm btn-primary" id="btnDownloadAll">
        <span>Download All</span>
      </button>
      <button type="button" class="btn btn-sm btn-secondary" id="btnExportCsv">
        <span>Export CSV</span>
      </button>
    </div>
  </div>
  <div class="downloads-grid" id="downloadsGridContainer" role="feed" aria-busy="false">
    ${cardsHtml}
  </div>
</section>
`.trim();
}
