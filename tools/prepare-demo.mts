import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Upstream sources stay outside Git and are never installed or executed.
const repository = 'expressjs/express';
const version = '5.1.0';
const commit = 'cd7d4397c398a3f3ecadeaf9ef6ac1377bd414c4';
const sha256 = 'f1d730c4a89ca142cef7da22229b99cec1aefabda7d71115cd4f935eda719628';
const url = `https://codeload.github.com/${repository}/zip/${commit}`;
const root = resolve(import.meta.dirname, '..');
const directory = resolve(root, '.tmp/demo');
const destination = resolve(directory, `express-${version}.zip`);
const maxBytes = 10 * 1024 * 1024;
for (const path of [resolve(root, '.tmp'), directory, destination]) {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error(`Refusing a symbolic link: ${path}`);
}
mkdirSync(directory, { recursive: true });

let bytes: Buffer;
if (existsSync(destination)) {
  if (!lstatSync(destination).isFile() || lstatSync(destination).size > maxBytes) throw new Error('Invalid existing demo archive.');
  bytes = readFileSync(destination);
} else {
  console.log(`Downloading ${repository} ${version} at ${commit}…`);
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBytes) throw new Error('Demo archive exceeds the 10 MiB import limit.');
    chunks.push(buffer);
  }
  bytes = Buffer.concat(chunks);
}
if (createHash('sha256').update(bytes).digest('hex') !== sha256) {
  throw new Error('Archive checksum mismatch. Nothing was replaced. Check upstream before updating the pinned checksum.');
}
if (!existsSync(destination)) writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 });
console.log(`Ready: ${destination}`);
console.log(`SHA-256: ${sha256}`);
console.log('Create a project in CodeAudit, then upload this ZIP. No upstream scripts or dependencies were run.');
