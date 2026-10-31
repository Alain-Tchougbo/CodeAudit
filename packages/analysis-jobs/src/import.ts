import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { IMPORT_LIMITS } from './limits';
import { SourceStore } from './storage';
import { runThread } from './thread';
import { normalizeArchiveRoot } from './normalize-root';

export async function prepareSources(store: SourceStore, archive: Buffer, options: { stripSingleRoot?: boolean } = {}) {
  const key = randomUUID();
  const directory = await store.create(key);
  try {
    const result = await runThread<{ supportedFiles: number; entryCount: number; expandedBytes: number }>(
      join(__dirname, '../dist/extract-thread.js'), { archive, directory },
      { timeoutMs: IMPORT_LIMITS.extractionMs, timeoutCode: 'EXTRACTION_TIMEOUT' },
    );
    if (options.stripSingleRoot) await normalizeArchiveRoot(store, key);
    return { key, digest: createHash('sha256').update(archive).digest('hex'), ...result };
  } catch (error) {
    await store.remove(key);
    throw error;
  }
}
