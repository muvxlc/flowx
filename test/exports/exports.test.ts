import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Job, JobResult } from '../../src/queue/types.ts';
import {
  generateSafeFilename,
  FilenameRegistry,
  generateCsvExport,
  DownloadManager,
  MemoryDownloadsAdapter,
  filterCompletedJobs,
  type DownloadItem,
  type CsvExportOptions,
} from '../../src/exports/index.ts';
import { renderDownloadsView } from '../../src/ui/downloads/index.ts';

function createMockCompletedJob(
  id: string,
  media: 'image' | 'video',
  url: string,
  prompt: string = 'test prompt'
): Job {
  const result: JobResult = {
    idempotencyKey: `idem_${id}`,
    mediaUrl: url,
    mediaType: media,
    mimeType: media === 'image' ? 'image/png' : 'video/mp4',
    completedAt: 1727500000000,
    width: 1024,
    height: 1024,
  };

  return {
    id,
    media,
    mode: 'text-only',
    prompt,
    provider: 'meta',
    settings: { aspectRatio: '1:1' },
    state: 'completed',
    retryCount: 0,
    maxRetries: 3,
    createdAt: 1727499000000,
    updatedAt: 1727500000000,
    completedAt: 1727500000000,
    result,
    idempotencyKey: `idem_${id}`,
  };
}

