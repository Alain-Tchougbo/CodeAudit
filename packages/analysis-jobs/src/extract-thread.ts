import { parentPort, workerData } from 'node:worker_threads';
import { extractZip } from './zip';
import { JobError } from './limits';

const data = workerData as { archive: Uint8Array; directory: string };
void extractZip(Buffer.from(data.archive), data.directory).then(
  (result) => parentPort?.postMessage({ ok: true, result }),
  (error: unknown) => parentPort?.postMessage({
    ok: false, code: error instanceof JobError ? error.code : 'STORAGE_ERROR',
    message: error instanceof JobError ? error.message : 'Impossible de préparer les sources.',
  }),
);
