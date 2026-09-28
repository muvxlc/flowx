import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, existsSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { validateManifest } from '../src/manifest/validator.ts';

async function runBuild() {
  const rootDir = process.cwd();
  const distDir = resolve(rootDir, 'dist');
  const stagingDir = resolve(rootDir, '.dist-staging');

  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });
  mkdirSync(distDir, { recursive: true });

  console.log('[build] Bundling background service worker...');
  await build({
    entryPoints: [resolve(rootDir, 'src/background/bootstrap.ts')],
    outfile: resolve(stagingDir, 'background.js'),
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    minify: false,
  });

  console.log('[build] Bundling sidepanel entrypoint...');
  await build({
    entryPoints: [resolve(rootDir, 'src/sidepanel/sidepanel.ts')],
    outfile: resolve(stagingDir, 'sidepanel.js'),
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    minify: false,
  });

  console.log('[build] Copying sidepanel HTML...');
  copyFileSync(
    resolve(rootDir, 'src/sidepanel/index.html'),
    resolve(stagingDir, 'sidepanel.html')
  );

  if (existsSync(resolve(rootDir, 'src/sidepanel/styles.css'))) {
    console.log('[build] Copying sidepanel CSS...');
    copyFileSync(
      resolve(rootDir, 'src/sidepanel/styles.css'),
      resolve(stagingDir, 'styles.css')
    );
  }

  console.log('[build] Copying manifest.json...');
  // In dist/, adjust relative paths so dist can also be loaded unpacked directly
  const manifestRaw = readFileSync(resolve(rootDir, 'manifest.json'), 'utf8');
  const manifestObj = JSON.parse(manifestRaw);

  // Write root-relative version into dist for direct unpacked loading if preferred
  const distManifest = {
    ...manifestObj,
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  };

  const distValidation = validateManifest(distManifest);
  if (!distValidation.valid) {
    throw new Error(`dist/manifest.json validation failed: ${distValidation.errors.join(', ')}`);
  }

  writeFileSync(
    resolve(stagingDir, 'manifest.json'),
    JSON.stringify(distManifest, null, 2),
    'utf8'
  );

  console.log('[build] Atomically deploying files to dist/...');
  for (const filename of readdirSync(stagingDir)) {
    const srcFile = join(stagingDir, filename);
    const destTmp = join(distDir, `.${filename}.tmp`);
    const destFile = join(distDir, filename);
    copyFileSync(srcFile, destTmp);
    renameSync(destTmp, destFile);
  }

  rmSync(stagingDir, { recursive: true, force: true });
  console.log('[build] Build completed successfully.');
}

runBuild().catch((err) => {
  console.error('[build] Build failed:', err);
  process.exit(1);
});
