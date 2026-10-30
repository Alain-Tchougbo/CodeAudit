import { mkdir, open } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { crc32 } from 'node:zlib';
import { fromBuffer, type Entry, type ZipFile } from 'yauzl';
import { IGNORED_DIRECTORIES, SUPPORTED_EXTENSIONS } from '@codeaudit/analyzer';
import { IMPORT_LIMITS, JobError } from './limits';

export interface ZipLimits {
  archiveBytes: number; entries: number; fileBytes: number; expandedBytes: number;
}

function safeName(entry: Entry): { path: string; directory: boolean } {
  const name = entry.fileName.normalize('NFC');
  const directory = name.endsWith('/');
  const path = directory ? name.slice(0, -1) : name;
  const segments = path.split('/');
  if (!path || path.length > 1024 || segments.length > 32
    || [...path].some((character) => character.charCodeAt(0) < 32) || /[\\:*?"<>|]/.test(path) || path.startsWith('/')
    || segments.some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part)
      || part.length > 255 || /^(con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))) {
    throw new JobError('ZIP_PATH_INVALID', 'Un chemin de l’archive est interdit.');
  }
  const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
  if (mode === 0xa000 || (entry.externalFileAttributes & 0x400) !== 0) throw new JobError('ZIP_LINK_FORBIDDEN', 'Les liens symboliques sont interdits.');
  if (mode !== 0 && mode !== 0x8000 && mode !== 0x4000) throw new JobError('ZIP_FILE_TYPE', 'Un type de fichier de l’archive est interdit.');
  if ((mode === 0x4000 && !directory) || (mode === 0x8000 && directory)) throw new JobError('ZIP_CORRUPT', 'Type d’entrée ZIP incohérent.');
  if ((entry.generalPurposeBitFlag & 1) !== 0) throw new JobError('ZIP_ENCRYPTED', 'Les archives chiffrées ne sont pas prises en charge.');
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) throw new JobError('ZIP_COMPRESSION', 'Méthode de compression non prise en charge.');
  return { path, directory };
}