test('generateSafeFilename: sanitizes dangerous characters, path traversals and enforces extension', () => {
  // Given: filenames with path traversal, illegal characters, and missing extensions
  const maliciousName = '../../etc/passwd:<>|?*test';
  
  // When: sanitized filename is generated
  const safeName = generateSafeFilename({
    jobId: 'job_123',
    suggestedName: maliciousName,
    mediaType: 'image',
    mimeType: 'image/png',
  });

  // Then: path traversals and illegal characters are stripped
  assert.ok(!safeName.includes('..'), 'Must not contain parent directory traversal');
  assert.ok(!safeName.includes('/'), 'Must not contain slashes');
  assert.ok(!safeName.includes('\\'), 'Must not contain backslashes');
  assert.ok(!/[<>:"|?*]/.test(safeName), 'Must not contain illegal characters');
  assert.ok(safeName.endsWith('.png'), 'Must append correct extension');
});

test('FilenameRegistry: resolves collisions with unique sequential naming', () => {
  // Given: registry and multiple requests for identical filename
  const registry = new FilenameRegistry();
  const baseParams = {
    jobId: 'job_abc',
    suggestedName: 'meta_output',
    mediaType: 'image' as const,
    mimeType: 'image/png',
  };

  // When: generating three filenames with identical input
  const name1 = registry.getUniqueFilename(baseParams);
  const name2 = registry.getUniqueFilename(baseParams);
  const name3 = registry.getUniqueFilename(baseParams);

  // Then: names are unique and collision-free
  assert.equal(name1, 'meta_output.png');
  assert.equal(name2, 'meta_output_1.png');
  assert.equal(name3, 'meta_output_2.png');
});

test('filterCompletedJobs: excludes incomplete, failed, paused, and draft jobs', () => {
  // Given: list of mixed jobs
  const completedJob = createMockCompletedJob('job_done', 'image', 'https://scontent.xx.fbcdn.net/res1.png');
  const draftJob: Job = { ...completedJob, id: 'job_draft', state: 'draft', result: null };
  const runningJob: Job = { ...completedJob, id: 'job_running', state: 'running', result: null };
  const failedJob: Job = { ...completedJob, id: 'job_failed', state: 'failed', result: null };
  const pausedJob: Job = { ...completedJob, id: 'job_paused', state: 'paused', result: null };
  const completedWithoutResult: Job = { ...completedJob, id: 'job_no_res', state: 'completed', result: null };

  const jobs = [completedJob, draftJob, runningJob, failedJob, pausedJob, completedWithoutResult];

  // When: filtering completed jobs
  const verified = filterCompletedJobs(jobs);

  // Then: only properly completed jobs with results are included
  assert.equal(verified.length, 1);
  assert.equal(verified[0]?.id, 'job_done');
});

test('generateCsvExport: escapes UTF-8, omits prompt and API key by default, excludes incomplete jobs', () => {
  // Given: completed job with special characters in fields and sensitive prompt
  const job1 = createMockCompletedJob(
    'job_thai_001',
    'image',
    'https://scontent.xx.fbcdn.net/img1.png',
    'Generate "cyberpunk" cat in กรุงเทพมหานคร, secret_key=sk-1234567890'
  );
  job1.settings = { customParameters: { note: 'Contains, commas, "quotes", and\nnewlines' } };

  const runningJob: Job = { ...job1, id: 'job_running', state: 'running', result: null };

  // When: generating default CSV
  const csv = generateCsvExport([job1, runningJob]);

  // Then: includes UTF-8 BOM, excludes incomplete job, excludes prompt content and secrets
  assert.ok(csv.startsWith('\uFEFF'), 'CSV must include UTF-8 BOM for spreadsheet encoding compatibility');
  assert.ok(csv.includes('job_thai_001'), 'Must include completed job id');
  assert.ok(!csv.includes('job_running'), 'Must exclude incomplete running job');
  assert.ok(!csv.includes('secret_key=sk-1234567890'), 'Default CSV must omit prompt content to protect user secrets');
  assert.ok(!csv.includes('sk-'), 'Must not contain secret prefix');
  
  // Verify CSV headers
  const lines = csv.trim().split('\n');
  assert.ok(lines.length >= 2, 'CSV must have header and at least one data line');
  assert.ok(lines[0]?.includes('job_id'));
  assert.ok(lines[0]?.includes('media_type'));
  assert.ok(lines[0]?.includes('status'));
  assert.ok(lines[0]?.includes('media_url'));
  assert.ok(!lines[0]?.includes('prompt'), 'Header must not contain prompt by default');
});

test('generateCsvExport: escapes quotes, commas, and newlines when includePrompt is explicitly allowed', () => {
  // Given: job with quotes, commas, and newlines in prompt
  const job = createMockCompletedJob(
    'job_esc',
    'image',
    'https://scontent.xx.fbcdn.net/img.png',
    'A "quoted" prompt, with comma and\nnewline'
  );

  // When: generating CSV with explicit includePrompt: true
  const options: CsvExportOptions = { includePrompt: true };
  const csv = generateCsvExport([job], options);

  // Then: prompt column is present and properly escaped with double quotes
  assert.ok(csv.includes('"A ""quoted"" prompt, with comma and\nnewline"'));
});

test('DownloadManager: selective downloads filter by mediaTarget and job IDs', async () => {
  // Given: completed image and video jobs
  const imageJob = createMockCompletedJob('job_img', 'image', 'https://scontent.xx.fbcdn.net/img.png');
  const videoJob = createMockCompletedJob('job_vid', 'video', 'https://scontent.xx.fbcdn.net/vid.mp4');
  const adapter = new MemoryDownloadsAdapter();
  const manager = new DownloadManager({ adapter });

  // When: selective download for only images
  const imageResults = await manager.downloadJobs([imageJob, videoJob], { filter: { mediaType: 'image' } });

  // Then: only image is downloaded
  assert.equal(imageResults.length, 1);
  assert.equal(imageResults[0]?.jobId, 'job_img');
  assert.equal(imageResults[0]?.status, 'success');
  assert.equal(adapter.downloads.length, 1);
  assert.equal(adapter.downloads[0]?.url, 'https://scontent.xx.fbcdn.net/img.png');

  // When: selective download by specific job ID
  const videoResults = await manager.downloadJobs([imageJob, videoJob], { filter: { jobIds: ['job_vid'] } });

  // Then: only video is downloaded
  assert.equal(videoResults.length, 1);
  assert.equal(videoResults[0]?.jobId, 'job_vid');
  assert.equal(videoResults[0]?.status, 'success');
  assert.equal(adapter.downloads.length, 2);
});

test('DownloadManager: blocks non-whitelisted and unrelated asset URLs', async () => {
  // Given: job with malicious or unrelated URL scheme
  const badJob1 = createMockCompletedJob('job_xss', 'image', 'javascript:alert(1)');
  const badJob2 = createMockCompletedJob('job_file', 'image', 'file:///etc/passwd');
  const adapter = new MemoryDownloadsAdapter();
  const manager = new DownloadManager({ adapter });

  // When: attempting to download
  const results = await manager.downloadJobs([badJob1, badJob2]);

  // Then: both are rejected as invalid URLs
  assert.equal(results.length, 2);
  assert.equal(results[0]?.status, 'error');
  assert.ok(results[0]?.error?.includes('disallowed URL scheme'));
  assert.equal(results[1]?.status, 'error');
  assert.ok(results[1]?.error?.includes('disallowed URL scheme'));
  assert.equal(adapter.downloads.length, 0, 'No downloads should be initiated for disallowed schemes');
});

test('Happy path: two verified results downloaded with safe names and exported to CSV', async () => {
  // Given: two verified completed jobs (1 image, 1 video)
  const job1 = createMockCompletedJob('job_1', 'image', 'https://scontent.xx.fbcdn.net/res_1.png');
  const job2 = createMockCompletedJob('job_2', 'video', 'https://scontent.xx.fbcdn.net/res_2.mp4');
  const adapter = new MemoryDownloadsAdapter();
  const manager = new DownloadManager({ adapter });

  // When: downloading both
  const results = await manager.downloadJobs([job1, job2]);

  // Then: both succeeded
  assert.equal(results.length, 2);
  assert.equal(results[0]?.status, 'success');
  assert.equal(results[1]?.status, 'success');
  assert.equal(adapter.downloads.length, 2);
  assert.ok(adapter.downloads[0]?.filename.endsWith('.png'));
  assert.ok(adapter.downloads[1]?.filename.endsWith('.mp4'));

  // When: exporting CSV
  const csv = generateCsvExport([job1, job2]);
  const lines = csv.trim().split('\n');

  // Then: CSV contains 2 records
  assert.equal(lines.length, 3); // Header + 2 data rows
  assert.ok(csv.includes('job_1'));
  assert.ok(csv.includes('job_2'));
});

test('Failure path: revoked URL or download interruption records error without marking job completed twice', async () => {
  // Given: job with revoked/broken URL that adapter fails on
  const job = createMockCompletedJob('job_revoked', 'image', 'https://scontent.xx.fbcdn.net/revoked.png');
  const adapter = new MemoryDownloadsAdapter({
    failUrls: new Set(['https://scontent.xx.fbcdn.net/revoked.png']),
  });
  const manager = new DownloadManager({ adapter });

  // When: downloading revoked job
  const results = await manager.downloadJobs([job]);

  // Then: failure recorded gracefully
  assert.equal(results.length, 1);
  assert.equal(results[0]?.status, 'error');
  assert.ok(results[0]?.error?.includes('Download interrupted or revoked URL'));
  
  // Verify job itself is not mutated or completed twice
  assert.equal(job.state, 'completed');
  assert.equal(job.completedAt, 1727500000000);
});

test('UI Downloads view: renders cards, filter counters, and accessible elements', () => {
  // Given: downloads items representing completed media
  const items: DownloadItem[] = [
    {
      id: 'dl_1',
      jobId: 'job_1',
      mediaType: 'image',
      filename: 'meta_cat.png',
      url: 'https://scontent.xx.fbcdn.net/cat.png',
      resolution: '1024x1024',
      completedAt: 1727500000000,
      downloadStatus: 'idle',
    },
    {
      id: 'dl_2',
      jobId: 'job_2',
      mediaType: 'video',
      filename: 'meta_loop.mp4',
      url: 'https://scontent.xx.fbcdn.net/loop.mp4',
      resolution: '1080p',
      completedAt: 1727500100000,
      downloadStatus: 'completed',
    },
  ];

  // When: rendering view for all items
  const htmlAll = renderDownloadsView({ items, activeFilter: 'all' });

  // Then: contains grid, counters, card details
  assert.ok(htmlAll.includes('meta_cat.png'));
  assert.ok(htmlAll.includes('meta_loop.mp4'));
  assert.ok(htmlAll.includes('1024x1024'));
  assert.ok(htmlAll.includes('1080p'));
  assert.ok(htmlAll.includes('All (2)'));

  // When: rendering with filter for video only
  const htmlVideo = renderDownloadsView({ items, activeFilter: 'video' });
  assert.ok(!htmlVideo.includes('meta_cat.png'));
  assert.ok(htmlVideo.includes('meta_loop.mp4'));

  // When: rendering empty list
  const htmlEmpty = renderDownloadsView({ items: [], activeFilter: 'all' });
  assert.ok(htmlEmpty.includes('No downloads yet'));
});
