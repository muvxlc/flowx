export interface ManifestValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const ALLOWED_PERMISSIONS = new Set([
  'sidePanel',
  'storage',
  'alarms',
  'downloads',
]);

const FORBIDDEN_PERMISSIONS = new Set([
  '<all_urls>',
  '*://*/*',
  'http://*/*',
  'https://*/*',
  'webRequest',
  'cookies',
  'debugger',
  'proxy',
]);

const ALLOWED_HOST_PATTERNS = [
  /^https:\/\/((\*\.)|([a-z0-9-]+\.))*meta\.ai\/\*$/,
  /^https:\/\/9router\.bangkhan\.com\/\*$/,
];

export function validateManifest(manifest: unknown): ManifestValidationResult {
  const errors: string[] = [];

  if (typeof manifest !== 'object' || manifest === null) {
    return { valid: false, errors: ['Manifest must be an object'] };
  }

  const m = manifest as Record<string, unknown>;

  if (m['manifest_version'] !== 3) {
    errors.push('manifest_version must be 3 for MV3 extension');
  }

  if (typeof m['name'] !== 'string' || m['name'].trim().length === 0) {
    errors.push('Manifest name required and must be non-empty string');
  }

  if (typeof m['version'] !== 'string' || m['version'].trim().length === 0) {
    errors.push('Manifest version required');
  }

  // Check background service worker
  const background = m['background'];
  if (
    typeof background !== 'object' ||
    background === null ||
    typeof (background as Record<string, unknown>)['service_worker'] !== 'string'
  ) {
    errors.push('background.service_worker required');
  } else {
    const workerType = (background as Record<string, unknown>)['type'];
    if (workerType !== 'module') {
      errors.push('background.type must be "module" for ES module service worker');
    }
  }

  // Check side panel
  const sidePanel = m['side_panel'];
  if (
    typeof sidePanel !== 'object' ||
    sidePanel === null ||
    typeof (sidePanel as Record<string, unknown>)['default_path'] !== 'string'
  ) {
    errors.push('side_panel.default_path required');
  }

  // Check permissions
  const permissions = m['permissions'];
  if (Array.isArray(permissions)) {
    for (const perm of permissions) {
      if (typeof perm !== 'string') {
        errors.push(`Invalid permission entry: ${String(perm)}`);
        continue;
      }
      if (FORBIDDEN_PERMISSIONS.has(perm)) {
        errors.push(`Forbidden permission: ${perm}`);
      } else if (!ALLOWED_PERMISSIONS.has(perm)) {
        errors.push(`Unjustified permission: ${perm}`);
      }
    }
  }

  // Check host permissions
  const hostPermissions = m['host_permissions'];
  if (Array.isArray(hostPermissions)) {
    for (const host of hostPermissions) {
      if (typeof host !== 'string') {
        errors.push(`Invalid host_permission entry: ${String(host)}`);
        continue;
      }
      if (host === '<all_urls>') {
        errors.push('Forbidden host permission: <all_urls>');
        continue;
      }
      if (host.includes('*://*/*') || host.includes('https://*/*') || host.includes('http://*/*')) {
        errors.push('Forbidden host permission: broad wildcard');
        continue;
      }

      const isAllowed = ALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(host));
      if (!isAllowed) {
        errors.push(`Unapproved host permission: ${host}`);
      }
    }
  }

  // Check Content Security Policy
  const csp = m['content_security_policy'];
  if (typeof csp === 'object' && csp !== null) {
    const extensionPages = (csp as Record<string, unknown>)['extension_pages'];
    if (typeof extensionPages === 'string') {
      if (extensionPages.includes('unsafe-eval')) {
        errors.push("'unsafe-eval' forbidden in CSP script-src");
      }
      const scriptSrcMatch = extensionPages.match(/script-src\s+([^;]+)/);
      if (scriptSrcMatch && scriptSrcMatch[1]) {
        const scriptDirectives = scriptSrcMatch[1].split(/\s+/);
        for (const token of scriptDirectives) {
          if (
            (token.startsWith('http:') || token.startsWith('https:')) &&
            !token.includes("'self'")
          ) {
            errors.push(`Remote script sources forbidden in CSP script-src: ${token}`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
