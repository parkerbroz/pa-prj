import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AppError, seedState, createSubmission, addVersion, addComment, addManualFinding,
  resolveFinding, decide, publish, closeSubmission, saveRule, deleteRule,
  saveStage, deleteStage, savePipeline, completeAiCheck, currentVersion,
  migrateOrphanChecks, recoverPendingAiChecks, listPipelines, previewRoute,
  auditPackage, people, roleLabels,
} from './lib/core.js';
import { evaluateAiCheck } from './lib/ai.js';
import {
  ensureDocumentState, saveDocument, fetchLawDocument, mergeDocumentResults,
  nextNightlyRun, shouldCatchUp, stateCoverage, STATES,
} from './lib/documents.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = join(root, 'public');
// Keep local secrets out of source control. Explicit process environment
// values take precedence over the optional development .env file.
async function loadLocalEnv() {
  let source;
  try { source = await readFile(join(root, '.env'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const line of source.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    const value = match[2].trim();
    process.env[match[1]] = (/^(['"]).*\1$/.test(value) ? value.slice(1, -1) : value);
  }
}
await loadLocalEnv();
const dataFile = resolve(process.env.DATA_FILE || join(root, 'data', 'store.json'));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function loadState() {
  try {
    const saved = JSON.parse(await readFile(dataFile, 'utf8'));
    const migratedChecks = migrateOrphanChecks(saved);
    const recoveredChecks = recoverPendingAiChecks(saved);
    const changed = ensureDocumentState(saved) || migratedChecks || recoveredChecks > 0;
    if (changed) await writeFile(dataFile, JSON.stringify(saved, null, 2));
    return saved;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const initial = seedState();
    ensureDocumentState(initial);
    await mkdir(resolve(dataFile, '..'), { recursive: true });
    await writeFile(dataFile, JSON.stringify(initial, null, 2));
    return initial;
  }
}

let state = await loadState();
let writeQueue = Promise.resolve();
let documentSyncRunning = false;
let nightlyTimer;
const aiEnabled = process.env.AI_CHECKS_ENABLED === '1' && Boolean(process.env.OPENAI_API_KEY);
const aiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function transaction(action) {
  const pending = writeQueue.then(async () => {
    const draft = structuredClone(state);
    const result = action(draft);
    const tempFile = `${dataFile}.${process.pid}.tmp`;
    await writeFile(tempFile, JSON.stringify(draft, null, 2));
    await rename(tempFile, dataFile);
    state = draft;
    return result;
  });
  writeQueue = pending.then(() => {}, () => {});
  return pending;
}

async function runPendingAiChecks(submissionId, versionId) {
  const submission = state.submissions.find((item) => item.id === submissionId);
  const version = submission?.versions.find((item) => item.id === versionId);
  if (!version) return submission;
  const pending = version.checks.filter((check) => check.status === 'pending' && check.kind === 'ai');
  await Promise.all(pending.map(async (check) => {
    let outcome;
    if (!aiEnabled) {
      outcome = { status: 'error', explanation: 'AI checks are disabled or no API key is configured.', evidence: '', model: null };
    } else {
      try {
        outcome = await evaluateAiCheck(check, version, { apiKey: process.env.OPENAI_API_KEY, model: aiModel });
      } catch {
        outcome = { status: 'error', explanation: 'AI service was unavailable or returned an invalid result.', evidence: '', model: aiModel };
      }
    }
    await transaction((draft) => completeAiCheck(draft, submissionId, versionId, check.id, outcome));
  }));
  return state.submissions.find((item) => item.id === submissionId);
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(body));
}

function requireDocumentReviewer(actorId) {
  const person = people.find((item) => item.id === actorId);
  if (!person || person.role === 'marketer') throw new AppError('Select a reviewer to sync documents.', 403);
}

async function fetchTargets(targets) {
  const outcomes = new Array(targets.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(5, targets.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= targets.length) return;
      const document = targets[index];
      try { outcomes[index] = await fetchLawDocument(document); }
      catch (error) { outcomes[index] = { id: document.id, error }; }
    }
  }));
  return outcomes;
}

async function runDocumentSync(jurisdiction = 'all') {
  if (!['all', 'federal', 'state'].includes(jurisdiction)) throw new AppError('Choose all, federal, or state sources.');
  if (documentSyncRunning) throw new AppError('A document sync is already running.', 409);
  documentSyncRunning = true;
  try {
    const targets = structuredClone(state.documents.filter((document) =>
      document.autoFetch && document.sourceUrl && (jurisdiction === 'all' || document.jurisdiction === jurisdiction)));
    const outcomes = await fetchTargets(targets);
    return await transaction((draft) => mergeDocumentResults(draft, outcomes, new Date().toISOString(), jurisdiction));
  } finally {
    documentSyncRunning = false;
  }
}

function scheduleNightlySync() {
  clearTimeout(nightlyTimer);
  const next = nextNightlyRun();
  state.documentSync.nextRunAt = next;
  async function runNightly() {
    if (documentSyncRunning) {
      nightlyTimer = setTimeout(runNightly, 60_000);
      nightlyTimer.unref();
      return;
    }
    try { await runDocumentSync('all'); }
    catch (error) { console.error('Nightly document sync failed:', error); }
    scheduleNightlySync();
  }
  nightlyTimer = setTimeout(runNightly, Math.max(1, new Date(next).getTime() - Date.now()));
  nightlyTimer.unref();
}

async function readJson(request) {
  if (!String(request.headers['content-type'] || '').startsWith('application/json')) throw new AppError('Send JSON content.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8_000_000) throw new AppError('Request is too large.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError('Invalid JSON body.'); }
}

async function serveStatic(pathname, response) {
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!['index.html', 'app.js', 'styles.css', 'favicon.svg'].includes(file)) throw new AppError('Page not found.', 404);
  const buffer = await readFile(join(publicRoot, file));
  response.writeHead(200, { 'Content-Type': mimeTypes[extname(file)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  response.end(buffer);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const path = url.pathname;
    if (!path.startsWith('/api/')) return await serveStatic(path, response);
    if (request.method === 'GET' && path === '/api/health') return sendJson(response, 200, { ok: true });
    if (request.method === 'GET' && path === '/api/state') return sendJson(response, 200, {
      ...state,
      documents: state.documents.map(({ text, history, ...document }) => ({ ...document, textLength: text.length })),
      stateCoverage: stateCoverage(state), states: STATES,
      documentSync: { ...state.documentSync, running: documentSyncRunning },
      pipelines: listPipelines(state), people, roleLabels, aiEnabled, aiModel,
    });
    if (request.method === 'GET' && path === '/api/route-preview') return sendJson(response, 200, previewRoute(state, url.searchParams.get('tags') || ''));

    const documentMatch = path.match(/^\/api\/documents\/([^/]+)$/);
    if (request.method === 'GET' && documentMatch) {
      const document = state.documents.find((item) => item.id === documentMatch[1]);
      if (!document) throw new AppError('Document not found.', 404);
      const requestedVersion = url.searchParams.get('version');
      const revision = requestedVersion && Number(requestedVersion) !== document.version
        ? (document.history || []).find((item) => item.version === Number(requestedVersion)) : null;
      if (requestedVersion && Number(requestedVersion) !== document.version && !revision) {
        throw new AppError('Document version not found.', 404);
      }
      const { history, ...current } = document;
      return sendJson(response, 200, revision
        ? { ...current, ...revision, sourceAsOf: revision.sourceAsOf || null,
          status: 'historical', history: history.map(({ text, ...item }) => item) }
        : { ...current, history: (history || []).map(({ text, ...item }) => item) });
    }

    const auditMatch = path.match(/^\/api\/submissions\/([^/]+)\/audit$/);
    if (request.method === 'GET' && auditMatch) {
      const submission = state.submissions.find((item) => item.id === auditMatch[1]);
      if (!submission) throw new AppError('Submission not found.', 404);
      return sendJson(response, 200, auditPackage(submission, state), {
        'Content-Disposition': `attachment; filename="clearpath-${submission.number}-audit.json"`,
      });
    }

    if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) throw new AppError('Route not found.', 404);
    const body = await readJson(request);
    let result;
    let aiVersionId = null;
    if (request.method === 'POST' && path === '/api/documents/sync') {
      requireDocumentReviewer(body.actorId);
      result = await runDocumentSync(body.jurisdiction || 'all');
    } else if (request.method === 'POST' && path === '/api/documents') {
      result = await transaction((draft) => saveDocument(draft, body));
    } else if (request.method === 'POST' && path === '/api/submissions') {
      result = await transaction((draft) => createSubmission(draft, body));
      aiVersionId = currentVersion(result).id;
    }
    else if (request.method === 'POST' && /^\/api\/submissions\/[^/]+\/versions$/.test(path)) {
      result = await transaction((draft) => addVersion(draft, path.split('/')[3], body));
      aiVersionId = currentVersion(result).id;
    } else if (request.method === 'POST' && /^\/api\/submissions\/[^/]+\/comments$/.test(path)) {
      result = await transaction((draft) => addComment(draft, path.split('/')[3], body));
    } else if (request.method === 'POST' && /^\/api\/submissions\/[^/]+\/findings$/.test(path)) {
      result = await transaction((draft) => addManualFinding(draft, path.split('/')[3], body));
    } else if (request.method === 'PATCH' && /^\/api\/submissions\/[^/]+\/findings\/[^/]+$/.test(path)) {
      result = await transaction((draft) => resolveFinding(draft, path.split('/')[3], path.split('/')[5], body));
    } else if (request.method === 'POST' && /^\/api\/submissions\/[^/]+\/decisions$/.test(path)) {
      result = await transaction((draft) => decide(draft, path.split('/')[3], body));
    } else if (request.method === 'POST' && /^\/api\/submissions\/[^/]+\/publish$/.test(path)) {
      result = await transaction((draft) => publish(draft, path.split('/')[3], body));
    } else if (request.method === 'POST' && /^\/api\/submissions\/[^/]+\/close$/.test(path)) {
      result = await transaction((draft) => closeSubmission(draft, path.split('/')[3], body));
    } else if (request.method === 'POST' && path === '/api/rules') {
      result = await transaction((draft) => saveRule(draft, null, body));
    } else if (request.method === 'PATCH' && /^\/api\/rules\/[^/]+$/.test(path)) {
      result = await transaction((draft) => saveRule(draft, path.split('/')[3], body));
    } else if (request.method === 'DELETE' && /^\/api\/rules\/[^/]+$/.test(path)) {
      result = await transaction((draft) => deleteRule(draft, path.split('/')[3], body));
    } else if (request.method === 'POST' && path === '/api/stages') {
      result = await transaction((draft) => saveStage(draft, null, body));
    } else if (request.method === 'PATCH' && /^\/api\/stages\/[^/]+$/.test(path)) {
      result = await transaction((draft) => saveStage(draft, path.split('/')[3], body));
    } else if (request.method === 'DELETE' && /^\/api\/stages\/[^/]+$/.test(path)) {
      result = await transaction((draft) => deleteStage(draft, path.split('/')[3], body));
    } else if (request.method === 'POST' && path === '/api/pipelines') {
      result = await transaction((draft) => savePipeline(draft, null, body));
    } else if (request.method === 'PATCH' && /^\/api\/pipelines\/[^/]+$/.test(path)) {
      result = await transaction((draft) => savePipeline(draft, path.split('/')[3], body));
    } else throw new AppError('Route not found.', 404);
    if (aiVersionId) result = await runPendingAiChecks(result.id, aiVersionId);
    sendJson(response, 200, result);
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    if (status === 500) console.error(error);
    sendJson(response, status, { error: status === 500 ? 'Something went wrong.' : error.message });
  }
});

server.listen(port, host, () => console.log(`ClearPath running at http://${host}:${port}`));
if (process.env.DOCUMENT_SYNC_DISABLED !== '1') {
  scheduleNightlySync();
  if (shouldCatchUp(state)) {
    queueMicrotask(() => runDocumentSync('all').catch((error) => console.error('Document sync catch-up failed:', error)));
  }
}
