import { BadGatewayException, GatewayTimeoutException, HttpException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { GitImportRequest, GitSource } from '@codeaudit/contracts';
import { IMPORT_LIMITS } from '@codeaudit/analysis-jobs';
import { GITHUB_REPOSITORY } from './git-source';

const invalid = () => new BadGatewayException({ code: 'GITHUB_RESPONSE_INVALID', message: 'La réponse du fournisseur Git est invalide.' });
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(); return value as Record<string, unknown>; }
async function bounded(response: Response, max: number): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > max) { await response.body?.cancel(); throw new HttpException({ code: 'GIT_DOWNLOAD_TOO_LARGE', message: 'Le téléchargement Git dépasse la limite autorisée.' }, 413); }
  if (!response.body) throw invalid(); const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; total += value.byteLength;
      if (total > max) throw new HttpException({ code: 'GIT_DOWNLOAD_TOO_LARGE', message: 'Le téléchargement Git dépasse la limite autorisée.' }, 413);
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks);
}
async function check(response: Response): Promise<void> {
  if (response.ok) return;
  await response.body?.cancel().catch(() => {});
  if (response.status === 404 || response.status === 422) throw new UnprocessableEntityException({ code: 'GIT_SOURCE_UNAVAILABLE', message: 'Dépôt, référence ou pull request introuvable ou inaccessible.' });
  if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) throw new HttpException({ code: 'GITHUB_RATE_LIMIT', message: 'La limite GitHub est atteinte. Réessayez plus tard.' }, 429);
  throw new BadGatewayException({ code: 'GITHUB_UNAVAILABLE', message: 'Le fournisseur Git ne permet pas ce téléchargement pour le moment.' });
}
@Injectable()
export class GitHubArchiveService {
  async download(input: GitImportRequest): Promise<{ archive: Buffer; source: GitSource }> {
    if (!GITHUB_REPOSITORY.test(input.repository)) throw invalid();
    const signal = AbortSignal.timeout(30_000);
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'CodeAudit', 'X-GitHub-Api-Version': '2026-03-10' };
    const api = async (path: string) => {
      const response = await fetch(`https://api.github.com/repos/${path}`, { headers, signal, redirect: 'manual' });
      await check(response); const bytes = await bounded(response, 1024 * 1024);
      try { return object(JSON.parse(bytes.toString('utf8'))); } catch { throw invalid(); }
    };
    try {
      const repository = await api(input.repository);
      if (repository.private !== false) throw new UnprocessableEntityException({ code: 'GIT_PUBLIC_ONLY', message: 'Seuls les dépôts GitHub publics sont pris en charge par cet import.' });
      let archiveRepository = input.repository; let requestedRef: string; let commitSha: unknown;
      if (input.pullRequest !== undefined) {
        const pull = await api(`${input.repository}/pulls/${input.pullRequest}`); const head = object(pull.head); const headRepo = object(head.repo);
        if (headRepo.private !== false || typeof headRepo.full_name !== 'string' || !GITHUB_REPOSITORY.test(headRepo.full_name)) throw invalid();
        archiveRepository = headRepo.full_name; requestedRef = `pull/${input.pullRequest}`; commitSha = head.sha;
      } else {
        const ref = input.ref ?? repository.default_branch;
        if (typeof ref !== 'string' || !ref.length || ref.length > 200 || /[\x00-\x20\x7f]/.test(ref)) throw invalid();
        requestedRef = ref; commitSha = (await api(`${input.repository}/commits/${encodeURIComponent(ref)}`)).sha;
      }
      if (typeof commitSha !== 'string' || !/^[a-f0-9]{40}$/.test(commitSha)) throw invalid();
      const redirect = await fetch(`https://api.github.com/repos/${archiveRepository}/zipball/${commitSha}`, { headers, signal, redirect: 'manual' });
      if (redirect.status !== 302) { await redirect.body?.cancel().catch(() => {}); await check(redirect); throw invalid(); }
      const location = redirect.headers.get('location'); await redirect.body?.cancel(); if (!location) throw invalid();
      const target = new URL(location);
      if (target.protocol !== 'https:' || target.hostname !== 'codeload.github.com' || target.port || target.username || target.password || target.hash) throw invalid();
      const response = await fetch(target, { signal, redirect: 'manual', headers: { 'User-Agent': 'CodeAudit' } }); await check(response);
      const archive = await bounded(response, IMPORT_LIMITS.archiveBytes); if (!archive.length) throw invalid();
      return { archive, source: { schemaVersion: 1, provider: 'GITHUB', repository: input.repository, archiveRepository, requestedRef, commitSha, pullRequest: input.pullRequest ?? null } };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (signal.aborted || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))) throw new GatewayTimeoutException({ code: 'GIT_DOWNLOAD_TIMEOUT', message: 'Le téléchargement Git a dépassé son délai de 30 secondes.' });
      throw new BadGatewayException({ code: 'GITHUB_UNAVAILABLE', message: 'Le téléchargement Git n’a pas pu aboutir.' });
    }
  }
}
