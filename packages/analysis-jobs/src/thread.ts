import { Worker } from 'node:worker_threads';
import { JobError } from './limits';

interface ThreadOptions {
  timeoutMs: number;
  timeoutCode: string;
  signal?: AbortSignal;
}

export function runThread<T>(filename: string, data: unknown, options: ThreadOptions): Promise<T> {
  if (options.signal?.aborted) return Promise.reject(options.signal.reason instanceof JobError
    ? options.signal.reason : new JobError('WORKER_INTERRUPTED', 'Traitement interrompu.'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const thread = new Worker(filename, {
      workerData: data,
      execArgv: [],
      env: {},
      resourceLimits: { maxOldGenerationSizeMb: 384, maxYoungGenerationSizeMb: 64, stackSizeMb: 4 },
    });
    const finish = (error?: unknown, result?: T): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      // Toujours attendre la terminaison avant de publier un etat terminal.
      void thread.terminate().then(() => error ? reject(error) : resolve(result as T), reject);
    };
    const abort = (): void => finish(options.signal?.reason instanceof JobError
      ? options.signal.reason : new JobError('WORKER_INTERRUPTED', 'Traitement interrompu.'));
    const timer = setTimeout(() => finish(new JobError(options.timeoutCode, 'Délai maximal de traitement dépassé.')), Math.max(1, options.timeoutMs));
    thread.once('message', (message: unknown) => {
      if (!message || typeof message !== 'object' || !('ok' in message)) return finish(new JobError('THREAD_PROTOCOL_ERROR', 'Réponse du moteur invalide.'));
      const envelope = message as { ok: boolean; result?: T; code?: string; message?: string };
      if (envelope.ok === true) finish(undefined, envelope.result);
      else finish(new JobError(envelope.code ?? 'ENGINE_FAILED', envelope.message ?? 'Le moteur n’a pas pu terminer.'));
    });
    thread.once('error', (error: Error & { code?: string }) => finish(new JobError(
      error.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'MEMORY_LIMIT' : 'ENGINE_CRASHED',
      error.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'Limite mémoire du moteur dépassée.' : 'Le moteur s’est arrêté anormalement.',
    )));
    thread.once('exit', () => { if (!settled) finish(new JobError('ENGINE_CRASHED', 'Le moteur s’est arrêté sans résultat.')); });
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
  });
}
