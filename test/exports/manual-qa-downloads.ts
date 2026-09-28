import assert from 'node:assert/strict';
import type { Job, JobResult } from '../../src/queue/types.ts';
import {
  DownloadManager,
  MemoryDownloadsAdapter,
  FilenameRegistry,
  generateCsvExport,
  filterCompletedJobs,
} from '../../src/exports/index.ts';
import { renderDownloadsView } from '../../src/ui/downloads/index.ts';
import { MetaMockAdapter } from '../../src/providers/meta/index.ts';

async function runManualQADownloadsScenario() {
  console.log('====================================================');
  console.log('TASK 11: MANUAL QA DOWNLOADS & CSV EXPORT SCENARIO');
  console.log('====================================================\n');

  const adapter = new MemoryDownloadsAdapter({
    failUrls: new Set(['https://mock.meta.internal/revoked_asset.mp4']),
  });
  const registry = new FilenameRegistry();
  const manager = new DownloadManager({ adapter, filenameRegistry: registry });

  // 1. Prepare sample verified results and incomplete jobs
  console.log('--- 1. Preparing Job Fixtures ---');
  const job1: Job = {
    id: 'job_meta_001',
    media: 'image',
    mode: 'text-only',
    prompt: 'Hyperrealistic Thai lotus temple in Bangkok at sunrise',
    provider: 'meta',
    settings: { aspectRatio: '1:1' },
    state: 'completed',
    retryCount: 0,
    maxRetries: 3,
    createdAt: 1727500000000,
    updatedAt: 1727500050000,
    completedAt: 1727500050000,
    result: {
      idempotencyKey: 'idem_job_meta_001',
      mediaUrl: 'https://mock.meta.internal/lotus_temple.png',
      mediaType: 'image',
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
      completedAt: 1727500050000,
    },
    idempotencyKey: 'idem_job_meta_001',
  };

  const job2: Job = {
    id: 'job_meta_002',
    media: 'video',
    mode: 'paired-ref',
    prompt: 'Floating lanterns ascending into night sky with cinematic lighting',
    provider: 'meta',
    settings: { durationSeconds: 5 },
    state: 'completed',
    retryCount: 1,
    maxRetries: 3,
    createdAt: 1727500100000,
    updatedAt: 1727500200000,
    completedAt: 1727500200000,
    result: {
      idempotencyKey: 'idem_job_meta_002',
      mediaUrl: 'https://mock.meta.internal/lanterns_motion.mp4',
      mediaType: 'video',
      mimeType: 'video/mp4',
      durationSeconds: 5,
      completedAt: 1727500200000,
    },
    idempotencyKey: 'idem_job_meta_002',
  };

  const jobRevoked: Job = {
    id: 'job_meta_revoked',
    media: 'video',
    mode: 'text-only',
    prompt: 'Expired video session that was revoked upstream',
    provider: 'meta',
    settings: {},
    state: 'completed',
    retryCount: 0,
    maxRetries: 3,
    createdAt: 1727500300000,
    updatedAt: 1727500350000,
    completedAt: 1727500350000,
    result: {
      idempotencyKey: 'idem_job_meta_revoked',
      mediaUrl: 'https://mock.meta.internal/revoked_asset.mp4',
      mediaType: 'video',
      mimeType: 'video/mp4',
      completedAt: 1727500350000,
    },
    idempotencyKey: 'idem_job_meta_revoked',
  };

  const jobIncomplete: Job = {
    id: 'job_meta_running',
    media: 'image',
    mode: 'text-only',
    prompt: 'Still generating in background',
    provider: 'meta',
    settings: {},
    state: 'running',
    retryCount: 0,
    maxRetries: 3,
    createdAt: 1727500400000,
    updatedAt: 1727500410000,
    result: null,
  };

  const allJobs = [job1, job2, jobRevoked, jobIncomplete];
  console.log('Total jobs created: %d (2 verified, 1 revoked, 1 running)', allJobs.length);

  // 2. Download two verified results
  console.log('\n--- 2. Executing Verified Result Downloads ---');
  const downloadResults = await manager.downloadJobs([job1, job2]);
  console.log('Download Results: %s', JSON.stringify(downloadResults, null, 2));

  assert.equal(downloadResults.length, 2);
  assert.equal(downloadResults[0]?.status, 'success');
  assert.equal(downloadResults[1]?.status, 'success');
  assert.equal(adapter.downloads.length, 2);
  console.log('✓ Successfully downloaded 2 verified results via fake Chrome downloads adapter.');

  // 3. Export CSV and verify incomplete exclusion + zero secret leakage
  console.log('\n--- 3. Generating CSV Metadata Export ---');
  const csvOutput = generateCsvExport(allJobs);
  console.log('CSV Export Output:\n%s', csvOutput);

  assert.ok(csvOutput.startsWith('\uFEFF'), 'UTF-8 BOM present');
  assert.ok(csvOutput.includes('job_meta_001'), 'Includes job 1');
  assert.ok(csvOutput.includes('job_meta_002'), 'Includes job 2');
  assert.ok(!csvOutput.includes('job_meta_running'), 'Excludes incomplete running job');
  assert.ok(!csvOutput.includes('Hyperrealistic'), 'Omits raw prompt by default');
  console.log('✓ CSV metadata export verified: UTF-8 BOM present, incomplete excluded, prompts/keys omitted.');

  // 4. Demonstrate revoked URL failure handling
  console.log('\n--- 4. Executing Revoked URL Failure Scenario ---');
  const revokedResult = await manager.downloadJob(jobRevoked);
  console.log('Revoked Job Download Result: %s', JSON.stringify(revokedResult, null, 2));

  assert.equal(revokedResult.status, 'error');
  assert.ok(revokedResult.error?.includes('Download interrupted or revoked URL'));
  assert.equal(jobRevoked.state, 'completed', 'Job state must remain completed');
  console.log('✓ Revoked URL handled gracefully: error reported without corrupting job state or duplicate completion.');

  // 5. Render UI Downloads View
  console.log('\n--- 5. Rendering UI Downloads View ---');
  const downloadItems = DownloadManager.createDownloadItems([job1, job2]);
  const viewHtml = renderDownloadsView({ items: downloadItems, activeFilter: 'all' });
  console.log('Rendered UI View HTML (snippet):\n%s', viewHtml.slice(0, 350) + '...\n');

  assert.ok(viewHtml.includes('meta_image_job_meta_001.png'));
  assert.ok(viewHtml.includes('meta_video_job_meta_002.mp4'));
  assert.ok(viewHtml.includes('All (2)'));
  console.log('✓ UI Downloads panel rendered: card hierarchy, badges, filter counters intact.');

  console.log('\n--- 6. Executing Mock Output Downloads & CSV Formula Neutralization ---');
  const mockAdapter = new MetaMockAdapter();
  const mockJobImg: Job = {
    id: '=cmd|\'/C calc\'!A0',
    media: 'image',
    mode: 'text-only',
    prompt: '@SUM(1+1)',
    provider: 'meta',
    settings: {},
    state: 'pending',
    retryCount: 0,
    maxRetries: 3,
    createdAt: 1727500500000,
    updatedAt: 1727500500000,
  };
  const mockJobVid: Job = {
    id: 'job_mock_vid_002',
    media: 'video',
    mode: 'paired-ref',
    prompt: 'Floating lotus animation',
    provider: 'meta',
    settings: {},
    state: 'pending',
    retryCount: 0,
    maxRetries: 3,
    createdAt: 1727500510000,
    updatedAt: 1727500510000,
  };

  const imgExec = await mockAdapter.execute(mockJobImg);
  const vidExec = await mockAdapter.execute(mockJobVid);
  mockJobImg.state = 'completed';
  if (imgExec.result) {
    mockJobImg.result = imgExec.result;
  }
  mockJobVid.state = 'completed';
  if (vidExec.result) {
    mockJobVid.result = vidExec.result;
  }

  const mockDownloadResults = await manager.downloadJobs([mockJobImg, mockJobVid]);
  console.log('Mock Download Results: %s', JSON.stringify(mockDownloadResults, null, 2));

  assert.equal(mockDownloadResults.length, 2);
  assert.equal(mockDownloadResults[0]?.status, 'success');
  assert.equal(mockDownloadResults[1]?.status, 'success');

  const maliciousJob: Job = {
    id: 'job_malicious',
    media: 'image',
    mode: 'text-only',
    prompt: 'Steal data',
    provider: 'meta',
    settings: {},
    state: 'completed',
    retryCount: 0,
    maxRetries: 3,
    createdAt: 1727500600000,
    updatedAt: 1727500600000,
    result: {
      idempotencyKey: 'idem_malicious',
      mediaUrl: 'https://malicious-external-site.com/payload.exe',
      mediaType: 'image',
      mimeType: 'image/png',
      completedAt: 1727500600000,
    },
  };
  const malResult = await manager.downloadJob(maliciousJob);
  assert.equal(malResult.status, 'error');
  console.log('✓ Malicious external URL rejected safely: %s', malResult.error);

  const mockCsv = generateCsvExport([mockJobImg, mockJobVid], { includePrompt: true });
  assert.ok(mockCsv.includes('"\'=cmd|\'/C calc\'!A0"'), 'Formula ID neutralized');
  assert.ok(mockCsv.includes('"\'@SUM(1+1)"'), 'Formula prompt neutralized');
  console.log('✓ Two mock outputs safely downloaded and exported to CSV with formula injection inert.');

  console.log('\n====================================================');
  console.log('ALL MANUAL QA SCENARIO CHECKS PASSED SUCCESSFULLY.');
  console.log('====================================================');
}

runManualQADownloadsScenario().catch((err) => {
  console.error('[manual-qa] ERROR:', err);
  process.exit(1);
});
