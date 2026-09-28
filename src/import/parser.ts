/**
 * Parse raw prompt text into trimmed non-empty lines with UTF-8 support.
 * Normalizes CRLF and CR to LF.
 */
export function parsePromptText(raw: string): string[] {
  if (!raw || typeof raw !== 'string') {
    return [];
  }

  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      result.push(trimmed);
    }
  }

  return result;
}
