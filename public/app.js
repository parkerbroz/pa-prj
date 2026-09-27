const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const toastRoot = document.getElementById('toast-root');

let data;
const ui = {
  page: 'mrs', mrId: null, pipelineId: 'default', stageId: null, versionId: null, detailTab: 'review',
  query: '', status: 'all', tags: [], previewTags: '', modal: null,
  documentQuery: '', documentJurisdiction: 'all', documentState: '', documentId: null,
  documentMrId: null, documentVersionId: null, syncJurisdiction: 'all', syncingDocuments: false,
  actorId: localStorage.getItem('review-actor') || localStorage.getItem('clearpath-actor') || 'maya',
};

const icons = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M19 12H5m6 6-6-6 6-6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  alert: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v4m0 4h.01"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  close: '<path d="M5 5l14 14M19 5 5 19"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
};
const icon = (name, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
const h = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const date = (value) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
const time = (value) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const currentVersion = (mr) => mr.versions.at(-1);
const selectedVersion = (mr) => mr.versions.find((version) => version.id === ui.versionId) || currentVersion(mr);
const actor = () => data.people.find((person) => person.id === ui.actorId) || data.people[1];
const findingsFor = (mr, version) => mr.findings.filter((finding) => finding.versionId === version.id);
const decisionsFor = (mr, version) => mr.decisions.filter((decision) => decision.versionId === version.id);
const nextStage = (mr) => currentVersion(mr).stagePlan.find((stage) => !decisionsFor(mr, currentVersion(mr)).some((decision) => decision.stageId === stage.id && decision.action === 'approved'));
const statusName = (status) => ({ in_review: 'In review', changes_requested: 'Changes requested', approved: 'Approved', published: 'Published', closed: 'Closed' })[status] || status;
const pill = (label, kind = '') => `<span class="pill ${kind}">${h(label)}</span>`;
const tagPills = (tags) => tags.length ? tags.map((tag) => pill(tag, 'tag')).join('') : '<span class="muted">No tags</span>';
const statusPill = (status) => pill(statusName(status), `status-${status}`);
const canConfigure = () => actor().role !== 'marketer';
const validTime = (value) => value && !Number.isNaN(new Date(value).getTime()) ? time(value) : '—';
const safeUrl = (value) => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
};
const documents = () => Array.isArray(data.documents) ? data.documents : [];
const documentStatus = (item) => item.status === 'error'
  ? pill('Fetch error', 'status-changes_requested')
  : item.status === 'pending' ? pill('Pending fetch', 'status-in_review') : pill('Available', 'status-approved');
const documentChecked = (item) => item.lastFetchedAt ? `Checked ${validTime(item.lastFetchedAt)}`
  : item.autoFetch ? 'Not fetched yet' : 'Manual reference';
function documentsForVersion(version) {
  const tags = new Set((version.tags || []).map((tag) => tag.toLowerCase()));
  return documents().filter((item) => {
    if (item.jurisdiction === 'state' && item.state && !tags.has(`state-${item.state.toLowerCase()}`)) return false;
    return (item.scopeTags || []).every((tag) => tags.has(tag.toLowerCase()));
  });
}

function readRoute() {
  const parts = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
  if (parts[0] === 'documents') {
    ui.page = 'documents'; ui.documentMrId = parts[1] === 'mr' ? parts[2] || null : null;
    ui.documentVersionId = ui.documentMrId ? parts[3] || null : null;
  } else if (parts[0] === 'pipeline' && parts[2] === 'stages') {
    ui.page = 'stage'; ui.pipelineId = parts[1]; ui.stageId = parts[3] === 'new' ? null : parts[3] || null;
  } else if (parts[0] === 'pipeline' && parts[1] === 'stages') {
    ui.page = 'stage'; ui.pipelineId = 'default'; ui.stageId = parts[2] === 'new' ? null : parts[2] || null;
  } else if (parts[0] === 'pipeline') {
    ui.page = 'pipeline'; ui.pipelineId = parts[1] || 'default'; ui.stageId = null;
  } else if (parts[0] === 'mrs' && parts[1]) {
    ui.page = 'mr'; ui.mrId = parts[1];
  } else { ui.page = 'mrs'; ui.mrId = null; }
}
function go(page, id = null) {
  const path = page === 'pipeline' ? `/pipeline/${id || ui.pipelineId || 'default'}`
    : page === 'stage' ? `/pipeline/${ui.pipelineId || 'default'}/stages/${id || 'new'}`
      : page === 'mr' ? `/mrs/${id}`
        : page === 'documents' ? '/documents'
          : page === 'mr-documents' ? `/documents/mr/${ui.mrId}/${ui.versionId || currentVersion(data.submissions.find((mr) => mr.id === ui.mrId)).id}`
            : '/mrs';
  if (location.hash !== `#${path}`) location.hash = path;
  else { readRoute(); render(); }
  window.scrollTo(0, 0);
}
async function request(method, path, body) {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
async function refresh() { data = await request('GET', '/api/state'); render(); }
let previewSequence = 0;
async function loadPreview() {
  const target = document.getElementById('preview-results');
  if (!target) return;
  const sequence = ++previewSequence;
  target.innerHTML = '<div class="empty compact">Checking route…</div>';
  try {
    const route = await request('GET', `/api/route-preview?tags=${encodeURIComponent(ui.previewTags)}`);
    if (sequence === previewSequence && document.getElementById('preview-results')) {
      document.getElementById('preview-results').innerHTML = previewResults(route);
    }
  } catch (error) {
    if (sequence === previewSequence && document.getElementById('preview-results')) {
      document.getElementById('preview-results').innerHTML = `<p class="hint warning">${h(error.message)}</p>`;
    }
  }
}
function toast(message, kind = '') {
  toastRoot.innerHTML = `<div class="toast ${kind}">${h(message)}</div>`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toastRoot.innerHTML = ''; }, 4000);
}
async function mutate(method, path, body, message) {
  try {
    const result = await request(method, path, { ...body, actorId: ui.actorId });
    ui.modal = null;
    await refresh();
    toast(message);
    return result;
  } catch (error) { toast(error.message, 'error'); return null; }
}

function shell(content) {
  const selected = actor();
  return `<div class="app-shell">
    <header class="topbar"><div class="topbar-inner"><button class="workspace-name" data-nav="mrs">Review workspace</button><nav aria-label="Main navigation"><button class="nav-link ${['mrs','mr'].includes(ui.page) ? 'active' : ''}" data-nav="mrs">MRs</button><button class="nav-link ${['pipeline','stage'].includes(ui.page) ? 'active' : ''}" data-nav="pipeline">Pipelines</button><button class="nav-link ${ui.page === 'documents' ? 'active' : ''}" data-nav="documents">Documents</button></nav><label class="user-switch"><span>Viewing as</span><select id="actor-select" aria-label="Demo user">${data.people.map((person) => `<option value="${person.id}" ${person.id === selected.id ? 'selected' : ''}>${h(person.name)} · ${h(data.roleLabels[person.role])}</option>`).join('')}</select></label></div></header>
    <main class="page">${content}</main>
  </div>`;
}