export async function extractZip(buffer: Buffer, destination: string, limits: ZipLimits = IMPORT_LIMITS) {
  if (buffer.length > limits.archiveBytes) throw new JobError('ZIP_TOO_LARGE', 'L’archive dépasse la taille autorisée.');
  const zip = await new Promise<ZipFile>((resolveZip, reject) => {
    fromBuffer(buffer, { lazyEntries: true, decodeStrings: true, strictFileNames: true, validateEntrySizes: true },
      (error, file) => error || !file ? reject(new JobError('ZIP_CORRUPT', 'Archive ZIP invalide.')) : resolveZip(file));
  });
  if (zip.entryCount > limits.entries) { zip.close(); throw new JobError('ZIP_ENTRY_LIMIT', 'L’archive contient trop d’entrées.'); }
  let count = 0;
  let bytes = 0;
  let supportedFiles = 0;
  const seen = new Set<string>();
  const nodes = new Map<string, { path: string; directory: boolean }>();
  const root = resolve(destination);

  return new Promise<{ entryCount: number; expandedBytes: number; supportedFiles: number }>((resolveZip, reject) => {
    let finished = false;
    const fail = (error: unknown): void => {
      if (finished) return;
      finished = true;
      zip.close();
      if (['ENOSPC', 'EACCES', 'EPERM', 'EROFS', 'EMFILE', 'ENFILE'].includes((error as NodeJS.ErrnoException)?.code ?? '')) {
        return reject(new JobError('STORAGE_ERROR', 'Le stockage temporaire est indisponible.'));
      }
      reject(error instanceof JobError ? error : new JobError('ZIP_CORRUPT', 'Archive ZIP invalide ou tronquée.'));
    };
    zip.on('error', fail);
    zip.on('end', () => {
      if (finished) return;
      if (!supportedFiles) return fail(new JobError('NO_SUPPORTED_FILES', 'L’archive ne contient aucune source JS/TS analysable.'));
      finished = true;
      zip.close();
      resolveZip({ entryCount: count, expandedBytes: bytes, supportedFiles });
    });
    zip.on('entry', (entry: Entry) => {
      void (async () => {
        if (++count > limits.entries) throw new JobError('ZIP_ENTRY_LIMIT', 'L’archive contient trop d’entrées.');
        const name = safeName(entry);
        const identity = name.path.toLowerCase();
        if (seen.has(identity)) throw new JobError('ZIP_DUPLICATE_PATH', 'L’archive contient des chemins en doublon.');
        seen.add(identity);
        const segments = name.path.split('/');
        for (let index = 0; index < segments.length; index++) {
          const path = segments.slice(0, index + 1).join('/');
          const directory = index < segments.length - 1 || name.directory;
          const previous = nodes.get(path.toLowerCase());
          if (previous && (previous.path !== path || previous.directory !== directory)) {
            throw new JobError('ZIP_DUPLICATE_PATH', 'L’archive contient des chemins en conflit.');
          }
          nodes.set(path.toLowerCase(), { path, directory });
          if (nodes.size > limits.entries) throw new JobError('ZIP_ENTRY_LIMIT', 'Trop de fichiers et répertoires décompressés.');
        }
        if (entry.uncompressedSize > limits.fileBytes) throw new JobError('ZIP_FILE_TOO_LARGE', 'Un fichier décompressé dépasse la limite.');
        if (entry.uncompressedSize > limits.expandedBytes - bytes) throw new JobError('ZIP_EXPANDED_LIMIT', 'Le contenu décompressé dépasse la limite.');
        const target = resolve(root, ...name.path.split('/'));
        const child = relative(root, target);
        if (!child || child.startsWith('..' + sep) || child === '..' || isAbsolute(child)) throw new JobError('ZIP_PATH_INVALID', 'Chemin ZIP interdit.');
        if (name.directory) {
          if (entry.uncompressedSize !== 0) throw new JobError('ZIP_CORRUPT', 'Un répertoire ZIP contient des données.');
          await mkdir(target, { recursive: true, mode: 0o700 });
        } else {
          await mkdir(dirname(target), { recursive: true, mode: 0o700 });
          const output = await open(target, 'wx', 0o600);
          let fileBytes = 0;
          let checksum = 0;
          try {
            const stream = await new Promise<NodeJS.ReadableStream>((resolveStream, rejectStream) => {
              zip.openReadStream(entry, (error, readable) => error || !readable ? rejectStream(error) : resolveStream(readable));
            });
            for await (const value of stream) {
              const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
              fileBytes += chunk.length;
              bytes += chunk.length;
              if (fileBytes > limits.fileBytes) throw new JobError('ZIP_FILE_TOO_LARGE', 'Un fichier décompressé dépasse la limite.');
              if (bytes > limits.expandedBytes) throw new JobError('ZIP_EXPANDED_LIMIT', 'Le contenu décompressé dépasse la limite.');
              checksum = crc32(chunk, checksum);
              let offset = 0;
              while (offset < chunk.length) {
                const result = await output.write(chunk, offset, chunk.length - offset);
                if (!result.bytesWritten) throw new JobError('STORAGE_ERROR', 'Écriture temporaire impossible.');
                offset += result.bytesWritten;
              }
            }
          } finally { await output.close(); }
          if (fileBytes !== entry.uncompressedSize || checksum !== entry.crc32) throw new JobError('ZIP_CORRUPT', 'Le contenu de l’archive est corrompu.');
          const parts = name.path.split('/');
          if (!parts.slice(0, -1).some((part) => IGNORED_DIRECTORIES.some((ignored) => ignored === part))
            && SUPPORTED_EXTENSIONS.some((extension) => extension === extname(name.path).toLowerCase())) supportedFiles++;
        }
        if (!finished) zip.readEntry();
      })().catch(fail);
    });
    zip.readEntry();
  });
}
