import test from 'node:test';
import assert from 'node:assert';
import { MediaStorage } from '../../src/persistence/index.ts';

test('MediaStorage - stores and retrieves media blobs in IndexedDB adapter', async () => {
  const mediaStore = new MediaStorage();
  const testBytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
  const refId = 'media-ref-abc-123';

  const ref = await mediaStore.saveMedia(refId, testBytes, 'image/png');
  assert.strictEqual(ref.id, refId);
  assert.strictEqual(ref.mimeType, 'image/png');
  assert.strictEqual(ref.byteLength, 4);

  const retrieved = await mediaStore.getMedia(refId);
  assert.ok(retrieved !== null);
  assert.strictEqual(retrieved.mimeType, 'image/png');
  assert.deepStrictEqual(new Uint8Array(retrieved.data), testBytes);

  // Clean delete
  const deleted = await mediaStore.deleteMedia(refId);
  assert.strictEqual(deleted, true);

  const missingAfterDelete = await mediaStore.getMedia(refId);
  assert.strictEqual(missingAfterDelete, null);
});

test('MediaStorage - missing media blob returns null and does not throw', async () => {
  const mediaStore = new MediaStorage();
  const nonExistent = await mediaStore.getMedia('ghost-ref-999');
  assert.strictEqual(nonExistent, null);
});
