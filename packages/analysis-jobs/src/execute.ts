import { join } from 'node:path';
import type { AnalysisReport } from '@codeaudit/analyzer';
import { AnalysisQueue, type ReservationOptions } from './queue';
import { EXECUTION_LIMITS, JobError } from './limits';
import { SourceStore } from './storage';
import { runThread } from './thread';
import { captureCodeContext } from './code-context';

export interface ProcessOptions extends ReservationOptions {
  signal?: AbortSignal;
  // Test hooks are deliberately absent: production always uses the controlled engine.
}

export async function processNext(queue: AnalysisQueue, store: SourceStore, workerId: string, options: ProcessOptions = {}): Promise<boolean> {
  if (options.signal?.aborted) return false;
  const claim = await queue.claim(workerId, options);
  if (!claim) return false;
  const cancellation = new AbortController();
  const stop = () => cancellation.abort(new JobError('WORKER_INTERRUPTED', 'Le worker a été arrêté.'));
  options.signal?.addEventListener('abort', stop, { once: true });
  if (options.signal?.aborted) stop();
  const leaseMs = options.leaseMs ?? EXECUTION_LIMITS.leaseMs;
  let heartbeat: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (heartbeat) return;
    heartbeat = queue.heartbeat(claim.id, claim.lockToken, leaseMs).then(
      (owned) => { if (!owned) cancellation.abort(new JobError('LEASE_LOST', 'La réservation a expiré.')); },
      () => cancellation.abort(new JobError('DATABASE_UNAVAILABLE', 'Le worker ne peut plus renouveler sa réservation.')),
    ).finally(() => { heartbeat = undefined; });
  }, Math.max(25, Math.floor(leaseMs / 3)));

  try {
    if (!claim.sourceKey) throw new JobError('SOURCE_MISSING', 'Les sources de cette analyse sont absentes.');
    let directory: string;
    try { directory = await store.sources(claim.sourceKey); }
    catch { throw new JobError('SOURCE_MISSING', 'Les sources de cette analyse sont absentes ou invalides.'); }
    const report = await runThread<AnalysisReport>(join(__dirname, '../dist/analyze-thread.js'), { directory }, {
      signal: cancellation.signal,
      timeoutMs: Math.max(1, claim.deadlineAt.getTime() - Date.now()),
      timeoutCode: 'ANALYSIS_TIMEOUT',
    });
    const context = claim.captureContext ? await captureCodeContext(directory, report.issues, { signal: cancellation.signal, deadlineAt: claim.deadlineAt.getTime() }) : null;
    if (cancellation.signal.aborted) throw cancellation.signal.reason;
    if (Date.now() >= claim.deadlineAt.getTime()) throw new JobError('ANALYSIS_TIMEOUT', 'Délai maximal de traitement dépassé.');
    if (!await queue.succeed(claim, report, context)) {
      await queue.fail(claim, 'LEASE_LOST', 'La réservation n’est plus valide ; aucun résultat n’a été publié.');
    }
  } catch (error) {
    await queue.fail(claim, error instanceof JobError ? error.code : 'ENGINE_FAILED',
      error instanceof JobError ? error.message : 'Le traitement n’a pas pu aboutir.');
  } finally {
    clearInterval(timer);
    options.signal?.removeEventListener('abort', stop);
    if (heartbeat) await heartbeat;
    await queue.cleanup(store);
  }
  return true;
}
