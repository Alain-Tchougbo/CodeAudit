import { open, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

class CliError extends Error {}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const archiveLimit = 10 * 1024 * 1024;
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CliError('Réponse API invalide.'); return value as Record<string, unknown>; }
function setting(value: string | undefined, fallback: number, min: number, max: number): number {
  const number = value === undefined ? fallback : Number(value); if (!Number.isSafeInteger(number) || number < min || number > max) throw new CliError('Paramètre de délai invalide.'); return number;
}
async function archive(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const file = await open(path, 'r');
  try {
    const info = await file.stat(); if (!info.isFile() || !info.size || info.size > archiveLimit) throw new CliError('Archive ZIP requise, non vide et limitée à 10 Mio.');
    const buffer = Buffer.alloc(archiveLimit + 1); let total = 0;
    while (total < buffer.length) { const { bytesRead } = await file.read(buffer, total, Math.min(65536, buffer.length - total), total); if (!bytesRead) break; total += bytesRead; }
    if (!total || total > archiveLimit) throw new CliError('Archive ZIP limitée à 10 Mio.'); return Uint8Array.from(buffer.subarray(0, total));
  } finally { await file.close(); }
}
async function bytes(response: Response, max = 16 * 1024 * 1024): Promise<Uint8Array> {
  if (!response.body || Number(response.headers.get('content-length')) > max) throw new CliError('Réponse API vide ou trop volumineuse.');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; if (length > max) throw new CliError('Réponse API trop volumineuse.'); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks);
}
async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') { console.log('CodeAudit CI: --api-url ORIGINE --project UUID --archive sources.zip [--report rapport.json]\nSecret requis dans CODEAUDIT_TOKEN. Codes: 0 seuils respectés, 1 seuils dépassés, 2 erreur technique ou configuration manquante.'); return 0; }
  const input: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]; const value = args[index + 1];
    if (!key || !['--api-url', '--project', '--archive', '--report'].includes(key) || !value || value.startsWith('--') || Object.hasOwn(input, key)) throw new CliError('Arguments invalides ; utilisez --help.'); input[key] = value;
  }
  const origin = input['--api-url']; const project = input['--project']; const path = input['--archive']; const token = process.env.CODEAUDIT_TOKEN;
  if (!origin || !project || !uuid.test(project) || !path || !token || !/^ca_[a-f0-9]{64}$/.test(token)) throw new CliError('Origine API, projet UUID, archive et CODEAUDIT_TOKEN valides sont requis.');
  const url = new URL(origin); const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new CliError('Utilisez une origine HTTPS, ou HTTP sur loopback uniquement, sans identifiants ni chemin.');
  const deadline = Date.now() + setting(process.env.CODEAUDIT_WAIT_MS, 120000, 1000, 3600000);
  const poll = setting(process.env.CODEAUDIT_POLL_MS, 1000, 50, 10000);
  async function request(pathname: string, body?: FormData): Promise<Uint8Array> {
    const remaining = deadline - Date.now(); if (remaining <= 0) throw new CliError('Délai d’attente de l’intégration dépassé.');
    const response = await fetch(new URL(pathname, url), { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}` }, body, redirect: 'error', signal: AbortSignal.timeout(Math.min(30000, remaining)) });
    const data = await bytes(response);
    if (!response.ok) { let code = ''; try { const parsed = record(JSON.parse(Buffer.from(data).toString('utf8'))); if (typeof parsed.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(parsed.code)) code = ` ${parsed.code}`; } catch { /* Never print provider bodies or credentials. */ } throw new CliError(`Requête CodeAudit refusée : HTTP ${response.status}${code}.`); }
    return data;
  }
  const json = async (pathname: string, body?: FormData) => record(JSON.parse(Buffer.from(await request(pathname, body)).toString('utf8')));
  const form = new FormData(); form.append('archive', new Blob([await archive(resolve(path))], { type: 'application/zip' }), basename(path));
  const created = await json(`/api/projects/${project}/analyses`, form); const id = created.id;
  if (typeof id !== 'string' || !uuid.test(id) || created.projectId !== project.toLowerCase()) throw new CliError('Identifiant d’analyse invalide.');
  for (;;) {
    const analysis = await json(`/api/analyses/${id}`);
    if (analysis.status === 'SUCCEEDED') break;
    if (analysis.status === 'FAILED' || analysis.status === 'CANCELLED') throw new CliError(`Traitement ${analysis.status} : aucun rapport réussi.`);
    if (analysis.status !== 'QUEUED' && analysis.status !== 'RUNNING') throw new CliError('État d’analyse invalide.');
    if (Date.now() >= deadline) throw new CliError('Délai d’attente de l’intégration dépassé.'); await delay(Math.min(poll, Math.max(1, deadline - Date.now())));
  }
  const gate = await json(`/api/analyses/${id}/quality-gate`);
  if (gate.analysisId !== id || gate.schemaVersion !== 1 || !['PASS', 'FAIL', 'NOT_CONFIGURED', 'UNAVAILABLE'].includes(String(gate.status))) throw new CliError('Décision qualité invalide.');
  const observed = gate.observed === null ? null : record(gate.observed);
  if (gate.status === 'PASS' || gate.status === 'FAIL') {
    if (!observed || ![observed.errorCount, observed.warningCount].every(value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) || !Array.isArray(gate.criteria) || gate.criteria.length !== 2) throw new CliError('Compteurs qualité invalides.');
  }
  if (input['--report']) {
    const reportPath = resolve(input['--report']); const report = await request(`/api/analyses/${id}/report`);
    // Preserve the exact server export; the gate remains a separate, versioned sidecar.
    await writeFile(reportPath, report, { mode: 0o600 }); await writeFile(`${reportPath}.gate.json`, `${JSON.stringify(gate, null, 2)}\n`, { mode: 0o600 });
  }
  console.log(JSON.stringify({ analysisId: id, qualityGate: gate.status, errorCount: observed?.errorCount ?? null, warningCount: observed?.warningCount ?? null }));
  if (gate.status === 'NOT_CONFIGURED' || gate.status === 'UNAVAILABLE') throw new CliError('Aucun seuil actif figé ou décision indisponible ; validation CI impossible.');
  return gate.status === 'PASS' ? 0 : 1;
}
try { process.exitCode = await main(); }
catch (error) { console.error(error instanceof CliError ? error.message : 'Erreur technique de l’intégration CodeAudit.'); process.exitCode = 2; }
