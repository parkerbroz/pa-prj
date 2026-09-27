import { createHash, randomUUID } from 'node:crypto';
import { AppError, cleanTags, people } from './core.js';

export const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

// These are individual, current sections on primary government sites, not code indexes.
// Each state needs separately verified section URLs before it is counted as configured.
export const BUILTIN_LAWS = [
  {
    id: 'law-federal-15-usc-45', title: '15 U.S.C. § 45 — Unfair or deceptive acts or practices',
    jurisdiction: 'federal', state: null, sourceName: 'U.S. House Office of the Law Revision Counsel',
    sourceUrl: 'https://uscode.house.gov/view.xhtml?req=%28title%3A15+section%3A45+edition%3Aprelim%29',
    summary: 'Federal Trade Commission Act section on unfair or deceptive acts or practices.',
    scopeTags: [], fetchAdapter: 'uscode',
  },
  {
    id: 'law-federal-reg-z-1026-16', title: '12 CFR § 1026.16 — Advertising (open-end credit)',
    jurisdiction: 'federal', state: null, sourceName: 'Electronic Code of Federal Regulations',
    sourceUrl: 'https://www.ecfr.gov/current/title-12/chapter-X/part-1026/subpart-B/section-1026.16',
    summary: 'Federal Regulation Z section on advertising open-end credit.', scopeTags: ['credit-card'],
    fetchAdapter: 'ecfr', ecfrTitle: 12, ecfrSection: '1026.16',
  },
  {
    id: 'law-federal-reg-z-1026-24', title: '12 CFR § 1026.24 — Advertising (closed-end credit)',
    jurisdiction: 'federal', state: null, sourceName: 'Electronic Code of Federal Regulations',
    sourceUrl: 'https://www.ecfr.gov/current/title-12/chapter-X/part-1026/subpart-C/section-1026.24',
    summary: 'Federal Regulation Z section on advertising closed-end credit.', scopeTags: ['personal-loan'],
    fetchAdapter: 'ecfr', ecfrTitle: 12, ecfrSection: '1026.24',
  },
  {
    id: 'law-ca-bpc-17500', title: 'California Business and Professions Code § 17500',
    jurisdiction: 'state', state: 'CA', sourceName: 'California Legislative Information',
    sourceUrl: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=17500.',
    summary: 'California false advertising statute.', scopeTags: ['state-ca'],
  },
  {
    id: 'law-ny-gbs-349', title: 'New York General Business Law § 349',
    jurisdiction: 'state', state: 'NY', sourceName: 'New York State Senate',
    sourceUrl: 'https://www.nysenate.gov/legislation/laws/GBS/349',
    summary: 'New York deceptive acts and practices statute.', scopeTags: ['state-ny'],
  },
  {
    id: 'law-fl-501-204', title: 'Florida Statutes § 501.204 (2026 edition)',
    jurisdiction: 'state', state: 'FL', sourceName: 'Florida Senate',
    sourceUrl: 'https://www.flsenate.gov/Laws/Statutes/2026/501.204',
    summary: 'Florida unlawful unfair or deceptive trade practices section; this URL is the 2026 edition.', scopeTags: ['state-fl'],
  },
  {
    id: 'law-ma-93a-2', title: 'Massachusetts General Laws ch. 93A, § 2',
    jurisdiction: 'state', state: 'MA', sourceName: 'Massachusetts Legislature',
    sourceUrl: 'https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXV/Chapter93A/Section2',
    summary: 'Massachusetts unfair or deceptive acts and practices section.', scopeTags: ['state-ma'],
  },
  {
    id: 'law-wa-19-86-020', title: 'Washington RCW 19.86.020',
    jurisdiction: 'state', state: 'WA', sourceName: 'Washington Legislature',
    sourceUrl: 'https://app.leg.wa.gov/rcw/default.aspx?cite=19.86.020',
    summary: 'Washington unfair competition and deceptive acts section.', scopeTags: ['state-wa'],
  },
  {
    id: 'law-mn-325f-69', title: 'Minnesota Statutes § 325F.69',
    jurisdiction: 'state', state: 'MN', sourceName: 'Minnesota Office of the Revisor of Statutes',
    sourceUrl: 'https://www.revisor.mn.gov/statutes/cite/325F.69',
    summary: 'Minnesota false statement in advertising section; source currently labels the 2025 statutes.', scopeTags: ['state-mn'],
  },
  {
    id: 'law-oh-1345-02', title: 'Ohio Revised Code § 1345.02',
    jurisdiction: 'state', state: 'OH', sourceName: 'Ohio Laws',
    sourceUrl: 'https://codes.ohio.gov/ohio-revised-code/section-1345.02',
    summary: 'Ohio unfair or deceptive consumer sales acts section.', scopeTags: ['state-oh'],
  },
  {
    id: 'law-nc-75-1-1', title: 'North Carolina General Statutes § 75-1.1',
    jurisdiction: 'state', state: 'NC', sourceName: 'North Carolina General Assembly',
    sourceUrl: 'https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_75/GS_75-1.1.html',
    summary: 'North Carolina unfair methods of competition and unfair or deceptive acts section.', scopeTags: ['state-nc'],
  },
  {
    id: 'law-az-44-1522', title: 'Arizona Revised Statutes § 44-1522',
    jurisdiction: 'state', state: 'AZ', sourceName: 'Arizona State Legislature',
    sourceUrl: 'https://www.azleg.gov/ars/44/01522.htm',
    summary: 'Arizona unlawful deceptive acts and practices section.', scopeTags: ['state-az'],
  },
  {
    id: 'law-me-5-207', title: 'Maine Revised Statutes tit. 5, § 207',
    jurisdiction: 'state', state: 'ME', sourceName: 'Maine Legislature',
    sourceUrl: 'https://legislature.maine.gov/statutes/5/title5sec207.html',
    summary: 'Maine unfair methods of competition and unfair or deceptive acts section.', scopeTags: ['state-me'],
  },
  {
    id: 'law-mo-407-020', title: 'Missouri Revised Statutes § 407.020',
    jurisdiction: 'state', state: 'MO', sourceName: 'Missouri Revisor of Statutes',
    sourceUrl: 'https://revisor.mo.gov/main/OneSection.aspx?section=407.020',
    summary: 'Missouri unlawful merchandising practices section.', scopeTags: ['state-mo'],
  },
  {
    id: 'law-ne-59-1602', title: 'Nebraska Revised Statute § 59-1602',
    jurisdiction: 'state', state: 'NE', sourceName: 'Nebraska Legislature',
    sourceUrl: 'https://nebraskalegislature.gov/laws/statutes.php?statute=59-1602',
    summary: 'Nebraska unfair methods of competition and deceptive acts section.', scopeTags: ['state-ne'],
  },
  {
    id: 'law-nh-358a-2', title: 'New Hampshire RSA 358-A:2',
    jurisdiction: 'state', state: 'NH', sourceName: 'New Hampshire General Court',
    sourceUrl: 'https://gc.nh.gov/rsa/html/XXXI/358-A/358-A-2.htm',
    summary: 'New Hampshire unfair or deceptive trade practices section.', scopeTags: ['state-nh'],
  },
  {
    id: 'law-ri-6-13-1-2', title: 'Rhode Island General Laws § 6-13.1-2',
    jurisdiction: 'state', state: 'RI', sourceName: 'Rhode Island General Assembly',
    sourceUrl: 'https://webserver.rilegislature.gov/Statutes/TITLE6/6-13.1/6-13.1-2.htm',
    summary: 'Rhode Island unfair or deceptive acts and practices section.', scopeTags: ['state-ri'],
  },
  {
    id: 'law-mt-30-14-103', title: 'Montana Code Annotated § 30-14-103 (2025 edition)',
    jurisdiction: 'state', state: 'MT', sourceName: 'Montana Legislature',
    sourceUrl: 'https://mca.legmt.gov/bills/mca/title_0300/chapter_0140/part_0010/section_0030/0300-0140-0010-0030.html',
    summary: 'Montana unfair trade practices section; source labels the 2025 code edition.', scopeTags: ['state-mt'],
  },
  {
    id: 'law-wv-46a-6-104', title: 'West Virginia Code § 46A-6-104',
    jurisdiction: 'state', state: 'WV', sourceName: 'West Virginia Legislature',
    sourceUrl: 'https://code.wvlegislature.gov/46A-6-104/',
    summary: 'West Virginia unfair or deceptive acts and practices section.', scopeTags: ['state-wv'],
    fetchAdapter: 'west-virginia',
  },
];

