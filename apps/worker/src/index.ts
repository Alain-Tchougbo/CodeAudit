import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createDatabaseClient } from '@codeaudit/database';
import { AnalysisQueue, SourceStore, processNext } from '@codeaudit/analysis-jobs';

async function main(): Promise<void> {
  const client = createDatabaseClient();
  const queue = new AnalysisQueue(client);
  const store = await SourceStore.open();
  const workerId = randomUUID();
  const stop = new AbortController();
  process.once('SIGINT', () => stop.abort());
  process.once('SIGTERM', () => stop.abort());
  let lastMaintenance = 0;
  let connected = false;
  try {
    while (!stop.signal.aborted) {
      try {
        if (!connected) {
          await client.$connect(); connected = true;
          console.info(`CodeAudit worker ${workerId} prêt.`);
        }
        if (Date.now() - lastMaintenance >= 5000) {
          const cleanup = await queue.maintenance(store);
          if (cleanup.errors) console.warn(`Worker : ${cleanup.errors} nettoyage(s) a retenter.`);
          lastMaintenance = Date.now();
        }
        const worked = await processNext(queue, store, workerId, { signal: stop.signal });
        if (!worked) await delay(500, undefined, { signal: stop.signal });
      } catch {
        if (!stop.signal.aborted) {
          console.error('Worker : traitement ou base indisponible ; nouvelle tentative de connexion au prochain cycle.');
          await delay(1000, undefined, { signal: stop.signal }).catch(() => {});
        }
      }
    }
    await queue.cleanup(store);
  } finally { await client.$disconnect(); }
}

main().catch(() => {
  console.error('Le worker n’a pas pu démarrer.');
  process.exitCode = 1;
});
