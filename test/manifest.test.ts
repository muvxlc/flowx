import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateManifest } from '../src/manifest/validator.ts';

test('Manifest validator - rejects non-MV3 manifest', () => {
  const badManifest = {
    manifest_version: 2,
    name: 'Bad MV2',
    version: '1.0.0',
  };
  const result = validateManifest(badManifest);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('manifest_version must be 3')));
});

test('Manifest validator - rejects broad all-sites permissions', () => {
  const badManifest = {
    manifest_version: 3,
    name: 'All sites',
    version: '1.0.0',
    permissions: ['storage', '<all_urls>'],
    host_permissions: ['<all_urls>'],
    background: { service_worker: 'background.js', type: 'module' },
    side_panel: { default_path: 'sidepanel.html' },
  };
  const result = validateManifest(badManifest);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('Forbidden permission: <all_urls>')));
  assert.ok(result.errors.some(e => e.includes('Forbidden host permission: <all_urls>')));
});

test('Manifest validator - rejects arbitrary wildcard host permissions', () => {
  const badManifest = {
    manifest_version: 3,
    name: 'Wildcard host',
    version: '1.0.0',
    permissions: ['storage'],
    host_permissions: ['https://*/*'],
    background: { service_worker: 'background.js', type: 'module' },
    side_panel: { default_path: 'sidepanel.html' },
  };
  const result = validateManifest(badManifest);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('Forbidden host permission: broad wildcard')));
});

test('Manifest validator - rejects unapproved host origins', () => {
  const badManifest = {
    manifest_version: 3,
    name: 'Bad host',
    version: '1.0.0',
    permissions: ['storage'],
    host_permissions: ['https://evil.com/*'],
    background: { service_worker: 'background.js', type: 'module' },
    side_panel: { default_path: 'sidepanel.html' },
  };
  const result = validateManifest(badManifest);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('Unapproved host permission: https://evil.com/*')));
});

test('Manifest validator - rejects remote code in CSP', () => {
  const badManifest = {
    manifest_version: 3,
    name: 'Remote code CSP',
    version: '1.0.0',
    permissions: ['storage', 'sidePanel'],
    host_permissions: ['https://*.meta.ai/*'],
    background: { service_worker: 'background.js', type: 'module' },
    side_panel: { default_path: 'sidepanel.html' },
    content_security_policy: {
      extension_pages: "script-src 'self' https://cdn.jsdelivr.net 'unsafe-eval'; object-src 'self';",
    },
  };
  const result = validateManifest(badManifest);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('Remote script sources forbidden in CSP script-src')));
  assert.ok(result.errors.some(e => e.includes("'unsafe-eval' forbidden in CSP script-src")));
});

test('Manifest validator - rejects missing background service_worker or side_panel', () => {
  const badManifest = {
    manifest_version: 3,
    name: 'Missing worker',
    version: '1.0.0',
    permissions: ['storage'],
  };
  const result = validateManifest(badManifest);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('background.service_worker required')));
  assert.ok(result.errors.some(e => e.includes('side_panel.default_path required')));
});

test('Production manifest.json - exists, is valid MV3, and satisfies all scoped rules', () => {
  const manifestPath = resolve(process.cwd(), 'manifest.json');
  assert.ok(existsSync(manifestPath), 'manifest.json must exist in root');

  const content = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(content);
  const result = validateManifest(manifest);

  assert.deepStrictEqual(result.errors, [], `Production manifest validation errors: ${result.errors.join(', ')}`);
  assert.strictEqual(result.valid, true);

  // Assert exact scoped permissions
  assert.ok(manifest.permissions.includes('sidePanel'));
  assert.ok(manifest.permissions.includes('storage'));
  assert.ok(manifest.permissions.includes('alarms'));
  assert.strictEqual(manifest.permissions.includes('scripting'), false);
  assert.ok(manifest.permissions.includes('downloads'));

  // Assert exact scoped host permissions
  assert.ok(manifest.host_permissions.includes('https://*.meta.ai/*'));
  assert.ok(manifest.host_permissions.includes('https://9router.bangkhan.com/*'));
});

test('Manifest validator - rejects unused scripting permission as unjustified', () => {
  const badManifest = {
    manifest_version: 3,
    name: 'Over-privileged',
    version: '1.0.0',
    permissions: ['storage', 'scripting'],
    background: { service_worker: 'background.js', type: 'module' },
    side_panel: { default_path: 'sidepanel.html' },
  };
  const result = validateManifest(badManifest);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('Unjustified permission: scripting')));
});

