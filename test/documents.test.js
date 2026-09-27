import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_LAWS, ensureDocumentState, stateCoverage, saveDocument, fetchLawDocument,
  mergeDocumentResults, nextNightlyRun, shouldCatchUp,
} from '../lib/documents.js';
import { seedState, createSubmission, auditPackage } from '../lib/core.js';

const federalXml = `<?xml version="1.0"?><DIV8 N="1026.24" TYPE="SECTION">
  <HEAD>&sect; 1026.24 Advertising.</HEAD><P>If an advertisement for credit states a rate of finance charge,
  it shall state the rate as an annual percentage rate. An advertisement may state other rates only when the
  annual percentage rate is given appropriate prominence.</P></DIV8>`;

const californiaHtml = `<!doctype html><html><body><header>California Legislative Information</header>
  <div id="lawCode"><h2>17500.</h2><p>It is unlawful for any person, firm, corporation or association,
  with intent directly or indirectly to dispose of real or personal property, to make or disseminate
  any statement concerning that property which is untrue or misleading.</p></div></body></html>`;

function legacyState() {
  return { schemaVersion: 3, configEvents: [] };
}

function htmlResponse(html, extraHeaders = {}) {
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...extraHeaders } });
}

test('legacy stores receive a unique, idempotent official document catalog', () => {
  const state = legacyState();
  const now = new Date('2026-09-27T17:00:00.000Z');
  assert.equal(ensureDocumentState(state, now), true);
  assert.ok(state.schemaVersion > 3);
  assert.ok(Array.isArray(state.documents));
  assert.ok(state.documents.length >= BUILTIN_LAWS.length);
  assert.ok(state.documents.some((document) => document.jurisdiction === 'federal'));
  assert.ok(state.documents.some((document) => document.jurisdiction === 'state'));
  assert.equal(new Set(state.documents.map((document) => document.sourceUrl)).size, state.documents.length);
  assert.equal(state.documents.every((document) => document.autoFetch && document.status === 'pending'), true);
  assert.equal(state.documentSync.lastRunAt, null);

  const count = state.documents.length;
  assert.equal(ensureDocumentState(state, now), false);
  assert.equal(state.documents.length, count);
  const westVirginia = state.documents.find((document) => document.id === 'law-wv-46a-6-104');
  delete westVirginia.fetchAdapter;
  westVirginia.text = 'Existing captured law text';
  assert.equal(ensureDocumentState(state, now), true);
  assert.equal(westVirginia.fetchAdapter, 'west-virginia');
  assert.equal(westVirginia.text, 'Existing captured law text');
});

test('reviewers can add a state law; jurisdiction, URL, and duplicate source are validated', () => {
  const state = legacyState();
  ensureDocumentState(state);
  const sourceUrl = 'https://delcode.delaware.gov/title6/c025/sc02/index.html#2513';
  const input = {
    actorId: 'maya', title: 'Delaware Code § 2513',
    jurisdiction: 'state', state: 'de', sourceName: 'Delaware Code', sourceUrl,
    scopeTags: 'personal-loan', summary: 'Consumer protection statute.',
  };
  const document = saveDocument(state, input, '2026-09-27T17:00:00.000Z');
  assert.equal(document.jurisdiction, 'state');
  assert.equal(document.state, 'DE');
  assert.deepEqual(document.scopeTags, ['personal-loan', 'state-de']);
  assert.equal(document.autoFetch, true);
  assert.equal(document.status, 'pending');
  assert.equal(document.version, 0);
  assert.equal(state.documents.at(-1).id, document.id);
  assert.equal(state.configEvents.at(-1).type, 'document_created');

  assert.throws(() => saveDocument(state, input), /already exists/i);
  assert.throws(() => saveDocument(state, { ...input, actorId: 'alex', sourceUrl: 'https://delcode.delaware.gov/title6/c025/sc02/index.html#2514' }), /reviewer/i);
  assert.throws(() => saveDocument(state, { ...input, state: 'ZZ', sourceUrl: 'https://delcode.delaware.gov/title6/c025/sc02/index.html#2514' }), /50 states/i);
  assert.throws(() => saveDocument(state, { ...input, sourceUrl: 'javascript:alert(1)' }), /HTTP or HTTPS/i);
  assert.throws(() => saveDocument(state, { ...input, sourceUrl: 'https://user:secret@delcode.delaware.gov/title6/c025/sc02/index.html#2514' }), /credentials/i);
  assert.throws(() => saveDocument(state, { ...input, sourceUrl: 'https://example.com/statute' }), /official HTTPS \.gov/i);
});