function mrList() {
  const tags = [...new Set(data.submissions.flatMap((mr) => currentVersion(mr).tags))].sort();
  const query = ui.query.trim().toLowerCase();
  const items = data.submissions.filter((mr) => {
    const version = currentVersion(mr);
    return (ui.status === 'all' || mr.status === ui.status)
      && ui.tags.every((tag) => version.tags.includes(tag))
      && (!query || `${mr.number} ${mr.title} ${mr.owner} ${version.tags.join(' ')}`.toLowerCase().includes(query));
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `<div class="page-heading"><div><div class="eyebrow">REVIEW QUEUE</div><h1>MRs</h1><p>Marketing materials awaiting review and approval.</p></div><button class="button primary" data-action="new-mr">${icon('plus')} New MR</button></div>
    <div class="panel"><div class="toolbar"><label class="search">${icon('search')}<input id="mr-search" type="search" placeholder="Search MRs, owners, tags" value="${h(ui.query)}" /></label><select id="status-filter" aria-label="Filter by status"><option value="all">All statuses</option>${['in_review','changes_requested','approved','published','closed'].map((status) => `<option value="${status}" ${ui.status === status ? 'selected' : ''}>${statusName(status)}</option>`).join('')}</select><select id="tag-add" aria-label="Add tag filter" ${ui.tags.length === tags.length ? 'disabled' : ''}><option value="">+ Add tag filter</option>${tags.filter((tag) => !ui.tags.includes(tag)).map((tag) => `<option value="${h(tag)}">${h(tag)}</option>`).join('')}</select></div>${ui.tags.length ? `<div class="active-filters"><span>Matching all tags:</span>${ui.tags.map((tag) => `<button class="filter-chip" data-remove-tag="${h(tag)}" aria-label="Remove ${h(tag)} filter">${h(tag)} ${icon('close', 12)}</button>`).join('')}<button class="link-button" data-action="clear-tags">Clear</button></div>` : ''}
    <div class="table-wrap"><table><thead><tr><th>MR</th><th>Tags</th><th>Owner</th><th>Next step</th><th>Updated</th><th>Status</th></tr></thead><tbody>${items.map((mr) => {
      const version = currentVersion(mr);
      const next = mr.status === 'closed' ? 'Closed' : mr.status === 'changes_requested' ? 'Marketing revision'
        : mr.status === 'approved' ? 'Ready to publish' : mr.status === 'published' ? 'Complete'
          : version.checks.some((check) => check.status === 'pending') ? 'Running AI checks'
            : findingsFor(mr, version).some((finding) => finding.status === 'open') ? 'Resolve findings'
              : nextStage(mr)?.name || 'Complete';
      return `<tr data-open="${mr.id}" tabindex="0" role="button" aria-label="Open MR ${mr.number}"><td><strong>${h(mr.title)}</strong><small>MR #${mr.number} · v${version.number}${findingsFor(mr, version).filter((finding) => finding.status === 'open').length ? ` · ${findingsFor(mr, version).filter((finding) => finding.status === 'open').length} open findings` : ''}</small></td><td><div class="pill-row">${tagPills(version.tags.slice(0, 3))}${version.tags.length > 3 ? pill(`+${version.tags.length - 3}`, 'tag') : ''}</div></td><td>${h(mr.owner)}</td><td>${h(next)}</td><td class="nowrap">${date(mr.updatedAt)}</td><td>${statusPill(mr.status)}</td></tr>`;
    }).join('')}</tbody></table>${items.length ? '' : '<div class="empty">No MRs match these filters.</div>'}</div><div class="table-footer">${items.length} of ${data.submissions.length} MRs</div></div>`;
}

function contentPanel(version) {
  return `<section class="panel section"><div class="section-heading"><h2>Material</h2><span class="mono">SHA-256 ${version.hash.slice(0, 12)}</span></div><div class="copy">${h(version.content).replace(/\n/g, '<br>')}</div><div class="subtle-row">Submitted by ${h(version.author)} · ${time(version.createdAt)}</div>${version.referenceUrl ? `<div class="resource-row"><span>Source URL</span><a href="${h(version.referenceUrl)}" target="_blank" rel="noopener noreferrer">${h(version.referenceUrl)}</a></div>` : ''}${version.asset ? `<div class="resource-row"><span>Attachment</span><a href="${h(version.asset.data)}" target="_blank" rel="noopener noreferrer">${h(version.asset.name)}</a></div>${version.asset.mime.startsWith('image/') ? `<img class="asset-preview" src="${h(version.asset.data)}" alt="Attached marketing material" />` : ''}` : ''}</section>`;
}
function comparisonPanel(mr, version) {
  const prior = mr.versions.find((item) => item.number === version.number - 1);
  if (!prior) return '';
  return `<details class="panel disclosure"><summary>Compare v${prior.number} → v${version.number}</summary><div class="compare"><div><h3>Version ${prior.number}</h3><p>${h(prior.content)}</p><div class="pill-row">${tagPills(prior.tags)}</div></div><div><h3>Version ${version.number}</h3><p>${h(version.content)}</p><div class="pill-row">${tagPills(version.tags)}</div></div></div></details>`;
}
function checksPanel(version) {
  const pending = version.checks.filter((check) => check.status === 'pending').length;
  const flagged = version.checks.filter((check) => check.passed === false).length;
  return `<section class="panel section"><div class="section-heading"><div><h2>Stage checks <span class="count">${version.checks.length}</span></h2><p>Matching checks run when this version is submitted, before human approval. AI results are advisory.</p></div>${pill(pending ? `${pending} pending` : flagged ? `${flagged} need review` : 'All clear', pending || flagged ? 'status-changes_requested' : 'status-approved')}</div><div class="item-list">${version.checks.map((check) => {
    const status = check.status || (check.passed ? 'passed' : 'flagged');
    const label = ({ passed: 'Passed', flagged: 'Review', error: 'Unavailable', pending: 'Running' })[status] || status;
    return `<div class="list-item"><span class="result-icon ${status === 'passed' ? 'passed' : 'failed'}">${icon(status === 'passed' ? 'check' : 'alert')}</span><div class="item-body"><strong>${h(check.name)}</strong><small>${check.kind === 'ai' ? 'AI · ' : ''}${check.pipelineId === 'default' && version.pipeline?.id !== 'default' ? 'Baseline · ' : ''}${h(check.stageName || 'Legacy check')} · ${h(check.category)} · ${h(check.source)} · check v${check.ruleVersion}${check.model ? ` · ${h(check.model)}` : ''}</small>${check.explanation ? `<p>${h(check.explanation)}</p>` : ''}${check.evidence ? `<p>${h(check.evidence)}</p>` : ''}</div><span class="muted">${label}</span></div>`;
  }).join('') || '<div class="empty compact">No checks applied to this version.</div>'}</div></section>`;
}
function findingsPanel(mr, version, isCurrent) {
  const findings = findingsFor(mr, version);
  const editable = isCurrent && canConfigure() && !['approved', 'published', 'closed'].includes(mr.status);
  return `<section class="panel section"><div class="section-heading"><h2>Findings <span class="count">${findings.length}</span></h2>${editable ? '<button class="button" data-action="manual-finding">+ Add finding</button>' : ''}</div><div class="item-list">${findings.map((finding) => `<div class="finding"><div class="finding-head"><strong>${h(finding.title)}</strong><span>${pill(finding.severity, `severity-${finding.severity}`)} ${pill(finding.status.replace('_', ' '), finding.status === 'open' ? 'status-changes_requested' : 'status-approved')}</span></div><p>${h(finding.body)}</p>${finding.evidence ? `<blockquote>${h(finding.evidence)}</blockquote>` : ''}<small>${h(finding.createdBy)} · ${time(finding.createdAt)}</small>${finding.status === 'open' && editable ? `<button class="link-button" data-action="resolve-finding" data-id="${finding.id}">Resolve finding →</button>` : ''}${finding.status !== 'open' ? `<div class="resolution">${h(finding.resolution)} · ${h(finding.resolvedBy)}</div>` : ''}</div>`).join('') || '<div class="empty compact">No findings on this version.</div>'}</div></section>`;
}
function discussionPanel(mr, version, isCurrent) {
  const comments = mr.comments.filter((comment) => comment.versionId === version.id);
  return `<section class="panel section"><div class="section-heading"><h2>Discussion <span class="count">${comments.length}</span></h2></div><div class="item-list">${comments.map((comment) => `<div class="comment"><div><strong>${h(comment.author)}</strong><small>${h(data.roleLabels[comment.role])} · ${time(comment.at)}</small></div><p>${h(comment.body)}</p></div>`).join('') || '<div class="empty compact">No comments yet.</div>'}</div>${isCurrent && mr.status !== 'closed' ? '<form data-form="comment" class="comment-form"><textarea name="body" rows="3" required placeholder="Add a comment…"></textarea><button class="button" type="submit">Post comment</button></form>' : ''}</section>`;
}
function pipelineProgress(mr, version, isCurrent) {
  const approvals = new Set(decisionsFor(mr, version).filter((item) => item.action === 'approved').map((item) => item.stageId));
  const open = findingsFor(mr, version).filter((item) => item.status === 'open').length;
  const pending = version.checks.filter((item) => item.status === 'pending').length;
  const stopped = isCurrent && mr.status === 'closed';
  const next = version.stagePlan.find((stage) => !approvals.has(stage.id));
  const checksState = pending ? ['current', `${pending} running`] : open ? ['attention', `${open} finding${open === 1 ? '' : 's'}`] : ['done', 'Complete'];
  const steps = [
    { label: 'Submitted', state: 'done', detail: `v${version.number}` },
    { label: 'Checks', state: checksState[0], detail: checksState[1] },
    ...version.stagePlan.map((stage) => ({
      label: stage.name,
      state: approvals.has(stage.id) ? 'done' : !stopped && next?.id === stage.id && isCurrent ? 'current' : 'waiting',
      detail: approvals.has(stage.id) ? 'Approved' : stopped ? 'Stopped'
        : next?.id === stage.id && isCurrent ? mr.status === 'changes_requested' ? 'Changes requested' : open || pending ? 'Blocked' : 'Current' : 'Waiting',
    })),
    { label: 'Publish', state: isCurrent && mr.status === 'published' ? 'done'
      : isCurrent && mr.status === 'approved' ? 'current' : 'waiting',
    detail: isCurrent && mr.status === 'published' ? 'Published' : stopped ? 'Stopped'
      : isCurrent && mr.status === 'approved' ? 'Ready' : 'Waiting' },
  ];
  return `<section class="panel progress-panel" aria-label="Pipeline progress"><div class="progress-heading"><div><strong>${h(version.pipeline?.name || 'Default review (legacy)')}</strong><span>${approvals.size} of ${version.stagePlan.length} approvals complete${stopped ? ' · MR closed' : !isCurrent ? ' · historical version' : ''}</span></div>${pill(stopped ? 'Closed' : mr.status === 'changes_requested' && isCurrent ? 'Changes requested' : next && isCurrent ? `At ${next.name}` : isCurrent ? statusName(mr.status) : 'Past version', stopped ? 'status-closed' : '')}</div><div class="progress-track">${steps.map((step, index) => `<div class="progress-step ${step.state}"><span class="progress-node">${step.state === 'done' ? icon('check', 13) : index + 1}</span><strong>${h(step.label)}</strong><small>${h(step.detail)}</small></div>`).join('')}</div></section>`;
}
function routePanel(mr, version, isCurrent) {
  const decisions = decisionsFor(mr, version);
  const pending = findingsFor(mr, version).filter((finding) => finding.status === 'open').length;
  const running = version.checks.filter((check) => check.status === 'pending').length;
  const current = isCurrent ? nextStage(mr) : null;
  let actions = '';
  if (isCurrent && mr.status === 'closed') actions = `<p class="hint">Closed by ${h(mr.closedBy || 'a reviewer')}. ${h(mr.closeReason || '')}</p>`;
  else if (isCurrent && mr.status === 'approved') actions = actor().role === 'marketer' ? '<button class="button primary full" data-action="publish">Mark published</button>' : '<p class="hint">Approved. Switch to Marketing to mark it published.</p>';
  else if (isCurrent && mr.status === 'published') actions = '<p class="hint">This version was marked published.</p>';
  else if (isCurrent && mr.status === 'changes_requested') actions = actor().role === 'marketer' ? '<button class="button primary full" data-action="new-version">Submit revision</button>' : '<p class="hint">Waiting for a marketing revision.</p>';
  else if (isCurrent && current) actions = `${running ? `<p class="hint warning">Wait for ${running} AI check${running === 1 ? '' : 's'} to finish.</p>` : ''}${pending ? `<p class="hint warning">Resolve ${pending} open finding${pending === 1 ? '' : 's'} before approval.</p>` : ''}${actor().role === current.role ? `<button class="button primary full" data-action="approve" ${pending || running ? 'disabled' : ''}>Approve ${h(current.name)}</button><button class="button full" data-action="request-changes">Request changes</button>` : `<p class="hint">Next reviewer: ${h(data.roleLabels[current.role] || current.role)}.</p><button class="button full" data-action="switch-role" data-role="${h(current.role)}">Switch to reviewer</button>`}`;
  return `<aside class="panel route"><h2>Approval route</h2><p>Pipeline: ${h(version.pipeline?.name || 'Default review (legacy)')} · v${version.number}. A revision starts a new route.</p><ol>${version.stagePlan.map((stage) => {
    const approval = decisions.find((decision) => decision.stageId === stage.id && decision.action === 'approved');
    const state = approval ? 'done' : current?.id === stage.id ? 'current' : 'waiting';
    return `<li class="${state}"><span class="step-dot">${approval ? icon('check', 13) : version.stagePlan.indexOf(stage) + 1}</span><div><strong>${h(stage.name)}</strong><small>${h(data.roleLabels[stage.role] || stage.role)}${approval ? ` · ${h(approval.actor)}` : ''}</small></div><span class="step-state">${approval ? 'Approved' : state === 'current' ? 'Current' : 'Waiting'}</span></li>`;
  }).join('')}</ol><div class="route-actions">${actions}</div></aside>`;
}
function fileChange(version, prior) {
  if (!version.asset) return prior?.asset ? 'Attachment removed' : 'Copy only';
  if (!prior?.asset) return `Attachment added: ${version.asset.name}`;
  return version.asset.data === prior.asset.data && version.asset.name === prior.asset.name
    ? `Attachment unchanged: ${version.asset.name}` : `Attachment updated: ${version.asset.name}`;
}
function historyPanel(mr, selected) {
  return `<div class="history-grid history-files"><div class="history-main"><section class="panel section"><div class="section-heading"><div><h2>File & version history</h2><p>Choose a version to inspect the exact copy and attachment reviewed.</p></div></div><div class="item-list">${[...mr.versions].reverse().map((version) => {
    const prior = mr.versions.find((item) => item.number === version.number - 1);
    return `<button class="version-row ${selected.id === version.id ? 'selected' : ''}" data-version="${version.id}"><strong>v${version.number}</strong><span><b>${time(version.createdAt)} · ${h(version.author)}</b><small>${h(fileChange(version, prior))}</small><small>${prior ? version.content === prior.content ? 'Copy unchanged' : 'Copy changed' : 'Initial copy'} · ${h(version.tags.join(', ') || 'No tags')}</small><small>Pipeline: ${h(version.pipeline?.name || 'Default review (legacy)')} · SHA-256 ${version.hash.slice(0, 12)}</small></span></button>`;
  }).join('')}</div></section>${contentPanel(selected)}${comparisonPanel(mr, selected)}</div><section class="panel section"><div class="section-heading"><h2>Activity</h2><button class="button" data-action="export-audit">${icon('download')} Export audit</button></div><div class="timeline">${[...mr.events].reverse().map((entry) => `<div class="event"><div><strong>${h(entry.detail)}</strong><small>${h(entry.actor)} · ${time(entry.at)}</small></div></div>`).join('')}</div></section></div>`;
}
function referenceDocumentsPanel(version) {
  const captured = Array.isArray(version.documentReferences);
  const matching = captured ? version.documentReferences : documentsForVersion(version);
  return `<section class="panel section"><div class="section-heading"><div><h2>${captured ? 'Sources captured for this version' : 'Matching reference documents'} <span class="count">${matching.length}</span></h2><p>${captured ? 'Source versions recorded at submission. Reviewers decide which requirements apply.' : 'Live matches by MR tags and state. Reviewers decide which requirements apply.'}</p></div><button class="button" data-action="mr-documents">Browse current library →</button></div>${matching.length ? `<div class="document-reference-list">${matching.map((item) => `<div><span><strong>${h(item.title)}</strong><small>${captured ? `v${h(item.version)} · SHA-256 ${h(item.contentHash?.slice(0, 12) || '—')}` : `${h(item.jurisdiction === 'state' ? item.state || 'State' : 'Federal')} · ${h(item.sourceName)}`}</small></span>${captured ? `<button class="link-button" data-action="view-document-snapshot" data-id="${h(item.id)}" data-document-version="${h(item.version)}">Read captured text</button>` : ''}</div>`).join('')}</div>` : '<p class="hint">No documents were recorded for this version. Browse the full library or add a source.</p>'}</section>`;
}
function mrPage() {
  const mr = data.submissions.find((item) => item.id === ui.mrId);
  if (!mr) return '<div class="empty">MR not found. <button class="link-button" data-nav="mrs">Back to MRs</button></div>';
  const version = selectedVersion(mr);
  const isCurrent = version.id === currentVersion(mr).id;
  return `<button class="back-link" data-nav="mrs">${icon('back')} All MRs</button>
    <div class="page-heading detail-heading"><div><div class="eyebrow">MR #${mr.number}</div><h1>${h(mr.title)}</h1><div class="meta">${isCurrent ? statusPill(mr.status) : pill('Historical version')}<span>Owner ${h(mr.owner)}</span><span>Updated ${date(mr.updatedAt)}</span></div><div class="pill-row">${tagPills(version.tags)}</div></div>
      <div class="heading-actions"><button class="button" data-action="export-audit">${icon('download')} Audit package</button>${isCurrent && !['closed', 'published'].includes(mr.status) ? '<button class="button" data-action="close-mr">Close MR</button>' : ''}${isCurrent && mr.status !== 'closed' && actor().role === 'marketer' ? '<button class="button primary" data-action="new-version">+ New version</button>' : ''}</div></div>
    <div class="view-tabs"><button class="${ui.detailTab === 'review' ? 'active' : ''}" data-tab="review">Review</button><button class="${ui.detailTab === 'history' ? 'active' : ''}" data-tab="history">Files & history</button><label>Version <select id="version-select">${[...mr.versions].reverse().map((item) => `<option value="${item.id}" ${item.id === version.id ? 'selected' : ''}>v${item.number}${item.id === currentVersion(mr).id ? ' · current' : ''}</option>`).join('')}</select></label></div>
    ${pipelineProgress(mr, version, isCurrent)}
    ${ui.detailTab === 'history' ? historyPanel(mr, version) : `<div class="detail-layout"><div class="detail-main">${contentPanel(version)}${comparisonPanel(mr, version)}${referenceDocumentsPanel(version)}${checksPanel(version)}${findingsPanel(mr, version, isCurrent)}${discussionPanel(mr, version, isCurrent)}</div>${routePanel(mr, version, isCurrent)}</div>`}`;
}

function checkRow(rule) {
  const behavior = rule.kind === 'ai' ? `AI review · ${h(rule.instruction || '')}`
    : `${rule.kind === 'required' ? 'Require' : 'Flag'} “${h(rule.term)}”`;
  return `<div class="check-config ${rule.active ? '' : 'paused'}"><div><strong>${h(rule.name)}</strong><small>${behavior} · ${h(rule.category)} · ${h(rule.source)} · v${rule.version}</small><div class="pill-row">${rule.scopeTags.length ? tagPills(rule.scopeTags) : pill('Every MR in this stage', 'tag')}${pill(rule.active ? 'Active' : 'Paused')}</div></div>${canConfigure() ? `<button class="button small" data-action="edit-rule" data-id="${rule.id}">Edit</button>` : ''}</div>`;
}
function previewResults(route) {
  if (!route.pipeline) return '<p class="hint warning">No active pipeline matched these tags.</p>';
  const selected = route.pipeline;
  const reason = selected.scopeTags.length
    ? `Matched all required tags: ${selected.scopeTags.join(', ')}.`
    : 'No more-specific active pipeline matched, so the default applies.';
  return `<div class="preview-choice"><span>SELECTED PIPELINE</span><strong>${h(selected.name)}</strong><p>${h(reason)}</p></div>
    ${route.matches.length > 1 ? `<p class="preview-explain">${route.matches.length} pipelines matched. The one with the most required tags wins; priority breaks ties.</p>` : ''}
    <div class="preview-group"><strong>Approval stages · ${route.stages.length}</strong>${route.stages.map((stage, index) => `<div>${index + 1}. ${h(stage.name)} <span>${h(data.roleLabels[stage.role])}</span></div>`).join('') || '<p>No active stages matched.</p>'}</div>
    <div class="preview-group"><strong>Preflight checks · ${route.rules.length}</strong>${route.rules.map((rule) => `<div>${h(rule.name)} <span>${rule.baseline ? 'Baseline · ' : ''}${h(rule.stageName || 'Pipeline')}</span></div>`).join('') || '<p>No active checks matched.</p>'}</div>`;
}
function pipelinePage() {
  const pipeline = data.pipelines.find((item) => item.id === ui.pipelineId) || data.pipelines[0];
  ui.pipelineId = pipeline.id;
  const stages = data.stages.filter((stage) => !stage.deletedAt && (stage.pipelineId || 'default') === pipeline.id).sort((a, b) => a.order - b.order);
  const routingFields = pipeline.id === 'default'
    ? '<p class="hint">This fallback is always active. Checks in its stages apply to every pipeline as a baseline; its approval stages run when no specialized pipeline matches. To assign tags, create another pipeline.</p>'
    : `<label class="field"><span>Required MR tags</span><input name="scopeTags" placeholder="e.g. affiliate, high-risk" value="${h(pipeline.scopeTags.join(', '))}" ${canConfigure() ? '' : 'disabled'} /><small>An MR must have every tag listed here.</small></label><div class="field-grid"><label class="field"><span>Tie-break priority</span><input name="priority" type="number" min="-100" max="100" value="${pipeline.priority}" ${canConfigure() ? '' : 'disabled'} /><small>Higher wins only when pipelines require the same number of tags.</small></label><label class="checkbox"><input name="active" type="checkbox" ${pipeline.active ? 'checked' : ''} ${canConfigure() ? '' : 'disabled'} /> Active pipeline</label></div>${!pipeline.active ? '<p class="hint">Draft pipelines do not route MRs. Add an unconditional active stage, set required tags, then activate.</p>' : ''}`;
  return `<div class="page-heading"><div><div class="eyebrow">WORKFLOW CONFIGURATION</div><h1>Pipelines</h1><p>Create a pipeline, assign required tags, then add its approval stages.</p></div>${canConfigure() ? `<div class="heading-actions"><button class="button" data-action="new-stage">+ Add stage</button><button class="button primary" data-action="new-pipeline">${icon('plus')} New pipeline</button></div>` : ''}</div>
    <div class="pipeline-picker">${data.pipelines.map((item) => `<button class="pipeline-choice ${item.id === pipeline.id ? 'selected' : ''}" data-pipeline="${item.id}"><strong>${h(item.name)}</strong><small>${item.scopeTags.length ? `Requires ${h(item.scopeTags.join(' + '))}` : 'Default · all MRs'} · ${item.active ? 'Active' : 'Draft'}</small></button>`).join('')}</div>
    <div class="builder-layout"><div>
      <section class="panel section"><div class="section-heading"><div><h2>${h(pipeline.name)} settings</h2><p>${pipeline.id === 'default' ? 'Fallback route when no specialized pipeline matches.' : 'All required tags must be present on an MR for this pipeline to match.'}</p></div>${pill(pipeline.active ? 'Active' : 'Draft', pipeline.active ? 'status-approved' : '')}</div>
        <form data-form="pipeline" class="settings-form"><label class="field"><span>Name</span><input name="name" required maxlength="120" value="${h(pipeline.name)}" ${canConfigure() ? '' : 'disabled'} /></label>${routingFields}${canConfigure() ? '<div class="form-actions"><button class="button primary" type="submit">Save pipeline</button></div>' : ''}</form></section>
      <section class="panel section"><div class="section-heading"><div><h2>Stages <span class="count">${stages.length}</span></h2><p>Approvals run in order. Open a stage to create or edit its checks.</p></div>${canConfigure() ? '<button class="button" data-action="new-stage">+ Add stage</button>' : ''}</div><div class="stage-list">${stages.map((stage) => { const count = data.rules.filter((rule) => !rule.deletedAt && rule.stageId === stage.id).length; return `<button class="stage-row ${stage.active ? '' : 'paused'}" data-stage="${stage.id}"><span class="stage-number">${stage.order}</span><span class="stage-details"><strong>${h(stage.name)}</strong><small>${h(data.roleLabels[stage.role])} · ${count} ${count === 1 ? 'check' : 'checks'} · ${stage.active ? 'Active' : 'Paused'}</small><span class="pill-row">${stage.scopeTags.length ? tagPills(stage.scopeTags) : pill('Every MR in this pipeline', 'tag')}</span></span><span class="chevron">→</span></button>`; }).join('') || '<div class="empty compact">No stages yet. Add one before activating this pipeline.</div>'}</div></section>
      <details class="panel disclosure"><summary>Configuration history</summary><div class="config-history">${[...data.configEvents].reverse().map((entry) => `<div>${h(entry.detail)}<small>${h(entry.actor)} · ${time(entry.at)}</small></div>`).join('') || '<div class="empty compact">No changes yet.</div>'}</div></details>
    </div><aside class="panel section preview"><h2>Test MR tags</h2><p>This tests all active pipelines using the same routing logic as a real submission. It does not change any MR.</p><label class="field"><span>MR tags</span><input id="preview-tags" placeholder="e.g. affiliate, high-risk" value="${h(ui.previewTags)}" /></label><div id="preview-results"></div></aside></div>`;
}
function stagePage() {
  const stage = ui.stageId ? data.stages.find((item) => item.id === ui.stageId) : null;
  if (ui.stageId && (!stage || stage.deletedAt)) return '<div class="empty">Stage not found. <button class="link-button" data-nav="pipeline">Back to pipeline</button></div>';
  const pipelineId = stage?.pipelineId || ui.pipelineId || 'default';
  const pipeline = data.pipelines.find((item) => item.id === pipelineId);
  if (!pipeline) return '<div class="empty">Pipeline not found. <button class="link-button" data-nav="pipeline">Back to pipelines</button></div>';
  ui.pipelineId = pipeline.id;
  const siblings = data.stages.filter((item) => !item.deletedAt && (item.pipelineId || 'default') === pipeline.id);
  const rules = stage ? data.rules.filter((rule) => !rule.deletedAt && rule.stageId === stage.id) : [];
  return `<button class="back-link" data-nav="pipeline">${icon('back')} ${h(pipeline.name)}</button>
    <div class="page-heading"><div><div class="eyebrow">STAGE BUILDER · ${h(pipeline.name)}</div><h1>${h(stage?.name || 'New stage')}</h1><p>Configure one approval step inside this pipeline.</p></div><div class="heading-actions">${stage ? pill(`v${stage.version}`) : ''}${stage && canConfigure() ? '<button class="button danger" data-action="delete-stage">Delete stage</button>' : ''}</div></div>
    <div class="builder-layout"><div><section class="panel section"><div class="section-heading"><h2>Stage settings</h2></div><form data-form="stage" class="settings-form"><label class="field"><span>Name</span><input name="name" required maxlength="120" placeholder="e.g. State review" value="${h(stage?.name)}" ${canConfigure() ? '' : 'disabled'} /></label><div class="field-grid"><label class="field"><span>Reviewer team</span><select name="role" ${canConfigure() ? '' : 'disabled'}>${Object.entries(data.roleLabels).filter(([role]) => role !== 'marketer').map(([role, label]) => `<option value="${role}" ${stage?.role === role ? 'selected' : ''}>${h(label)}</option>`).join('')}</select></label><label class="field"><span>Order in pipeline</span><input name="order" type="number" min="1" max="100" required value="${stage?.order || siblings.length + 1}" ${canConfigure() ? '' : 'disabled'} /></label></div><label class="field"><span>Additional required MR tags</span><input name="scopeTags" placeholder="Leave empty for every MR in this pipeline" value="${h(stage?.scopeTags.join(', '))}" ${canConfigure() ? '' : 'disabled'} /><small>Optional. An active pipeline needs at least one stage without additional tags.</small></label><label class="checkbox"><input name="active" type="checkbox" ${stage?.active !== false ? 'checked' : ''} ${canConfigure() ? '' : 'disabled'} /> Active stage</label>${canConfigure() ? `<div class="form-actions"><button class="button primary" type="submit">${stage ? 'Save stage' : 'Create stage'}</button></div>` : '<p class="hint">Switch to a reviewer to change this stage.</p>'}</form></section>
      <section class="panel section"><div class="section-heading"><div><h2>Stage checks <span class="count">${rules.length}</span></h2><p>Matching checks run when a version is submitted, before any stage approval.</p></div>${stage && canConfigure() ? `<button class="button" data-action="new-rule" data-stage-id="${stage.id}">+ Add check</button>` : ''}</div>${stage ? `<div class="item-list">${rules.map(checkRow).join('') || '<div class="empty compact">No checks yet. This stage can still require human approval.</div>'}</div>` : '<div class="empty compact">Create the stage to add checks.</div>'}</section></div>
      <aside class="panel section guidance"><h2>How routing works</h2><p>Pipeline tags select one active route. This stage applies when its additional tags match; its checks run as preflight at submission, not when an approver clicks into the stage.</p><p>${data.aiEnabled ? `AI checks use ${h(data.aiModel)} on pasted copy only; results are advisory.` : 'AI checks can be configured, but require AI_CHECKS_ENABLED=1 and a server-side OPENAI_API_KEY to run. Without both, they create a manual-review finding.'}</p><p>Changing or deleting configuration affects future versions only. Historical review evidence remains.</p></aside></div>`;
}

function documentSyncPanel() {
  const sync = data.documentSync || {};
  const result = sync.lastResult || {};
  const errors = Array.isArray(result.errors) ? result.errors : [];
  const hasResult = sync.lastRunAt && ['created', 'updated', 'unchanged', 'failed'].some((key) => Number.isFinite(result[key]));
  return `<section class="panel section document-sync"><div class="section-heading"><div><h2>Source updates</h2><p>Configured official federal and state sources are checked nightly. Reviewers can fetch them on demand.</p></div>${pill('Nightly', 'status-in_review')}</div><div class="document-sync-meta"><div><span>Last attempt</span><strong>${validTime(sync.lastRunAt)}</strong></div><div><span>Last successful run</span><strong>${validTime(sync.lastSuccessAt)}</strong></div><div><span>Next run</span><strong>${validTime(sync.nextRunAt)}</strong></div></div>${hasResult ? `<p class="document-sync-result">Last run (${h(sync.lastScope || 'all')}): ${Number(result.created) || 0} new, ${Number(result.updated) || 0} updated, ${Number(result.unchanged) || 0} unchanged, ${Number(result.failed) || 0} failed.</p>` : ''}${sync.lastError ? `<p class="hint warning">${h(sync.lastError)}</p>` : ''}${errors.length ? `<div class="document-source-errors"><strong>Source failures</strong>${errors.map((entry) => `<p>${h(entry.sourceName || 'Source')}: ${h(entry.message || entry.error || 'Fetch failed.')}</p>`).join('')}</div>` : ''}${canConfigure() ? `<div class="document-sync-actions"><label class="field"><span>Fetch scope</span><select id="document-sync-jurisdiction" ${ui.syncingDocuments ? 'disabled' : ''}><option value="all" ${ui.syncJurisdiction === 'all' ? 'selected' : ''}>Federal and state</option><option value="federal" ${ui.syncJurisdiction === 'federal' ? 'selected' : ''}>Federal only</option><option value="state" ${ui.syncJurisdiction === 'state' ? 'selected' : ''}>State only</option></select></label><button class="button primary" data-action="sync-documents" ${ui.syncingDocuments ? 'disabled' : ''}>${ui.syncingDocuments ? 'Fetching…' : 'Fetch now'}</button></div>` : ''}</section>`;
}
function stateCoveragePanel() {
  const coverage = Array.isArray(data.stateCoverage) ? data.stateCoverage : [];
  const configured = coverage.filter((item) => item.configured > 0).length;
  const available = coverage.filter((item) => item.available > 0).length;
  return `<details class="panel disclosure document-coverage"><summary>State source coverage${coverage.length ? ` · ${configured} of ${coverage.length} configured, ${available} fetched` : ''}</summary><div class="document-coverage-content"><p>${coverage.length ? `${coverage.length} states tracked. A configured source is a candidate for nightly checks; fetched text is available for review. States without a verified source are marked below.` : 'State coverage has not been reported yet.'}</p>${coverage.length ? `<div class="coverage-grid">${coverage.map((item) => `<div class="coverage-state ${h(item.status)}"><strong>${h(item.code)}</strong><span>${h(item.name)}</span><small>${item.status === 'available' ? `${Number(item.available) || 0} fetched` : item.status === 'pending' ? `${Number(item.configured) || 0} configured · pending` : 'No verified source'}</small></div>`).join('')}</div>` : ''}</div></details>`;
}
function documentDetailPanel(item) {
  if (!item) return '<section class="panel section document-detail"><div class="empty">Choose a document to inspect its source text.</div></section>';
  const detail = ui.documentDetailId === item.id ? ui.documentDetail : null;
  const source = safeUrl(item.sourceUrl);
  const content = detail?.text;
  return `<section class="panel section document-detail"><div class="document-detail-heading"><div><div class="eyebrow">${h(item.jurisdiction === 'state' ? `${item.state || 'State'} LAW` : 'FEDERAL LAW')}</div><h2>${h(item.title)}</h2><div class="pill-row">${documentStatus(item)}${(item.scopeTags || []).map((tag) => pill(tag, 'tag')).join('')}</div></div>${source ? `<a class="button" href="${h(source)}" target="_blank" rel="noopener noreferrer">View source ↗</a>` : ''}</div>${item.status === 'error' ? `<p class="hint warning">The latest fetch failed${item.lastError ? `: ${h(item.lastError)}` : '.'} Any saved text may be out of date; verify the source.</p>` : item.status === 'pending' ? '<p class="hint">This source is configured but has no captured text yet. It is not available for MR evaluation until a fetch succeeds.</p>' : ''}${item.sourceAsOf ? `<p class="hint">Source text current through ${h(item.sourceAsOf)}.</p>` : ''}${item.summary ? `<p class="document-summary">${h(item.summary)}</p>` : ''}<dl class="document-metadata"><div><dt>Source</dt><dd>${h(item.sourceName || '—')}</dd></div><div><dt>Last fetched</dt><dd>${validTime(item.lastFetchedAt)}</dd></div><div><dt>Library updated</dt><dd>${validTime(item.updatedAt)}</dd></div><div><dt>Text hash</dt><dd class="mono">${h(item.contentHash ? `SHA-256 ${item.contentHash.slice(0, 12)}` : '—')}</dd></div></dl><div class="document-text-heading"><h3>Captured text</h3><small>Reference material for human review. Verify current law and applicability at the source.</small></div>${ui.documentDetailLoading ? '<div class="empty compact">Loading document…</div>' : ui.documentDetailError ? `<p class="hint warning">${h(ui.documentDetailError)}</p>` : content ? `<div class="document-body">${h(content)}</div>` : '<p class="hint">No text has been captured for this document yet.</p>'}</section>`;
}
function documentsPage() {
  const mr = data.submissions.find((item) => item.id === ui.documentMrId);
  const version = mr?.versions.find((item) => item.id === ui.documentVersionId) || (mr ? currentVersion(mr) : null);
  const scoped = version ? documentsForVersion(version) : documents();
  const states = [...new Set(documents().filter((item) => item.jurisdiction === 'state' && item.state).map((item) => item.state))].sort();
  const query = ui.documentQuery.trim().toLowerCase();
  const items = scoped.filter((item) => (ui.documentJurisdiction === 'all' || item.jurisdiction === ui.documentJurisdiction)
    && (!ui.documentState || item.state === ui.documentState)
    && (!query || [item.title, item.sourceName, item.summary, item.state, ...(item.scopeTags || [])].join(' ').toLowerCase().includes(query)))
    .sort((a, b) => a.title.localeCompare(b.title));
  if (!items.some((item) => item.id === ui.documentId)) ui.documentId = items[0]?.id || null;
  const selected = items.find((item) => item.id === ui.documentId);
  return `<div class="page-heading"><div><div class="eyebrow">SOURCE LIBRARY</div><h1>Documents</h1><p>Federal and state law documents used as reference material when reviewing MRs.</p></div>${canConfigure() ? '<button class="button primary" data-action="new-document">+ Add document</button>' : ''}</div>${version ? `<div class="document-context"><div><strong>Showing current library matches for MR #${mr.number} · v${version.number}</strong><span>${h(mr.title)} · tags: ${h(version.tags.join(', ') || 'none')}</span><small>This live list uses the MR’s tags and state. Captured sources on the MR may differ; reviewers must verify applicability.</small></div><div class="heading-actions"><button class="button" data-action="return-to-mr">Back to MR</button><button class="button" data-nav="documents">Show full library</button></div></div>` : ''}${documentSyncPanel()}${stateCoveragePanel()}<div class="document-library"><section class="panel document-list"><div class="toolbar"><label class="search">${icon('search')}<input id="document-search" type="search" placeholder="Search titles, sources, tags" value="${h(ui.documentQuery)}" /></label><select id="document-jurisdiction" aria-label="Filter documents by jurisdiction"><option value="all" ${ui.documentJurisdiction === 'all' ? 'selected' : ''}>All jurisdictions</option><option value="federal" ${ui.documentJurisdiction === 'federal' ? 'selected' : ''}>Federal</option><option value="state" ${ui.documentJurisdiction === 'state' ? 'selected' : ''}>State</option></select><select id="document-state" aria-label="Filter documents by state"><option value="">All states</option>${states.map((state) => `<option value="${h(state)}" ${ui.documentState === state ? 'selected' : ''}>${h(state)}</option>`).join('')}</select></div><div class="document-list-count">${items.length} of ${scoped.length} documents</div><div class="document-list-rows">${items.map((item) => `<button class="document-list-row ${item.id === ui.documentId ? 'selected' : ''}" data-document="${h(item.id)}" aria-pressed="${item.id === ui.documentId}"><span class="document-list-title">${h(item.title)}</span><span class="document-list-subtitle">${h(item.jurisdiction === 'state' ? item.state || 'State' : 'Federal')} · ${h(item.sourceName || 'Source')}</span><span class="document-list-summary">${h(item.summary || '')}</span><span class="document-list-foot">${documentStatus(item)}<small>${documentChecked(item)}</small></span></button>`).join('') || '<div class="empty">No documents match these filters.</div>'}</div></section>${documentDetailPanel(selected)}</div>`;
}
let documentDetailSequence = 0;
async function loadDocumentDetail(id) {
  const sequence = ++documentDetailSequence;
  ui.documentDetailId = id; ui.documentDetail = null; ui.documentDetailError = ''; ui.documentDetailLoading = true;
  render();
  try {
    const detail = await request('GET', `/api/documents/${encodeURIComponent(id)}`);
    if (sequence === documentDetailSequence && ui.documentId === id) ui.documentDetail = detail;
  } catch (error) {
    if (sequence === documentDetailSequence && ui.documentId === id) ui.documentDetailError = error.message;
  } finally {
    if (sequence === documentDetailSequence && ui.documentId === id) { ui.documentDetailLoading = false; render(); }
  }
}
async function syncDocuments() {
  if (!canConfigure() || ui.syncingDocuments) return;
  ui.syncingDocuments = true; render();
  try {
    const result = await request('POST', '/api/documents/sync', { actorId: ui.actorId, jurisdiction: ui.syncJurisdiction });
    ui.documentDetailId = null;
    await refresh();
    toast(`Fetch finished: ${Number(result.created) || 0} new, ${Number(result.updated) || 0} updated, ${Number(result.failed) || 0} failed.${result.failed ? ' See source failures below.' : ''}`);
  } catch (error) { toast(error.message, 'error'); await refresh(); }
  finally { ui.syncingDocuments = false; render(); }
}
async function openDocumentSnapshot(id, version) {
  const mr = data.submissions.find((item) => item.id === ui.mrId);
  const reference = mr && selectedVersion(mr).documentReferences?.find((item) => item.id === id && String(item.version) === String(version));
  ui.modal = { type: 'document-snapshot', id, version, sourceAsOf: reference?.sourceAsOf || null,
    loading: true, detail: null, error: '' };
  render();
  try {
    const detail = await request('GET', `/api/documents/${encodeURIComponent(id)}?version=${encodeURIComponent(version)}`);
    if (reference && detail.contentHash !== reference.contentHash) throw new Error('Saved source hash does not match this MR version.');
    if (ui.modal?.type === 'document-snapshot' && ui.modal.id === id && ui.modal.version === version) {
      ui.modal.detail = detail; ui.modal.loading = false; render();
    }
  } catch (error) {
    if (ui.modal?.type === 'document-snapshot' && ui.modal.id === id && ui.modal.version === version) {
      ui.modal.error = error.message; ui.modal.loading = false; render();
    }
  }
}

function render() {
  if (!data) return;
  const content = ui.page === 'mr' ? mrPage() : ui.page === 'pipeline' ? pipelinePage() : ui.page === 'stage' ? stagePage() : ui.page === 'documents' ? documentsPage() : mrList();
  app.innerHTML = shell(content);
  modalRoot.innerHTML = ui.modal ? modalMarkup() : '';
  if (ui.page === 'pipeline') loadPreview();
  if (ui.page === 'documents' && ui.documentId && ui.documentDetailId !== ui.documentId) void loadDocumentDetail(ui.documentId);
}
const field = (name, label, value = '', placeholder = '', extra = '') => `<label class="field"><span>${label}</span><input name="${name}" value="${h(value)}" placeholder="${h(placeholder)}" ${extra} /></label>`;
function modal(title, note, fields, submit, wide = false) {
  const destructive = ['close-mr', 'confirm-delete-rule', 'confirm-delete-stage'].includes(ui.modal.type);
  return `<div class="modal-overlay" data-action="close-modal"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${h(title)}"><div class="modal-heading"><div><h2>${h(title)}</h2><p>${h(note)}</p></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon('close', 18)}</button></div><form data-form="${ui.modal.type}" class="modal-form">${fields}<div class="form-actions"><button class="button" type="button" data-action="close-modal">Cancel</button><button class="button ${destructive ? 'danger' : 'primary'}" type="submit">${h(submit)}</button></div></form></div></div>`;
}
function modalMarkup() {
  const config = ui.modal;
  const mr = data.submissions.find((item) => item.id === ui.mrId);
  const version = mr && currentVersion(mr);
  if (config.type === 'document-snapshot') {
    const detail = config.detail || {};
    const source = safeUrl(detail?.sourceUrl);
    return `<div class="modal-overlay" data-action="close-modal"><div class="modal wide" role="dialog" aria-modal="true" aria-label="Captured document"><div class="modal-heading"><div><h2>${h(detail?.title || 'Captured document')}</h2><p>Source version ${h(config.version)} recorded with this MR version.</p></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon('close', 18)}</button></div><div class="document-snapshot-content">${config.loading ? '<div class="empty compact">Loading captured source…</div>' : config.error ? `<p class="hint warning">${h(config.error)}</p>` : `<div class="document-snapshot-meta"><span>SHA-256 ${h(detail.contentHash?.slice(0, 12) || '—')}</span><span>Fetched ${validTime(detail.lastFetchedAt)}</span>${config.sourceAsOf ? `<span>Source current through ${h(config.sourceAsOf)}</span>` : ''}${source ? `<a href="${h(source)}" target="_blank" rel="noopener noreferrer">View source ↗</a>` : ''}</div><p class="hint">This is the saved source text for the captured version. Verify current law and applicability before deciding.</p><div class="document-body">${h(detail.text || 'No captured text is available.')}</div>`}</div></div></div>`;
  }
  if (config.type === 'new-mr' || config.type === 'new-version') {
    const revise = config.type === 'new-version';
    return modal(revise ? 'Submit new version' : 'New MR', revise ? 'Checks and approvals restart for the new version.' : 'Submit any marketing material for review.', `${revise ? '' : field('title', 'Title', '', 'Campaign name or asset title', 'required maxlength="180"')}${field('tags', 'Tags', revise ? version.tags.join(', ') : '', 'e.g. email, state-ny, high-risk')}<p class="field-help">Tags select one active pipeline, then its matching stages and checks.</p><label class="field"><span>Review copy</span><textarea name="content" rows="8" required placeholder="Paste the copy reviewers should assess…">${revise ? h(version.content) : ''}</textarea></label>${field('referenceUrl', 'Source URL (optional)', revise ? version.referenceUrl : '', 'https://example.com') }<label class="field"><span>Attachment (optional)</span><input name="asset" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" /></label>${revise && version.asset ? `<label class="checkbox"><input name="removeAsset" type="checkbox" /> Remove current attachment (${h(version.asset.name)})</label>` : ''}<p class="field-help">PNG, JPEG, WebP or PDF up to 5 MB. Preflight checks inspect pasted copy only.</p>`, revise ? 'Submit version' : 'Create MR', true);
  }
  if (config.type === 'new-pipeline') {
    return modal('New pipeline', 'Create a draft, add a stage, then activate it to route matching MRs.', `${field('name', 'Pipeline name', '', 'e.g. Affiliate review', 'required maxlength="120"')}${field('scopeTags', 'Required MR tags', '', 'e.g. affiliate, high-risk')}<p class="field-help">An MR must have every tag listed here. More-specific pipelines take precedence.</p>${field('priority', 'Tie-break priority', 0, '0', 'type="number" min="-100" max="100"')}`, 'Create draft pipeline');
  }
  if (config.type === 'new-document') {
    return modal('Add reference document', 'Add a law or policy source for reviewers to consult.', `${field('title', 'Document title', '', 'e.g. State advertising law', 'required maxlength="180"')}<div class="field-grid"><label class="field"><span>Jurisdiction</span><select name="jurisdiction" id="new-document-jurisdiction"><option value="federal">Federal</option><option value="state">State</option></select></label><label class="field"><span>State code</span><input name="state" id="new-document-state" maxlength="2" pattern="[A-Za-z]{2}" placeholder="e.g. NY" disabled /><small>Required for state laws.</small></label></div>${field('sourceName', 'Source name', '', 'e.g. State legislature', 'required maxlength="120"')}${field('sourceUrl', 'Source URL', '', 'https://official.example.gov/law', 'type="url"')}<p class="field-help">A source URL or pasted text is required. Official HTTPS .gov law URLs are fetched nightly. Other URLs can be cited with pasted text but are not fetched.</p><label class="field"><span>Summary (optional)</span><textarea name="summary" rows="3" placeholder="What reviewers should look for…"></textarea></label>${field('scopeTags', 'Additional MR tags', '', 'e.g. mortgage, credit-card')}<p class="field-help">State documents also require the matching state-xx MR tag. Extra tags narrow the match further.</p><label class="field"><span>Document text (optional if URL is provided)</span><textarea name="text" rows="7" placeholder="Paste the source text for a manually maintained document…"></textarea></label>`, 'Add document', true);
  }
  if (config.type === 'manual-finding') return modal('Add finding', 'Leave actionable feedback on this version.', `${field('title', 'Title', '', 'What needs attention?', 'required')}<label class="field"><span>Severity</span><select name="severity"><option>medium</option><option>low</option><option>high</option></select></label><label class="field"><span>Explanation</span><textarea name="body" rows="4" required></textarea></label>${field('evidence', 'Quoted text (optional)')}`, 'Add finding');
  if (config.type === 'resolve-finding') {
    const finding = mr.findings.find((item) => item.id === config.id);
    return modal('Resolve finding', finding?.title || '', `<label class="field"><span>Resolution</span><select name="status"><option value="resolved">Resolved</option><option value="not_applicable">Not applicable</option></select></label><label class="field"><span>Rationale</span><textarea name="rationale" rows="4" required placeholder="Explain why this is closed…"></textarea></label>`, 'Save resolution');
  }
  if (config.type === 'request-changes') return modal('Request changes', 'Send this version back to Marketing.', '<label class="field"><span>What needs to change?</span><textarea name="note" rows="5" required></textarea></label>', 'Request changes');
  if (config.type === 'close-mr') return modal('Close MR', 'This removes the MR from active review. Its versions and audit trail remain available.', '<label class="field"><span>Reason for closing</span><textarea name="reason" rows="4" minlength="5" maxlength="1000" required placeholder="Why is this material no longer being reviewed?"></textarea></label>', 'Close MR');
  if (config.type === 'confirm-delete-stage') {
    const stage = data.stages.find((item) => item.id === config.id);
    const count = data.rules.filter((rule) => rule.stageId === config.id && !rule.deletedAt).length;
    return modal('Delete stage', `${stage?.name || 'Stage'} and ${count} attached check(s) will stop applying to new MR versions. Historical evidence is kept.`, '<p class="hint warning">An active pipeline must retain another stage that applies to every MR.</p>', 'Delete stage');
  }
  if (config.type === 'confirm-delete-rule') {
    const rule = data.rules.find((item) => item.id === config.id);
    return modal('Delete check', `${rule?.name || 'Check'} will stop running on new MR versions. Historical results remain in the audit trail.`, '', 'Delete check');
  }
  if (config.type === 'rule') {
    const rule = data.rules.find((item) => item.id === config.id);
    const stage = data.stages.find((item) => item.id === (rule?.stageId || config.stageId));
    const ai = rule?.kind === 'ai';
    return modal(rule ? 'Edit check' : 'Add check', `Runs with ${stage?.name || 'this stage'} when a matching version is submitted. Historical results remain unchanged.`, `${field('name', 'Name', rule?.name, 'e.g. Required disclosure', 'required')}<div class="field-grid"><label class="field"><span>Type</span><select name="kind" id="check-kind"><option value="required" ${rule?.kind === 'required' ? 'selected' : ''}>Required phrase</option><option value="forbidden" ${rule?.kind === 'forbidden' ? 'selected' : ''}>Prohibited phrase</option><option value="ai" ${ai ? 'selected' : ''}>AI review</option></select></label><label class="field"><span>Severity</span><select name="severity">${['low','medium','high'].map((value) => `<option ${rule?.severity === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div><label class="field check-phrase" ${ai ? 'hidden' : ''}><span>Phrase</span><input name="term" value="${h(rule?.term)}" placeholder="Exact text, case insensitive" ${ai ? '' : 'required'} /></label><label class="field check-ai" ${ai ? '' : 'hidden'}><span>AI check instruction</span><textarea name="instruction" rows="4" minlength="10" maxlength="2000" ${ai ? 'required' : ''} placeholder="What should the AI flag for human review?">${h(rule?.instruction)}</textarea><small>Only pasted copy and tags are sent when AI is enabled. This never auto-approves an MR.</small></label><div class="field-grid"><label class="field"><span>Policy category</span><select name="category">${['Internal policy','Federal','State','Industry standard'].map((value) => `<option ${rule?.category === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>${field('source', 'Policy source', rule?.source, 'Document or policy reference', 'required')}</div>${field('scopeTags', 'Additional required tags', rule?.scopeTags.join(', '), 'Leave empty for any matching MR')}<label class="checkbox"><input name="active" type="checkbox" ${rule?.active !== false ? 'checked' : ''} /> Active check</label>${rule ? `<button type="button" class="button danger align-start" data-action="delete-rule" data-id="${rule.id}">Delete check</button>` : ''}`, rule ? 'Save check' : 'Add check', true);
  }
  return '';
}

async function fileFrom(form, priorAsset = null) {
  const file = form.elements.asset?.files?.[0];
  if (!file) return priorAsset;
  if (file.size > 5_000_000) throw new Error('Attachment must be under 5 MB.');
  if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type)) throw new Error('Attach a PNG, JPEG, WebP, or PDF file.');
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read attachment.')); reader.readAsDataURL(file); });
  return { name: file.name, mime: file.type, data: dataUrl };
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-nav], [data-open], [data-pipeline], [data-stage], [data-version], [data-tab], [data-action], [data-remove-tag], [data-document]');
  if (!target) return;
  if (target.classList.contains('modal-overlay') && target !== event.target) return;
  if (target.dataset.nav) { ui.modal = null; go(target.dataset.nav); return; }
  if (target.dataset.open) { ui.versionId = null; ui.detailTab = 'review'; go('mr', target.dataset.open); return; }
  if (target.dataset.pipeline) { go('pipeline', target.dataset.pipeline); return; }
  if (target.dataset.stage) { go('stage', target.dataset.stage); return; }
  if (target.dataset.version) { ui.versionId = target.dataset.version; render(); return; }
  if (target.dataset.document) { ui.documentId = target.dataset.document; void loadDocumentDetail(ui.documentId); return; }
  if (target.dataset.removeTag) { ui.tags = ui.tags.filter((tag) => tag !== target.dataset.removeTag); render(); return; }
  if (target.dataset.tab) { ui.detailTab = target.dataset.tab; render(); return; }
  const action = target.dataset.action;
  if (action === 'clear-tags') { ui.tags = []; render(); return; }
  if (action === 'close-modal') { ui.modal = null; render(); return; }
  if (action === 'new-stage') { go('stage'); return; }
  if (action === 'delete-stage') ui.modal = { type: 'confirm-delete-stage', id: ui.stageId };
  if (action === 'delete-rule') ui.modal = { type: 'confirm-delete-rule', id: target.dataset.id, stageId: ui.stageId };
  if (action === 'close-mr') ui.modal = { type: 'close-mr' };
  if (action === 'mr-documents') { go('mr-documents'); return; }
  if (action === 'view-document-snapshot') { void openDocumentSnapshot(target.dataset.id, target.dataset.documentVersion); return; }
  if (action === 'return-to-mr') { ui.versionId = ui.documentVersionId; go('mr', ui.documentMrId); return; }
  if (action === 'sync-documents') { void syncDocuments(); return; }
  if (action === 'new-pipeline') ui.modal = { type: 'new-pipeline' };
  if (action === 'new-document') ui.modal = { type: 'new-document' };
  if (action === 'new-mr' || action === 'new-version' || action === 'manual-finding' || action === 'request-changes') ui.modal = { type: action };
  else if (action === 'resolve-finding') ui.modal = { type: action, id: target.dataset.id };
  else if (action === 'new-rule') ui.modal = { type: 'rule', pipelineId: ui.pipelineId, stageId: target.dataset.stageId };
  else if (action === 'edit-rule') ui.modal = { type: 'rule', pipelineId: ui.pipelineId, stageId: ui.stageId, id: target.dataset.id };
  else if (action === 'approve') { await mutate('POST', `/api/submissions/${ui.mrId}/decisions`, { action: 'approve', note: '' }, 'Approval recorded.'); return; }
  else if (action === 'publish') { await mutate('POST', `/api/submissions/${ui.mrId}/publish`, {}, 'Publication recorded.'); return; }
  else if (action === 'switch-role') { const person = data.people.find((item) => item.role === target.dataset.role); if (person) { ui.actorId = person.id; localStorage.setItem('review-actor', person.id); render(); } return; }
  else if (action === 'export-audit') { location.href = `/api/submissions/${ui.mrId}/audit`; return; }
  render();
  modalRoot.querySelector('input, textarea, select')?.focus();
});
document.addEventListener('change', (event) => {
  if (event.target.id === 'actor-select') { ui.actorId = event.target.value; localStorage.setItem('review-actor', ui.actorId); render(); }
  if (event.target.id === 'status-filter') { ui.status = event.target.value; render(); }
  if (event.target.id === 'tag-add' && event.target.value) { ui.tags.push(event.target.value); render(); }
  if (event.target.id === 'version-select') { ui.versionId = event.target.value; render(); }
  if (event.target.id === 'check-kind') {
    const ai = event.target.value === 'ai';
    modalRoot.querySelector('.check-phrase').hidden = ai;
    modalRoot.querySelector('.check-ai').hidden = !ai;
    modalRoot.querySelector('input[name="term"]').required = !ai;
    modalRoot.querySelector('textarea[name="instruction"]').required = ai;
  }
  if (event.target.id === 'document-jurisdiction') { ui.documentJurisdiction = event.target.value; render(); }
  if (event.target.id === 'document-state') { ui.documentState = event.target.value; render(); }
  if (event.target.id === 'document-sync-jurisdiction') { ui.syncJurisdiction = event.target.value; }
  if (event.target.id === 'new-document-jurisdiction') {
    const state = document.getElementById('new-document-state');
    state.disabled = event.target.value !== 'state'; state.required = event.target.value === 'state';
    if (state.disabled) state.value = '';
  }
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'mr-search') { const position = event.target.selectionStart; ui.query = event.target.value; render(); const input = document.getElementById('mr-search'); input?.focus(); input?.setSelectionRange(position, position); }
  if (event.target.id === 'document-search') { const position = event.target.selectionStart; ui.documentQuery = event.target.value; render(); const input = document.getElementById('document-search'); input?.focus(); input?.setSelectionRange(position, position); }
  if (event.target.id === 'preview-tags') { ui.previewTags = event.target.value; loadPreview(); }
});
document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form).entries());
  const type = form.dataset.form;
  if (type === 'comment') return mutate('POST', `/api/submissions/${ui.mrId}/comments`, { body: values.body }, 'Comment posted.');
  if (type === 'new-document') {
    if (!String(values.sourceUrl || '').trim() && !String(values.text || '').trim()) { toast('Provide a source URL or paste document text.', 'error'); return; }
    const result = await mutate('POST', '/api/documents', { ...values, state: String(values.state || '').toUpperCase() }, 'Document added to the library.');
    if (result) { ui.documentId = result.id; ui.documentDetailId = null; ui.documentJurisdiction = 'all'; ui.documentState = ''; ui.documentQuery = ''; go('documents'); }
    return;
  }
  if (type === 'new-mr' || type === 'new-version') {
    try {
      if (form.elements.removeAsset?.checked && form.elements.asset.files?.length) {
        throw new Error('Choose a replacement attachment or remove the current one, not both.');
      }
      const prior = type === 'new-version' && !form.elements.removeAsset?.checked
        ? currentVersion(data.submissions.find((mr) => mr.id === ui.mrId)).asset : null;
      const body = { title: values.title, tags: values.tags, content: values.content, referenceUrl: values.referenceUrl, asset: await fileFrom(form, prior) };
      const path = type === 'new-version' ? `/api/submissions/${ui.mrId}/versions` : '/api/submissions';
      const result = await request('POST', path, { ...body, actorId: ui.actorId });
      ui.modal = null; ui.versionId = null; ui.detailTab = 'review';
      await refresh(); go('mr', result.id); toast(type === 'new-version' ? 'New version submitted.' : 'MR created.');
    } catch (error) { toast(error.message, 'error'); }
    return;
  }
  if (type === 'stage') {
    const path = ui.stageId ? `/api/stages/${ui.stageId}` : '/api/stages';
    const result = await mutate(ui.stageId ? 'PATCH' : 'POST', path, { ...values, pipelineId: ui.pipelineId, order: Number(values.order), active: form.elements.active.checked }, 'Stage saved.');
    if (result && !ui.stageId) go('stage', result.id);
    return;
  }
  if (type === 'new-pipeline') {
    const result = await mutate('POST', '/api/pipelines', { ...values, priority: Number(values.priority), active: false }, 'Draft pipeline created. Add a stage, then activate it.');
    if (result) go('pipeline', result.id);
    return;
  }
  if (type === 'pipeline') {
    const selected = data.pipelines.find((pipeline) => pipeline.id === ui.pipelineId);
    return mutate('PATCH', `/api/pipelines/${ui.pipelineId}`, {
      ...values, scopeTags: values.scopeTags || '', priority: Number(values.priority ?? selected.priority),
      active: selected.id === 'default' ? true : form.elements.active.checked,
    }, 'Pipeline saved. New MR versions will use the updated route.');
  }
  if (type === 'manual-finding') return mutate('POST', `/api/submissions/${ui.mrId}/findings`, values, 'Finding added.');
  if (type === 'resolve-finding') return mutate('PATCH', `/api/submissions/${ui.mrId}/findings/${ui.modal.id}`, values, 'Resolution recorded.');
  if (type === 'request-changes') return mutate('POST', `/api/submissions/${ui.mrId}/decisions`, { action: 'request_changes', note: values.note }, 'Changes requested.');
  if (type === 'close-mr') return mutate('POST', `/api/submissions/${ui.mrId}/close`, { reason: values.reason }, 'MR closed.');
  if (type === 'confirm-delete-rule') return mutate('DELETE', `/api/rules/${ui.modal.id}`, {}, 'Check deleted. Historical results remain.');
  if (type === 'confirm-delete-stage') {
    const result = await mutate('DELETE', `/api/stages/${ui.modal.id}`, {}, 'Stage and attached checks deleted. Historical routes remain.');
    if (result) go('pipeline', ui.pipelineId);
    return;
  }
  if (type === 'rule') return mutate(ui.modal.id ? 'PATCH' : 'POST', ui.modal.id ? `/api/rules/${ui.modal.id}` : '/api/rules', { ...values, stageId: ui.modal.stageId, pipelineId: ui.modal.pipelineId || ui.pipelineId, active: form.elements.active.checked }, 'Check saved.');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && ui.modal) { ui.modal = null; render(); }
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-open]')) { event.preventDefault(); event.target.click(); }
});
window.addEventListener('hashchange', () => { readRoute(); render(); });
readRoute();
refresh().catch((error) => { app.innerHTML = `<div class="fatal"><h1>Could not load workspace</h1><p>${h(error.message)}</p><button onclick="location.reload()">Try again</button></div>`; });
