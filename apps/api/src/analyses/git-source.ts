import { ConflictException } from '@nestjs/common';
import type { GitSource } from '@codeaudit/contracts';
export const GITHUB_REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/(?!\.{1,2}$)[A-Za-z0-9_.-]{1,100}$/;
export function validGitReference(value: string): boolean { return value.length > 0 && value.length <= 200 && ![...value].some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127); }
export function gitSource(value: unknown): GitSource | null {
  if (value === null) return null;
  if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
    const source = value as Record<string, unknown>;
    const keys = ['schemaVersion', 'provider', 'repository', 'archiveRepository', 'requestedRef', 'commitSha', 'pullRequest'];
    if (Object.keys(source).length === keys.length && keys.every(key => Object.hasOwn(source, key)) && source.schemaVersion === 1 && source.provider === 'GITHUB' && typeof source.repository === 'string' && GITHUB_REPOSITORY.test(source.repository)
      && typeof source.archiveRepository === 'string' && GITHUB_REPOSITORY.test(source.archiveRepository) && typeof source.requestedRef === 'string' && validGitReference(source.requestedRef)
      && typeof source.commitSha === 'string' && /^[a-f0-9]{40}$/.test(source.commitSha)
      && (source.pullRequest === null || (typeof source.pullRequest === 'number' && Number.isSafeInteger(source.pullRequest) && source.pullRequest > 0 && source.pullRequest <= 2147483647))) return {
      schemaVersion: 1, provider: 'GITHUB', repository: source.repository, archiveRepository: source.archiveRepository,
      requestedRef: source.requestedRef, commitSha: source.commitSha, pullRequest: source.pullRequest,
    };
  }
  throw new ConflictException({ code: 'SOURCE_METADATA_INVALID', message: 'La provenance enregistrée est invalide.' });
}