test('pasted document text is retained without scheduling an unofficial URL for fetching', () => {
  const state = legacyState();
  ensureDocumentState(state);
  const document = saveDocument(state, {
    actorId: 'sam', title: 'Internal review memo', jurisdiction: 'federal',
    sourceUrl: 'https://example.com/source', text: 'Reviewer supplied reference text for this example.',
  });
  assert.equal(document.autoFetch, false);
  assert.equal(document.status, 'current');
  assert.equal(document.version, 1);
  assert.match(document.contentHash, /^[0-9a-f]{64}$/);
  assert.equal(document.text, 'Reviewer supplied reference text for this example.');
});

test('state coverage distinguishes configured sources from successfully fetched text', async () => {
  const state = legacyState();
  ensureDocumentState(state);
  const coverage = stateCoverage(state);
  assert.equal(coverage.length, 50);
  assert.equal(coverage.find((item) => item.code === 'CA').status, 'pending');
  const unconfigured = coverage.find((item) => item.status === 'not_configured');
  assert.ok(unconfigured, 'states without a verified source are reported');

  const california = state.documents.find((item) => item.id === 'law-ca-bpc-17500');
  const fetched = await fetchLawDocument(california, async () => htmlResponse(californiaHtml));
  mergeDocumentResults(state, [fetched], '2026-09-27T17:00:00.000Z');
  const refreshed = stateCoverage(state);
  assert.equal(refreshed.find((item) => item.code === 'CA').status, 'available');
  assert.equal(refreshed.find((item) => item.code === unconfigured.code).status, 'not_configured');
});

