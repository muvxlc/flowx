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
} from '../../src/exports/index.ts';
import { MetaMockAdapter } from '../../src/providers/meta/index.ts';

function createProbeJob(
  id: string,
  media: 'image' | 'video',
  url: string,
  prompt: string,
  state: Job['state'] = 'completed'
): Job {
  const result: JobResult | null =
    state === 'completed'
      ? {
          idempotencyKey: `idem_${id}`,
          mediaUrl: url,
          mediaType: media,
          mimeType: media === 'image' ? 'image/png' : 'video/mp4',
          completedAt: Date.now(),
        }
      : null;

  return {
    id,
    media,
    mode: 'text-only',
    prompt,
    provider: 'meta',
    settings: {},
    state,
    retryCount: 1,
    maxRetries: 3,
    createdAt: Date.now() - 5000,
    updatedAt: Date.now(),
    completedAt: state === 'completed' ? Date.now() : null,
    result,
    idempotencyKey: `idem_${id}`,
  };
}

test('Probe: path traversal and reserved character attacks in filenames', () => {
  const dangerousNames = [
    '../../../../etc/passwd',
    '..\\..\\windows\\system32\\cmd.exe',
    'con.png',
    'prn.txt',
    '<script>alert(1)</script>',
    'foo\x00bar\x1Fbaz',
    ':::??***|||',
    '   ...///...   ',
  ];

  for (const name of dangerousNames) {
    const safe = generateSafeFilename({
      jobId: 'job_probe',
      suggestedName: name,
      mediaType: 'image',
    });

    assert.ok(!safe.includes('..'), `Path traversal not stripped in: ${safe}`);
    assert.ok(!safe.includes('/'), `Forward slash not stripped in: ${safe}`);
    assert.ok(!safe.includes('\\'), `Backslash not stripped in: ${safe}`);
    assert.ok(!/[<>:"|?*\x00-\x1F]/.test(safe), `Illegal character found in: ${safe}`);
    assert.ok(safe.endsWith('.png'), `Extension missing in: ${safe}`);
  }
});

test('Probe: high collision volume produces 100 unique filenames', () => {
  const registry = new FilenameRegistry();
  const seen = new Set<string>();

  for (let i = 0; i < 100; i++) {
    const filename = registry.getUniqueFilename({
      jobId: 'job_same',
      suggestedName: 'meta_output',
      mediaType: 'image',
      mimeType: 'image/png',
    });

    assert.ok(!seen.has(filename), `Collision detected on index ${i}: ${filename}`);
    seen.add(filename);
  }

  assert.equal(seen.size, 100);
});

test('Probe: non-whitelisted URL protocols are strictly rejected', async () => {
  const badProtocols = [
    'javascript:alert("hacked")',
    'file:///etc/hosts',
    'ftp://attacker.com/payload.png',
    'chrome-extension://abcdef/secret.key',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
  ];

  const adapter = new MemoryDownloadsAdapter();
  const manager = new DownloadManager({ adapter });

  for (let i = 0; i < badProtocols.length; i++) {
    const job = createProbeJob(`job_bad_${i}`, 'image', badProtocols[i] ?? '', 'prompt');
    const result = await manager.downloadJob(job);

    assert.equal(result.status, 'error');
    assert.ok(result.error?.includes('disallowed URL scheme'));
  }

  assert.equal(adapter.downloads.length, 0, 'No disallowed downloads initiated');
});

test('Probe: incomplete jobs in various non-completed states are completely excluded', () => {
  const states: Array<Job['state']> = ['draft', 'pending', 'running', 'failed', 'paused', 'needs-review'];
  const jobs: Job[] = states.map((st, idx) =>
    createProbeJob(`job_${st}_${idx}`, 'image', 'https://scontent.xx.fbcdn.net/test.png', 'prompt', st)
  );

  const completed = filterCompletedJobs(jobs);
  assert.equal(completed.length, 0, 'No incomplete job should pass filter');

  const csv = generateCsvExport(jobs);
  const rows = csv.trim().split('\n');
  assert.equal(rows.length, 1, 'CSV should only contain header row when all jobs are incomplete');
});

test('Probe: CSV formatting prevents formula injection and protects sensitive metadata', () => {
  const injectionJob = createProbeJob(
    '=cmd|\'/C calc\'!A0',
    'image',
    'https://scontent.xx.fbcdn.net/img.png',
    '@SUM(1+1)'
  );

  const csvDefault = generateCsvExport([injectionJob]);
  assert.ok(!csvDefault.includes('@SUM'), 'Prompt formula must be omitted by default');
  assert.ok(csvDefault.includes('"\'=cmd|\'/C calc\'!A0"'), 'Job ID formula must be inert with quote prefix');

  const csvWithPrompt = generateCsvExport([injectionJob], { includePrompt: true });
  assert.ok(csvWithPrompt.includes('"\'=cmd|\'/C calc\'!A0"'), 'Formula in ID must be neutralized with text prefix');
  assert.ok(csvWithPrompt.includes('"\'@SUM(1+1)"'), 'Formula in prompt must be neutralized with text prefix');
  assert.ok(!csvWithPrompt.includes('"\=cmd'), 'Raw unneutralized =cmd must not appear');
  assert.ok(!csvWithPrompt.includes('"@SUM'), 'Raw unneutralized @SUM must not appear');
});

test('Regression: Downloader rejects plain HTTP and unverified third-party hosts', async () => {
  const adapter = new MemoryDownloadsAdapter();
  const manager = new DownloadManager({ adapter });

  const insecureHttpJob = createProbeJob('job_http', 'image', 'http://www.meta.ai/res.png', 'prompt');
  const arbitraryHostJob = createProbeJob('job_evil', 'image', 'https://malicious-external-site.com/payload.exe', 'prompt');
  const plainHttpEvilJob = createProbeJob('job_plain_evil', 'image', 'http://malicious-external-site.com/payload.exe', 'prompt');

  const res1 = await manager.downloadJob(insecureHttpJob);
  assert.equal(res1.status, 'error');
  assert.ok(res1.error?.includes('disallowed') || res1.error?.includes('Unverified') || res1.error?.includes('Insecure'));

  const res2 = await manager.downloadJob(arbitraryHostJob);
  assert.equal(res2.status, 'error');
  assert.ok(res2.error?.includes('disallowed') || res2.error?.includes('Unverified'));

  const res3 = await manager.downloadJob(plainHttpEvilJob);
  assert.equal(res3.status, 'error');
  assert.ok(res3.error?.includes('disallowed') || res3.error?.includes('Insecure'));

  assert.equal(adapter.downloads.length, 0);
});

test('Regression: Downloader accepts MetaMockAdapter outputs and provenance validation handles mock scheme safely', async () => {
  const mockAdapter = new MetaMockAdapter();
  const imgJob = createProbeJob('j_mock_img', 'image', '', 'prompt', 'pending');
  const vidJob = createProbeJob('j_mock_vid', 'video', '', 'prompt', 'pending');

  const execImg = await mockAdapter.execute(imgJob);
  const execVid = await mockAdapter.execute(vidJob);

  assert.equal(execImg.status, 'completed');
  assert.equal(execVid.status, 'completed');
  assert.ok(execImg.result?.mediaUrl.startsWith('mock://meta-ai/'));
  assert.ok(execVid.result?.mediaUrl.startsWith('mock://meta-ai/'));

  imgJob.state = 'completed';
  imgJob.result = execImg.result;
  vidJob.state = 'completed';
  vidJob.result = execVid.result;

  const dlAdapter = new MemoryDownloadsAdapter();
  const manager = new DownloadManager({ adapter: dlAdapter });

  const resImg = await manager.downloadJob(imgJob);
  const resVid = await manager.downloadJob(vidJob);

  assert.equal(resImg.status, 'success');
  assert.equal(resVid.status, 'success');
  assert.equal(dlAdapter.downloads.length, 2);

  const spoofedJob = createProbeJob('j_spoof', 'image', 'mock://malicious-host/generated/img.png', 'prompt');
  const resSpoofed = await manager.downloadJob(spoofedJob);
  assert.equal(resSpoofed.status, 'error');
  assert.ok(resSpoofed.error?.includes('disallowed') || resSpoofed.error?.includes('Unverified') || resSpoofed.error?.includes('scheme'));
});

test('Probe: revoked URL does not corrupt job state or retry count', async () => {
  const job = createProbeJob('job_revoke_test', 'video', 'https://scontent.xx.fbcdn.net/revoked_vid.mp4', 'prompt');
  const initialRetryCount = job.retryCount;
  const initialCompletedAt = job.completedAt;

  const adapter = new MemoryDownloadsAdapter({
    failUrls: new Set(['https://scontent.xx.fbcdn.net/revoked_vid.mp4']),
  });
  const manager = new DownloadManager({ adapter });

  const result = await manager.downloadJob(job);

  assert.equal(result.status, 'error');
  assert.ok(result.error?.includes('Download interrupted or revoked URL'));
  assert.equal(job.state, 'completed');
  assert.equal(job.retryCount, initialRetryCount);
  assert.equal(job.completedAt, initialCompletedAt);
});

test('SEC-04: Downloader rejects example.com, mock.meta.internal, and spoofed subdomains as unverified origins', async () => {
  const adapter = new MemoryDownloadsAdapter();
  const manager = new DownloadManager({ adapter });

  const unverifiedHostUrls = [
    'https://example.com/generated/output.png',
    'https://spoof.example.com/media/output.png',
    'https://mock.meta.internal/media/res1.png',
    'https://spoof.mock.meta.internal/media/res1.png',
    'https://meta.ai.attacker.com/malicious.png',
    'https://evil-meta.ai/spoof.png',
    'https://notfbcdn.net/fake.png',
  ];

  for (let i = 0; i < unverifiedHostUrls.length; i++) {
    const job = createProbeJob(`job_sec04_${i}`, 'image', unverifiedHostUrls[i]!, 'test prompt');
    const result = await manager.downloadJob(job);

    assert.equal(
      result.status,
      'error',
      `Expected unverified origin rejection for URL: ${unverifiedHostUrls[i]}, got status: ${result.status}`
    );
    assert.ok(
      result.error?.includes('Unverified provider origin'),
      `Expected "Unverified provider origin" error for URL: ${unverifiedHostUrls[i]}, got: ${result.error}`
    );
  }

  assert.equal(adapter.downloads.length, 0, 'No downloads should be dispatched for unverified origins');
});

