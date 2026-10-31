import { parentPort, workerData } from 'node:worker_threads';
import { analyzeProject, AnalysisError } from '@codeaudit/analyzer';
import { EXECUTION_LIMITS } from './limits';

const data = workerData as { directory: string; profileVersion?: string };
void analyzeProject(data.directory, { profileVersion: data.profileVersion }).then(
  (report) => {
    if (Buffer.byteLength(JSON.stringify(report)) > EXECUTION_LIMITS.reportBytes) {
      parentPort?.postMessage({ ok: false, code: 'RESULT_TOO_LARGE', message: 'Le rapport dépasse la taille maximale.' });
    } else parentPort?.postMessage({ ok: true, result: report });
  },
  (error: unknown) => parentPort?.postMessage({
    ok: false, code: error instanceof AnalysisError ? error.code : 'ENGINE_FAILED',
    message: error instanceof AnalysisError ? error.message : 'Le moteur n’a pas pu terminer.',
  }),
);