test('official state HTML is fetched and reduced to readable law text', async () => {
  const state = legacyState();
  ensureDocumentState(state);
  const document = state.documents.find((item) => item.id === 'law-ca-bpc-17500');
  const calls = [];
  const fetched = await fetchLawDocument(document, async (url, options) => {
    calls.push({ url: String(url), options });
    return htmlResponse(californiaHtml, { etag: '"v1"', 'last-modified': 'Sat, 26 Sep 2026 12:00:00 GMT' });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, document.sourceUrl);
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(fetched.kind, 'fetched');
  assert.match(fetched.text, /untrue or misleading/);
  assert.match(fetched.contentHash, /^[0-9a-f]{64}$/);
  assert.equal(fetched.etag, '"v1"');
});

test('federal sections use the current dated eCFR XML API instead of blocked HTML', async () => {
  const state = legacyState();
  ensureDocumentState(state);
  const document = state.documents.find((item) => item.id === 'law-federal-reg-z-1026-24');
  const calls = [];
  const fetched = await fetchLawDocument(document, async (url) => {
    calls.push(String(url));
    if (calls.length === 1) return Response.json({ titles: [{ number: 12, up_to_date_as_of: '2026-09-24' }] });
    return new Response(federalXml, { headers: { 'content-type': 'application/xml' } });
  });
  assert.match(calls[0], /titles\.json$/);
  assert.match(calls[1], /full\/2026-09-24\/title-12\.xml\?section=1026\.24/);
  assert.equal(fetched.sourceAsOf, '2026-09-24');
  assert.match(fetched.text, /annual percentage rate/);
  assert.doesNotMatch(fetched.text, /<DIV8|<P>/);
});

test('U.S. Code import retains the official currency date', async () => {
  const state = legacyState();
  ensureDocumentState(state);
  const document = state.documents.find((item) => item.id === 'law-federal-15-usc-45');
  const html = '<main><p>Text contains those laws in effect on September 26, 2026</p><h1>§45. Unfair methods of competition unlawful; prevention by Commission</h1><p>Unfair or deceptive acts or practices in or affecting commerce are unlawful.</p><h2>Editorial Notes</h2><p>Prior amendment notes.</p></main>';
  const fetched = await fetchLawDocument(document, async () => htmlResponse(html));
  assert.equal(fetched.sourceAsOf, '2026-09-26');
  assert.match(fetched.text, /Unfair or deceptive acts/);
  assert.doesNotMatch(fetched.text, /Text contains those laws in effect on/);
});

test('West Virginia import isolates the statute from changing website chrome', async () => {
  const state = legacyState();
  ensureDocumentState(state);
  const document = state.documents.find((item) => item.id === 'law-wv-46a-6-104');
  const page = (date, loadTime) => `<html><body><header>${date} Menu</header><p>Chapter navigation ${loadTime}</p>
    <h1>§46A-6-104. Unlawful acts or practices.</h1><p>Unfair methods of competition and unfair or deceptive acts or practices in the conduct of any trade or commerce are hereby declared unlawful.</p>
    <p>Previous §46A-6-103. Rules and regulations.</p><footer>Site links ${loadTime}</footer></body></html>`;
  const first = await fetchLawDocument(document, async () => htmlResponse(page('Sunday, September 27, 2026', '0.003732919')));
  document.contentHash = first.contentHash;
  const second = await fetchLawDocument(document, async () => htmlResponse(page('Monday, September 28, 2026', '0.005467891')));
  assert.equal(second.kind, 'unchanged');
  assert.match(first.text, /Unfair methods of competition/);
  assert.doesNotMatch(first.text, /Chapter navigation|Previous §|Site links/);
});

test('conditional responses avoid a new version and redirects cannot leave official sources', async () => {
  const state = legacyState();
  ensureDocumentState(state);
  const document = state.documents.find((item) => item.id === 'law-ca-bpc-17500');
  document.etag = '"known"';
  let requestHeaders;
  const unchanged = await fetchLawDocument(document, async (_url, options) => {
    requestHeaders = options.headers;
    return new Response(null, { status: 304 });
  });
  assert.equal(requestHeaders['If-None-Match'], '"known"');
  assert.equal(unchanged.kind, 'unchanged');

  let requests = 0;
  await assert.rejects(fetchLawDocument(document, async () => {
    requests++;
    return new Response(null, { status: 302, headers: { location: 'https://example.com/landing' } });
  }), /official HTTPS \.gov/i);
  assert.equal(requests, 1);
  await assert.rejects(fetchLawDocument(document, async () => new Response('%PDF-1.7', {
    status: 200, headers: { 'content-type': 'application/pdf' },
  })), /HTML, XML, or text/i);
});

test('sync imports changes once and preserves last good content when a source fails', async () => {
  const state = legacyState();
  ensureDocumentState(state);
  const document = state.documents.find((item) => item.id === 'law-ca-bpc-17500');
  const first = await fetchLawDocument(document, async () => htmlResponse(californiaHtml));
  const at1 = '2026-09-27T17:00:00.000Z';
  assert.equal(mergeDocumentResults(state, [first], at1).created, 1);
  assert.equal(document.status, 'current');
  assert.equal(document.version, 1);
  assert.equal(document.contentHash, first.contentHash);
  assert.equal(state.documentSync.lastSuccessAt, at1);

  const same = await fetchLawDocument(document, async () => htmlResponse(californiaHtml));
  assert.equal(same.kind, 'unchanged');
  assert.equal(mergeDocumentResults(state, [same], '2026-09-28T17:00:00.000Z').unchanged, 1);
  assert.equal(document.version, 1);
  const revisedHtml = californiaHtml.replace('untrue or misleading', 'false or misleading in its presentation');
  const revised = await fetchLawDocument(document, async () => htmlResponse(revisedHtml));
  assert.equal(mergeDocumentResults(state, [revised], '2026-09-29T17:00:00.000Z').updated, 1);
  assert.equal(document.version, 2);
  assert.match(document.text, /false or misleading in its presentation/);
  assert.equal(document.history.length, 1);
  assert.equal(document.history[0].contentHash, first.contentHash);
  assert.match(document.history[0].text, /untrue or misleading/);

  const goodText = document.text;
  const goodHash = document.contentHash;
  const lastSuccess = state.documentSync.lastSuccessAt;
  const failure = mergeDocumentResults(state, [{ id: document.id, error: new Error('HTTP 503') }], '2026-09-30T17:00:00.000Z');
  assert.equal(failure.failed, 1);
  assert.equal(failure.errors[0].title, document.title);
  assert.equal(document.status, 'error');
  assert.equal(document.lastError, 'HTTP 503');
  assert.equal(document.text, goodText);
  assert.equal(document.contentHash, goodHash);
  assert.equal(document.version, 2);
  assert.equal(stateCoverage(state).find((item) => item.code === 'CA').status, 'available');
  assert.equal(state.documentSync.lastSuccessAt, lastSuccess);
  assert.equal(state.documentSync.lastRunAt, '2026-09-30T17:00:00.000Z');
});

test('MR audit export retains the exact law text captured before a later update', async () => {
  const state = seedState();
  ensureDocumentState(state);
  const document = state.documents.find((item) => item.id === 'law-ca-bpc-17500');
  const original = await fetchLawDocument(document, async () => htmlResponse(californiaHtml));
  mergeDocumentResults(state, [original], '2026-09-27T17:00:00.000Z');
  const mr = createSubmission(state, {
    actorId: 'alex', title: 'California campaign', tags: 'state-ca',
    content: 'California campaign content for human review.',
  });
  const reference = mr.versions[0].documentReferences.find((item) => item.id === document.id);
  assert.equal(reference.contentHash, original.contentHash);
  const revised = await fetchLawDocument(document, async () => htmlResponse(californiaHtml.replace('untrue or misleading', 'false or misleading')));
  mergeDocumentResults(state, [revised], '2026-09-28T17:00:00.000Z');
  const exported = auditPackage(mr, state);
  const saved = exported.sourceDocuments.find((item) => item.id === document.id);
  assert.equal(saved.version, 1);
  assert.equal(saved.contentHash, original.contentHash);
  assert.match(saved.text, /untrue or misleading/);
  assert.doesNotMatch(saved.text, /false or misleading/);
});

test('nightly run is scheduled at local 2 a.m. and a missed run catches up once', () => {
  const before = new Date(2026, 8, 27, 1, 59);
  const dueToday = new Date(nextNightlyRun(before));
  assert.equal(dueToday.getFullYear(), 2026);
  assert.equal(dueToday.getMonth(), 8);
  assert.equal(dueToday.getDate(), 27);
  assert.equal(dueToday.getHours(), 2);
  assert.equal(dueToday.getMinutes(), 0);
  const atSchedule = new Date(2026, 8, 27, 2, 0);
  const dueTomorrow = new Date(nextNightlyRun(atSchedule));
  assert.equal(dueTomorrow.getDate(), 28);
  assert.equal(dueTomorrow.getHours(), 2);

  const state = legacyState();
  ensureDocumentState(state, before);
  assert.equal(shouldCatchUp(state, new Date(2026, 8, 27, 3, 0)), true);
  const attemptAt = new Date(2026, 8, 27, 2, 10).toISOString();
  const failedDocument = state.documents[0];
  mergeDocumentResults(state, [{ id: failedDocument.id, error: new Error('Network unavailable') }], attemptAt, 'federal');
  assert.equal(shouldCatchUp(state, new Date(2026, 8, 27, 3, 0)), true);
  mergeDocumentResults(state, [{ id: failedDocument.id, error: new Error('Network unavailable') }], attemptAt);
  assert.equal(shouldCatchUp(state, new Date(2026, 8, 27, 3, 0)), false);
  assert.equal(shouldCatchUp(state, new Date(2026, 8, 28, 1, 59)), false);
  assert.equal(shouldCatchUp(state, new Date(2026, 8, 28, 2, 1)), true);
});
