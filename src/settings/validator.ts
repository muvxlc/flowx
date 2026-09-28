import {
  PINNED_9ROUTER_ENDPOINT,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
} from './constants.ts';
import { SettingsError } from './types.ts';

export function validateEndpoint(url?: string): void {
  if (url === undefined) {
    return;
  }

  if (typeof url !== 'string' || url.trim() !== PINNED_9ROUTER_ENDPOINT) {
    throw new SettingsError(
      'INVALID_ENDPOINT',
      `Endpoint must strictly match pinned URL: ${PINNED_9ROUTER_ENDPOINT}. Arbitrary endpoints or overrides are prohibited.`
    );
  }

  // Strictly check URL integrity (no extra query params, hash fragments, or redirection tricks)
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      throw new SettingsError('INVALID_ENDPOINT', 'Endpoint protocol must be HTTPS');
    }
    if (parsed.hostname !== '9router.bangkhan.com') {
      throw new SettingsError('INVALID_ENDPOINT', 'Invalid hostname for pinned endpoint');
    }
    if (parsed.pathname !== '/v1/systemone') {
      throw new SettingsError('INVALID_ENDPOINT', 'Invalid path for pinned endpoint');
    }
    if (parsed.search || parsed.hash) {
      throw new SettingsError('INVALID_ENDPOINT', 'Query parameters or hash fragments are not allowed');
    }
  } catch (err: unknown) {
    if (err instanceof SettingsError) {
      throw err;
    }
    throw new SettingsError('INVALID_ENDPOINT', 'Malformed pinned endpoint URL');
  }
}

export function validateTimeout(timeoutMs?: number): void {
  if (timeoutMs === undefined) {
    return;
  }

  if (
    typeof timeoutMs !== 'number' ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs < MIN_TIMEOUT_MS ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new SettingsError(
      'INVALID_TIMEOUT',
      `Timeout must be a finite number between ${MIN_TIMEOUT_MS}ms and ${MAX_TIMEOUT_MS}ms (got ${String(timeoutMs)})`
    );
  }
}

export function validatePersonalKey(key: string): string {
  if (typeof key !== 'string') {
    throw new SettingsError('INVALID_KEY', 'Personal key must be a string');
  }

  const trimmed = key.trim();
  if (trimmed.length === 0) {
    throw new SettingsError('INVALID_KEY', 'Personal key cannot be empty');
  }

  return trimmed;
}

export function validateConsent(consent: boolean): void {
  if (consent !== true) {
    throw new SettingsError(
      'CONSENT_REQUIRED',
      'Prompt transfer consent is mandatory before sending prompts to 9router proxy'
    );
  }
}