const MAX_TEXT_CHARS = 250_000;
const MAX_RESPONSE_BYTES = 1_500_000;
const hash = (text) => createHash('sha256').update(text).digest('hex');

function reviewer(actorId) {
  const actor = people.find((person) => person.id === actorId);
  if (!actor || actor.role === 'marketer') throw new AppError('Select a reviewer to manage documents.', 403);
  return actor;
}

function parsedUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(String(raw));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url;
  } catch {
    throw new AppError('Source URL must be an HTTP or HTTPS URL without credentials.');
  }
}

export function officialFetchUrl(raw) {
  const url = parsedUrl(raw);
  if (!url || url.protocol !== 'https:' || !url.hostname.toLowerCase().endsWith('.gov')) {
    throw new AppError('Automatic fetching requires an official HTTPS .gov source URL.');
  }
  return url;
}

function baseDocument(source, at) {
  return {
    ...source, sourceType: 'official', autoFetch: true, text: '', contentHash: null,
    sourceHash: null, version: 0, updatedAt: null, lastFetchedAt: null,
    lastAttemptAt: null, lastError: '', status: 'pending', createdAt: at,
    etag: null, httpLastModified: null, history: [],
  };
}

export function nextNightlyRun(now = new Date()) {
  const current = new Date(now);
  const next = new Date(current);
  next.setHours(2, 0, 0, 0);
  if (next <= current) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

function mostRecentNightly(now) {
  const current = new Date(now);
  const scheduled = new Date(current);
  scheduled.setHours(2, 0, 0, 0);
  if (scheduled > current) scheduled.setDate(scheduled.getDate() - 1);
  return scheduled;
}

export function shouldCatchUp(state, now = new Date()) {
  const last = state.documentSync?.lastFullRunAt;
  return !last || new Date(last) < mostRecentNightly(now);
}

export function ensureDocumentState(state, now = new Date()) {
  let changed = false;
  const at = new Date(now).toISOString();
  if (!Array.isArray(state.documents)) { state.documents = []; changed = true; }
  if (!state.documentSync) {
    state.documentSync = { lastRunAt: null, lastFullRunAt: null, lastSuccessAt: null,
      nextRunAt: nextNightlyRun(now), lastError: '', lastResult: null };
    changed = true;
  } else if (!Object.hasOwn(state.documentSync, 'lastFullRunAt')) {
    state.documentSync.lastFullRunAt = null;
    changed = true;
  }
  for (const source of BUILTIN_LAWS) {
    const existing = state.documents.find((document) => document.id === source.id);
    if (existing) {
      for (const key of ['title', 'jurisdiction', 'state', 'sourceName', 'sourceUrl', 'summary',
        'scopeTags', 'fetchAdapter', 'ecfrTitle', 'ecfrSection']) {
        if (JSON.stringify(existing[key]) !== JSON.stringify(source[key])) {
          if (source[key] === undefined) delete existing[key]; else existing[key] = source[key];
          if (key === 'sourceUrl') { existing.etag = null; existing.httpLastModified = null; }
          changed = true;
        }
      }
      continue;
    }
    if (state.documents.some((document) => document.sourceUrl === source.sourceUrl)) continue;
    state.documents.push(baseDocument(source, at));
    changed = true;
  }
  if (state.schemaVersion < 5 || !state.schemaVersion) { state.schemaVersion = 5; changed = true; }
  return changed;
}

export function stateCoverage(state) {
  const documents = state.documents || [];
  return Object.entries(STATES).map(([code, name]) => {
    const sources = documents.filter((document) => document.state === code && document.autoFetch);
    const available = sources.filter((document) => document.contentHash).length;
    return { code, name, configured: sources.length, available,
      status: available ? 'available' : sources.length ? 'pending' : 'not_configured' };
  });
}

export function saveDocument(state, input, at = new Date().toISOString()) {
  reviewer(input.actorId);
  const title = String(input.title || '').trim();
  if (title.length < 4 || title.length > 200) throw new AppError('Document title must be between 4 and 200 characters.');
  const jurisdiction = input.jurisdiction;
  if (!['federal', 'state'].includes(jurisdiction)) throw new AppError('Choose federal or state jurisdiction.');
  const stateCode = jurisdiction === 'state' ? String(input.state || '').toUpperCase() : null;
  if (jurisdiction === 'state' && !STATES[stateCode]) throw new AppError('Choose one of the 50 states.');
  const url = parsedUrl(input.sourceUrl);
  const text = String(input.text || '').trim();
  if (!url && !text) throw new AppError('Provide an official source URL or paste document text.');
  if (text.length > MAX_TEXT_CHARS) throw new AppError('Document text is too long; use a specific law section.');
  const autoFetch = Boolean(url && url.protocol === 'https:' && url.hostname.toLowerCase().endsWith('.gov'));
  if (!text && !autoFetch) throw new AppError('URL-only documents need an official HTTPS .gov source.');
  if (url && (state.documents || []).some((document) => document.sourceUrl === url.toString())) {
    throw new AppError('A document with this source URL already exists.', 409);
  }
  const scopeTags = cleanTags(input.scopeTags);
  if (stateCode && !scopeTags.includes(`state-${stateCode.toLowerCase()}`)) scopeTags.push(`state-${stateCode.toLowerCase()}`);
  const document = {
    id: randomUUID(), title, jurisdiction, state: stateCode,
    sourceName: String(input.sourceName || url?.hostname || 'Manual source').trim().slice(0, 160),
    sourceUrl: url?.toString() || '', summary: String(input.summary || '').trim().slice(0, 2000),
    scopeTags, sourceType: 'custom', autoFetch, text, contentHash: text ? hash(text) : null,
    sourceHash: null, version: text ? 1 : 0, createdAt: at, updatedAt: text ? at : null,
    lastFetchedAt: null, lastAttemptAt: null, lastError: '', status: text ? 'current' : 'pending',
    etag: null, httpLastModified: null, history: [],
  };
  state.documents ||= [];
  state.documents.push(document);
  state.configEvents ||= [];
  state.configEvents.push({ id: randomUUID(), type: 'document_created', actor: reviewer(input.actorId).name, detail: title, at });
  return document;
}

function decodeEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', sect: '§',
    mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…' };
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(number) && number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

export function extractSourceText(raw, contentType = 'text/html') {
  if (/text\/plain/i.test(contentType)) return raw.replace(/\r\n?/g, '\n').trim();
  return decodeEntities(raw
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|nav|header|footer|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\b[^>]*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|section|article|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\u00a0/g, ' ')
    .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
    .join('\n').trim();
}

async function responseText(response) {
  const sizeHeader = Number(response.headers?.get?.('content-length') || 0);
  if (sizeHeader > MAX_RESPONSE_BYTES) throw new AppError('Source response is too large; use a specific law section URL.');
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new AppError('Source response is too large; use a specific law section URL.');
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new AppError('Source response is too large; use a specific law section URL.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchLawDocument(document, fetchImpl = globalThis.fetch) {
  let url = officialFetchUrl(document.sourceUrl);
  let sourceAsOf = null;
  if (document.fetchAdapter === 'ecfr') {
    const metadataUrl = officialFetchUrl('https://www.ecfr.gov/api/versioner/v1/titles.json');
    const metadataResponse = await fetchImpl(metadataUrl, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    if (!metadataResponse.ok || !/json/i.test(metadataResponse.headers.get('content-type') || '')) {
      throw new AppError('eCFR did not return its current title dates.');
    }
    const metadata = await metadataResponse.json();
    sourceAsOf = metadata.titles?.find((title) => title.number === document.ecfrTitle)?.up_to_date_as_of;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceAsOf || '') || !/^\d+(?:\.\d+)*$/.test(document.ecfrSection || '')) {
      throw new AppError('eCFR current section metadata is missing or invalid.');
    }
    url = officialFetchUrl(`https://www.ecfr.gov/api/versioner/v1/full/${sourceAsOf}/title-${document.ecfrTitle}.xml?section=${document.ecfrSection}`);
  }
  const headers = { Accept: 'text/html, application/xhtml+xml, application/xml, text/plain' };
  if (document.etag) headers['If-None-Match'] = document.etag;
  if (document.httpLastModified) headers['If-Modified-Since'] = document.httpLastModified;
  for (let redirect = 0; redirect <= 3; redirect++) {
    const response = await fetchImpl(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    if (response.status >= 300 && response.status < 400 && response.status !== 304) {
      const location = response.headers.get('location');
      if (!location || redirect === 3) throw new AppError('Official source redirected too many times.');
      url = officialFetchUrl(new URL(location, url).toString());
      continue;
    }
    if (response.status === 304) return { id: document.id, kind: 'unchanged', checkedUrl: url.toString(), sourceAsOf };
    if (!response.ok) throw new AppError(`Official source returned HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || 'text/html';
    if (!/(text\/|xml|xhtml)/i.test(contentType)) throw new AppError('Source did not return HTML, XML, or text.');
    const raw = await responseText(response);
    let text = extractSourceText(raw, contentType);
    if (document.fetchAdapter === 'uscode') {
      const dateLabel = text.match(/Text contains those laws in effect on ([A-Za-z]+ \d{1,2}, \d{4})/i)?.[1];
      const parsedDate = dateLabel ? new Date(dateLabel) : null;
      if (!parsedDate || Number.isNaN(parsedDate.getTime())) throw new AppError('U.S. Code page did not report its currency date.');
      sourceAsOf = parsedDate.toISOString().slice(0, 10);
      const lines = text.split('\n');
      const start = lines.findIndex((line) => /^§45\. Unfair methods of competition/i.test(line));
      const end = lines.findIndex((line, index) => index > start && /^(Amendment of Section|Editorial Notes)$/i.test(line));
      if (start < 0 || end < 0 || end <= start + 1) throw new AppError('U.S. Code section text could not be isolated.');
      text = lines.slice(start, end).join('\n').trim();
    }
    if (document.fetchAdapter === 'west-virginia') {
      const lines = text.split('\n');
      const start = lines.findIndex((line) => /^§\s*46A-6-104\./i.test(line));
      const end = lines.findIndex((line, index) => index > start && /^Previous §/i.test(line));
      if (start < 0 || end < 0 || end <= start + 1) throw new AppError('West Virginia section text could not be isolated.');
      text = lines.slice(start, end).join('\n').trim();
    }
    if (text.length < 80 || /^(access denied|403 forbidden|just a moment)/i.test(text)
      || /request access.*aggressive automated scraping/i.test(text)) {
      throw new AppError('Source did not return usable law text.');
    }
    if (text.length > MAX_TEXT_CHARS) throw new AppError('Extracted text is too large; use a specific law section URL.');
    const contentHash = hash(text);
    return {
      id: document.id, kind: contentHash === document.contentHash ? 'unchanged' : 'fetched',
      checkedUrl: url.toString(), text, contentHash, sourceHash: hash(raw),
      sourceAsOf,
      etag: response.headers.get('etag'), httpLastModified: response.headers.get('last-modified'),
    };
  }
  throw new AppError('Official source redirected too many times.');
}

export function mergeDocumentResults(state, outcomes, at = new Date().toISOString(), scope = 'all') {
  const result = { created: 0, updated: 0, unchanged: 0, failed: 0, errors: [] };
  for (const outcome of outcomes) {
    const document = (state.documents || []).find((item) => item.id === outcome.id);
    if (!document) continue;
    document.lastAttemptAt = at;
    if (outcome.error) {
      document.status = 'error';
      document.lastError = String(outcome.error.message || outcome.error).slice(0, 500);
      result.failed++;
      result.errors.push({ sourceName: document.sourceName, title: document.title, message: document.lastError });
      continue;
    }
    const changed = outcome.kind === 'fetched' && outcome.contentHash !== document.contentHash;
    const initial = !document.contentHash;
    if (changed && !initial) {
      document.history ||= [];
      document.history.push({
        version: document.version, text: document.text, contentHash: document.contentHash,
        sourceHash: document.sourceHash, updatedAt: document.updatedAt,
        lastFetchedAt: document.lastFetchedAt, sourceAsOf: document.sourceAsOf || null,
        lastResolvedUrl: document.lastResolvedUrl || null,
      });
    }
    document.status = 'current';
    document.lastError = '';
    document.lastFetchedAt = at;
    if (outcome.checkedUrl) document.lastResolvedUrl = outcome.checkedUrl;
    if (outcome.sourceAsOf) document.sourceAsOf = outcome.sourceAsOf;
    if (outcome.etag) document.etag = outcome.etag;
    if (outcome.httpLastModified) document.httpLastModified = outcome.httpLastModified;
    if (changed) {
      document.text = outcome.text;
      document.contentHash = outcome.contentHash;
      document.sourceHash = outcome.sourceHash;
      document.version = (document.version || 0) + 1;
      document.updatedAt = at;
      result[initial ? 'created' : 'updated']++;
    } else result.unchanged++;
  }
  state.documentSync ||= {};
  state.documentSync.lastRunAt = at;
  if (scope === 'all') state.documentSync.lastFullRunAt = at;
  state.documentSync.lastScope = scope;
  if (!result.failed) state.documentSync.lastSuccessAt = at;
  state.documentSync.nextRunAt = nextNightlyRun(new Date(at));
  state.documentSync.lastError = result.failed ? `${result.failed} source${result.failed === 1 ? '' : 's'} could not be refreshed.` : '';
  state.documentSync.lastResult = result;
  return { ...result, lastRunAt: at, lastSuccessAt: state.documentSync.lastSuccessAt,
    nextRunAt: state.documentSync.nextRunAt };
}
