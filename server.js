import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AppError, seedState, createSubmission, addVersion, addComment, addManualFinding,
  resolveFinding, decide, publish, saveRule, saveStage, auditPackage, people, roleLabels,
} from './lib/core.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = join(root, 'public');
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
    return JSON.parse(await readFile(dataFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const initial = seedState();
    await mkdir(resolve(dataFile, '..'), { recursive: true });
    await writeFile(dataFile, JSON.stringify(initial, null, 2));
    return initial;
  }
}

let state = await loadState();
let writeQueue = Promise.resolve();

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

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(body));
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
    if (request.method === 'GET' && path === '/api/state') return sendJson(response, 200, { ...state, people, roleLabels });

    const auditMatch = path.match(/^\/api\/submissions\/([^/]+)\/audit$/);
    if (request.method === 'GET' && auditMatch) {
      const submission = state.submissions.find((item) => item.id === auditMatch[1]);
      if (!submission) throw new AppError('Submission not found.', 404);
      return sendJson(response, 200, auditPackage(submission), {
        'Content-Disposition': `attachment; filename="clearpath-${submission.number}-audit.json"`,
      });
    }

    if (!['POST', 'PATCH'].includes(request.method)) throw new AppError('Route not found.', 404);
    const body = await readJson(request);
    let result;
    if (request.method === 'POST' && path === '/api/submissions') result = await transaction((draft) => createSubmission(draft, body));
    else if (request.method === 'POST' && /^\/api\/submissions\/[^/]+\/versions$/.test(path)) {
      result = await transaction((draft) => addVersion(draft, path.split('/')[3], body));
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
    } else if (request.method === 'POST' && path === '/api/rules') {
      result = await transaction((draft) => saveRule(draft, null, body));
    } else if (request.method === 'PATCH' && /^\/api\/rules\/[^/]+$/.test(path)) {
      result = await transaction((draft) => saveRule(draft, path.split('/')[3], body));
    } else if (request.method === 'POST' && path === '/api/stages') {
      result = await transaction((draft) => saveStage(draft, null, body));
    } else if (request.method === 'PATCH' && /^\/api\/stages\/[^/]+$/.test(path)) {
      result = await transaction((draft) => saveStage(draft, path.split('/')[3], body));
    } else throw new AppError('Route not found.', 404);
    sendJson(response, 200, result);
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    if (status === 500) console.error(error);
    sendJson(response, status, { error: status === 500 ? 'Something went wrong.' : error.message });
  }
});

server.listen(port, host, () => console.log(`ClearPath running at http://${host}:${port}`));
