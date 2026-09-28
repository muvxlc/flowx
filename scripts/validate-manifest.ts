import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateManifest } from '../src/manifest/validator.ts';

function main() {
  const manifestPath = resolve(process.cwd(), 'manifest.json');
  console.log(`Checking manifest at: ${manifestPath}`);
  const content = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(content);
  const result = validateManifest(manifest);

  if (!result.valid) {
    console.error('Manifest validation FAILED with errors:');
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  console.log('Manifest validation PASSED: MV3 compliant, permissions strictly scoped, remote code denied.');
}

main();
