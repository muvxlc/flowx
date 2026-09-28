import type { Job } from '../queue/types.ts';
import type { CsvExportOptions } from './types.ts';

export type CompletedJob = Job & { result: NonNullable<Job['result']> };

export function filterCompletedJobs(jobs: readonly Job[]): CompletedJob[] {
  return jobs.filter((job): job is CompletedJob => {
    return (
      job.state === 'completed' &&
      job.result !== null &&
      job.result !== undefined &&
      typeof job.result.mediaUrl === 'string' &&
      job.result.mediaUrl.trim().length > 0
    );
  });
}

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  if (typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  const str = String(val);
  const isFormula = /^\s*[=+\-@\t\r|]/.test(str);
  const safeStr = isFormula ? `'${str}` : str;
  if (isFormula || /[",\r\n]/.test(safeStr)) {
    return `"${safeStr.replace(/"/g, '""')}"`;
  }
  return safeStr;
}

export function generateCsvExport(
  jobs: readonly Job[],
  options?: CsvExportOptions
): string {
  const verifiedJobs = filterCompletedJobs(jobs);
  const includePrompt = options?.includePrompt ?? false;

  const headers = [
    'job_id',
    'media_type',
    'mode',
    'provider',
    'status',
    'created_at',
    'completed_at',
    'media_url',
    'retry_count',
  ];

  if (includePrompt) {
    headers.push('prompt');
  }

  const rows: string[] = [headers.join(',')];

  for (const job of verifiedJobs) {
    const row = [
      escapeCsvField(job.id),
      escapeCsvField(job.media),
      escapeCsvField(job.mode),
      escapeCsvField(job.provider),
      escapeCsvField(job.state),
      escapeCsvField(job.createdAt),
      escapeCsvField(job.completedAt ?? ''),
      escapeCsvField(job.result.mediaUrl),
      escapeCsvField(job.retryCount),
    ];

    if (includePrompt) {
      row.push(escapeCsvField(job.prompt));
    }

    rows.push(row.join(','));
  }

  // UTF-8 BOM prefix for broad spreadsheet compatibility
  return `\uFEFF${rows.join('\n')}\n`;
}
