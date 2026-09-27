const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const toastRoot = document.getElementById('toast-root');

let data;
let ui = {
  page: 'overview', selectedId: null, selectedVersionId: null, detailTab: 'review',
  query: '', status: 'all', tag: 'all', previewTags: '', modal: null,
  actorId: localStorage.getItem('clearpath-actor') || 'maya',
};

const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  inbox: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 13h5l2 3h4l2-3h5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  workflow: '<rect x="2" y="4" width="7" height="6" rx="1.5"/><rect x="15" y="14" width="7" height="6" rx="1.5"/><path d="M9 7h5a3 3 0 0 1 3 3v4M5.5 10v4a3 3 0 0 0 3 3H15"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6 6-6-6 6-6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  alert: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v4m0 4h.01"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  file: '<path d="M6 2h8l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7l0-8Z"/>',
  message: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z"/>',
  close: '<path d="M5 5l14 14M19 5 5 19"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>',
  external: '<path d="M14 4h6v6M10 14 20 4M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/>',
  edit: '<path d="m16 4 4 4L9 19l-5 1 1-5L16 4Z"/><path d="m14 6 4 4"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  filter: '<path d="M3 5h18M6 12h12M10 19h4"/>',
  spark: '<path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2ZM19 17l.6 1.4L21 19l-1.4.6L19 21l-.6-1.4L17 19l1.4-.6L19 17Z"/>',
};

function icon(name, size = 18) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
}
function h(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function tagLabel(tag) { return tag.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function displayDate(value) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value)); }
function displayTime(value) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
function versionOf(submission) { return submission.versions.at(-1); }
function selectedVersion(submission) { return submission.versions.find((item) => item.id === ui.selectedVersionId) || versionOf(submission); }
function findingsOf(submission, version) { return submission.findings.filter((item) => item.versionId === version.id); }
function decisionsOf(submission, version) { return submission.decisions.filter((item) => item.versionId === version.id); }
function currentPerson() { return data.people.find((person) => person.id === ui.actorId) || data.people[1]; }
function statusLabel(status) { return ({ in_review: 'In review', changes_requested: 'Changes requested', approved: 'Approved', published: 'Published' })[status] || status; }
function statusPill(status) { return `<span class="status status-${h(status)}"><span class="status-dot"></span>${h(statusLabel(status))}</span>`; }
function tagPill(tag) { return `<span class="tag">${h(tagLabel(tag))}</span>`; }
function tagsMarkup(tags, max = 3) { return `${tags.slice(0, max).map(tagPill).join('')}${tags.length > max ? `<span class="tag tag-more">+${tags.length - max}</span>` : ''}`; }
function initials(name) { return name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase(); }
function avatar(name, extra = '') { return `<span class="avatar ${extra}">${h(initials(name))}</span>`; }
function openFindings(submission) { return findingsOf(submission, versionOf(submission)).filter((item) => item.status === 'open'); }
function applicable(item, tags) { return item.active && item.scopeTags.every((tag) => tags.includes(tag)); }
function stageState(submission, stage, version) {
  if (decisionsOf(submission, version).some((decision) => decision.stageId === stage.id && decision.action === 'approved')) return 'done';
  const firstPending = version.stagePlan.find((entry) => !decisionsOf(submission, version).some((decision) => decision.stageId === entry.id && decision.action === 'approved'));
  return firstPending?.id === stage.id ? 'current' : 'waiting';
}
function activeStage(submission) {
  const version = versionOf(submission);
  return version.stagePlan.find((stage) => !decisionsOf(submission, version).some((decision) => decision.stageId === stage.id && decision.action === 'approved'));
}

async function request(method, path, body) {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
async function refresh() {
  data = await request('GET', '/api/state');
  render();
}
async function mutate(method, path, body, message) {
  try {
    await request(method, path, { ...body, actorId: ui.actorId });
    ui.modal = null;
    await refresh();
    toast(message);
  } catch (error) { toast(error.message, 'error'); }
}
function toast(message, type = 'success') {
  toastRoot.innerHTML = `<div class="toast ${type}">${icon(type === 'error' ? 'alert' : 'check', 16)}<span>${h(message)}</span></div>`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toastRoot.innerHTML = ''; }, 4000);
}

function navItem(page, label, glyph, count = '') {
  return `<button class="nav-item ${ui.page === page || (page === 'submissions' && ui.page === 'detail') ? 'active' : ''}" data-nav="${page}" aria-label="${label}">${icon(glyph, 18)}<span>${label}</span>${count !== '' ? `<b>${count}</b>` : ''}</button>`;
}

function shell(content) {
  const waiting = data.submissions.filter((item) => ['in_review', 'changes_requested'].includes(item.status)).length;
  const person = currentPerson();
  const pageName = ({ overview: 'Overview', submissions: 'Submissions', detail: 'Submission review', rules: 'Rule library', pipeline: 'Pipelines', audit: 'Audit trail' })[ui.page];
  return `<div class="layout">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">${icon('check', 22)}</span><span class="brand-word">clearpath<span class="brand-period">.</span><small>REVIEW STUDIO</small></span></div>
      <div class="sidebar-label">WORKSPACE</div>
      <nav class="primary-nav" aria-label="Main navigation">
        ${navItem('overview', 'Overview', 'grid')}
        ${navItem('submissions', 'Submissions', 'inbox', waiting)}
        ${navItem('rules', 'Rule library', 'shield')}
        ${navItem('pipeline', 'Pipelines', 'workflow')}
        ${navItem('audit', 'Audit trail', 'history')}
      </nav>
      <div class="sidebar-spacer"></div>
      <div class="sidebar-context"><div class="context-graphic">${icon('layers', 19)}</div><div><strong>One shared workspace</strong><p>Every material. Every channel.<br/>One clear review history.</p></div></div>
      <div class="sidebar-footer"><div class="sidebar-label">DEMO VIEW</div><div class="person-picker">${avatar(person.name, person.color)}<select id="actor-select" aria-label="Demo user">${data.people.map((item) => `<option value="${item.id}" ${item.id === person.id ? 'selected' : ''}>${h(item.name)} · ${h(data.roleLabels[item.role])}</option>`).join('')}</select></div><div class="demo-note">Switch roles to try each approval step.</div></div>
    </aside>
    <div class="work-area">
      <header class="topbar"><div class="topbar-left"><span class="topbar-crumb">ClearPath</span>${icon('chevron', 14)}<strong>${h(pageName)}</strong></div><div class="topbar-actions"><span class="demo-badge"><span></span> Demo workspace</span><select id="mobile-actor-select" aria-label="Demo user">${data.people.map((item) => `<option value="${item.id}" ${item.id === person.id ? 'selected' : ''}>${h(item.name)} · ${h(data.roleLabels[item.role])}</option>`).join('')}</select><button class="button button-primary" data-action="new-submission">${icon('plus', 17)} New submission</button></div></header>
      <main class="main-content" id="content">${content}</main>
    </div>
  </div>`;
}

function queueRows(items, compact = false) {
  if (!items.length) return `<div class="empty-state">${icon('inbox', 29)}<h3>Nothing in this view</h3><p>Try another filter, or create a submission to begin review.</p></div>`;
  return `<div class="table-wrap"><table class="queue-table"><thead><tr><th>Material</th><th>Tags</th>${compact ? '' : '<th>Owner</th><th>Next step</th>'}<th>Updated</th><th>Status</th><th></th></tr></thead><tbody>${items.map((item) => {
    const version = versionOf(item); const stage = activeStage(item);
    const nextStep = item.status === 'changes_requested' ? 'Awaiting revision' : stage ? stage.name : item.status === 'approved' ? 'Ready to publish' : 'Complete';
    return `<tr data-open="${item.id}" tabindex="0" role="button" aria-label="Open ${h(item.title)}"><td><div class="material-cell"><span class="material-icon">${icon('file', 18)}</span><span><strong>${h(item.title)}</strong><small>CP-${item.number} · v${version.number}${openFindings(item).length ? ` · ${openFindings(item).length} open finding${openFindings(item).length === 1 ? '' : 's'}` : ''}</small></span></div></td><td><div class="tag-list">${tagsMarkup(version.tags, compact ? 2 : 3)}</div></td>${compact ? '' : `<td><div class="owner-cell">${avatar(item.owner)}${h(item.owner)}</div></td><td class="muted">${h(nextStep)}</td>`}<td class="muted no-wrap">${displayDate(item.updatedAt)}</td><td>${statusPill(item.status)}</td><td class="row-chevron">${icon('chevron', 16)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function overview() {
  const inReview = data.submissions.filter((item) => item.status === 'in_review').length;
  const changes = data.submissions.filter((item) => item.status === 'changes_requested').length;
  const approved = data.submissions.filter((item) => ['approved', 'published'].includes(item.status)).length;
  const findings = data.submissions.reduce((sum, item) => sum + openFindings(item).length, 0);
  const recent = data.submissions.flatMap((item) => item.events.map((event) => ({ ...event, submission: item }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  const attention = data.submissions.filter((item) => ['in_review', 'changes_requested'].includes(item.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `<div class="page-wrap">
    <section class="hero"><div class="hero-copy"><div class="eyebrow light">CLEARPATH / COMPLIANCE OPERATIONS</div><h1>Keep good work moving<span>.</span></h1><p>A clear path from first draft to final approval. Every decision, rule, and revision in one place.</p><button class="button button-light" data-nav="submissions">Open review queue ${icon('arrow', 17)}</button></div><div class="hero-art" aria-hidden="true"><div class="art-line art-line-one"></div><div class="art-line art-line-two"></div><div class="art-node art-node-one">${icon('file', 18)}</div><div class="art-node art-node-two">${icon('bolt', 18)}</div><div class="art-node art-node-three">${icon('check', 19)}</div><div class="art-label">SUBMIT <span>→</span> CHECK <span>→</span> APPROVE</div></div></section>
    <div class="stats-grid"><div class="stat-card"><div class="stat-icon blue">${icon('inbox', 19)}</div><span>In review</span><strong>${inReview}</strong><small>Waiting on a reviewer</small></div><div class="stat-card"><div class="stat-icon amber">${icon('edit', 19)}</div><span>Changes requested</span><strong>${changes}</strong><small>Back with marketing</small></div><div class="stat-card"><div class="stat-icon green">${icon('check', 20)}</div><span>Approved / published</span><strong>${approved}</strong><small>With recorded sign-off</small></div><div class="stat-card"><div class="stat-icon rose">${icon('alert', 19)}</div><span>Open findings</span><strong>${findings}</strong><small>Across current versions</small></div></div>
    <div class="overview-grid"><section class="panel queue-panel"><div class="panel-heading"><div><div class="eyebrow">WORK IN PROGRESS</div><h2>Needs attention</h2><p>Submissions moving through review right now.</p></div><button class="text-button" data-nav="submissions">View all ${icon('arrow', 16)}</button></div>${queueRows(attention.slice(0, 5), true)}</section><section class="panel activity-panel"><div class="panel-heading"><div><div class="eyebrow">RECENT ACTIVITY</div><h2>Latest decisions</h2><p>A live record of what changed.</p></div></div><div class="activity-list">${recent.map((entry) => `<button class="activity-entry" data-open="${entry.submission.id}"><span class="activity-dot ${h(entry.type)}"></span><span><strong>${h(entry.detail)}</strong><small>${h(entry.submission.title)} · ${h(entry.actor)} · ${displayTime(entry.at)}</small></span></button>`).join('')}</div></section></div>
    <div class="tip-banner">${icon('spark', 21)}<div><strong>Routing follows the tags.</strong><span>Add any tags to a submission. Matching rules and review stages are captured when each version enters review.</span></div><button data-nav="pipeline">Explore pipelines ${icon('arrow', 15)}</button></div>
  </div>`;
}

function submissionsPage() {
  const allTags = [...new Set(data.submissions.flatMap((item) => versionOf(item).tags))].sort();
  const items = data.submissions.filter((item) => {
    const version = versionOf(item);
    const query = ui.query.toLowerCase();
    return (ui.status === 'all' || item.status === ui.status)
      && (ui.tag === 'all' || version.tags.includes(ui.tag))
      && (!query || `${item.title} ${item.owner} ${item.number} ${version.tags.join(' ')}`.toLowerCase().includes(query));
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `<div class="page-wrap"><div class="page-heading"><div><div class="eyebrow">SHARED WORKSPACE</div><h1>Submissions</h1><p>Track every material through review, across products and channels.</p></div><div class="heading-count">${data.submissions.length} total</div></div>
    <section class="panel"><div class="queue-toolbar"><label class="search-box">${icon('search', 18)}<input id="queue-search" type="search" placeholder="Search materials, owners, tags…" value="${h(ui.query)}" /></label><div class="filter-group">${icon('filter', 17)}<select id="status-filter" aria-label="Filter by status"><option value="all">All statuses</option>${['in_review','changes_requested','approved','published'].map((status) => `<option value="${status}" ${ui.status === status ? 'selected' : ''}>${statusLabel(status)}</option>`).join('')}</select><select id="tag-filter" aria-label="Filter by tag"><option value="all">All tags</option>${allTags.map((tag) => `<option value="${h(tag)}" ${ui.tag === tag ? 'selected' : ''}>${h(tagLabel(tag))}</option>`).join('')}</select></div></div><div class="result-count">Showing ${items.length} of ${data.submissions.length} submissions</div>${queueRows(items)}</section>
  </div>`;
}

function checksPanel(version) {
  const failed = version.checks.filter((check) => !check.passed).length;
  return `<section class="panel detail-panel"><div class="section-head"><div><div class="eyebrow">AUTOMATED PREFLIGHT</div><h2>Policy checks <span class="count-pill">${version.checks.length}</span></h2></div><span class="check-summary ${failed ? 'has-failures' : ''}">${icon(failed ? 'alert' : 'check', 15)} ${failed ? `${failed} flagged` : 'All clear'}</span></div><p class="section-intro">These sample checks help reviewers spot likely issues. A person makes the approval decision.</p><div class="check-list">${version.checks.length ? version.checks.map((check) => `<div class="check-row"><span class="check-icon ${check.passed ? 'pass' : 'fail'}">${icon(check.passed ? 'check' : 'alert', 16)}</span><div><strong>${h(check.name)}</strong><small>${h(check.category)} · ${h(check.source)} · rule v${check.ruleVersion}</small>${!check.passed ? `<p>${h(check.evidence)}</p>` : ''}</div><span class="check-result ${check.passed ? 'pass' : 'fail'}">${check.passed ? 'Passed' : 'Review'}</span></div>`).join('') : '<div class="quiet-empty">No active rules matched this version’s tags.</div>'}</div></section>`;
}

function findingsPanel(submission, version, isCurrent) {
  const findings = findingsOf(submission, version);
  const reviewer = currentPerson().role !== 'marketer';
  const editable = isCurrent && reviewer && !['approved', 'published'].includes(submission.status);
  return `<section class="panel detail-panel"><div class="section-head"><div><div class="eyebrow">REVIEW NOTES</div><h2>Findings <span class="count-pill">${findings.length}</span></h2></div>${editable ? `<button class="button button-outline button-small" data-action="manual-finding">${icon('plus', 15)} Add finding</button>` : ''}</div><div class="finding-list">${findings.length ? findings.map((finding) => `<article class="finding-card ${finding.status === 'open' ? '' : 'finding-closed'}"><div class="finding-top"><span class="severity severity-${h(finding.severity)}">${h(finding.severity)}</span><span class="finding-source">${finding.source === 'preflight' ? 'Automated preflight' : h(finding.createdBy)}</span><span class="finding-status ${h(finding.status)}">${h(finding.status.replace('_', ' '))}</span></div><h3>${h(finding.title)}</h3><p>${h(finding.body)}</p>${finding.evidence ? `<div class="evidence">${icon('message', 15)} ${h(finding.evidence)}</div>` : ''}${finding.status === 'open' && editable ? `<button class="text-button" data-action="resolve-finding" data-id="${finding.id}">Resolve finding ${icon('arrow', 15)}</button>` : ''}${finding.status !== 'open' ? `<div class="resolution-note">${icon('check', 15)} ${h(finding.resolution)} <span>— ${h(finding.resolvedBy)}</span></div>` : ''}</article>`).join('') : '<div class="quiet-empty with-icon">' + icon('check', 19) + ' No findings on this version.</div>'}</div></section>`;
}

function commentsPanel(submission, version, isCurrent) {
  const comments = submission.comments.filter((item) => item.versionId === version.id);
  return `<section class="panel detail-panel"><div class="section-head"><div><div class="eyebrow">CONVERSATION</div><h2>Discussion <span class="count-pill">${comments.length}</span></h2></div></div><div class="comments-list">${comments.length ? comments.map((comment) => `<div class="comment">${avatar(comment.author)}<div class="comment-content"><div><strong>${h(comment.author)}</strong><span>${h(data.roleLabels[comment.role])} · ${displayTime(comment.at)}</span></div><p>${h(comment.body)}</p></div></div>`).join('') : '<div class="quiet-empty">No comments yet. Keep feedback alongside the material.</div>'}</div>${isCurrent ? `<form data-form="comment" class="comment-form"><textarea name="body" placeholder="Add a comment for the team…" rows="2" required></textarea><button class="button button-outline button-small" type="submit">Post comment ${icon('arrow', 15)}</button></form>` : ''}</section>`;
}

function routePanel(submission, version, isCurrent) {
  const current = activeStage(submission);
  const person = currentPerson();
  const pending = findingsOf(submission, version).filter((finding) => finding.status === 'open').length;
  let actions = '';
  if (isCurrent) {
    if (submission.status === 'approved') {
      actions = `<div class="route-ready">${icon('check', 18)} Version ${version.number} is approved and ready to publish.</div>${person.role === 'marketer' ? `<button class="button button-primary full" data-action="publish">Mark as published ${icon('arrow', 16)}</button>` : '<p class="role-hint">Switch to Marketing to mark it published.</p>'}`;
    } else if (submission.status === 'published') {
      actions = `<div class="route-ready">${icon('check', 18)} This approved version was marked published.</div>`;
    } else if (submission.status === 'changes_requested') {
      actions = `<div class="gate-note">${icon('clock', 16)} Waiting for Marketing to submit a new version.</div>${person.role === 'marketer' ? `<button class="button button-primary full" data-action="new-version">Submit revision ${icon('arrow', 16)}</button>` : ''}`;
    } else if (current) {
      actions = `${pending ? `<div class="gate-note">${icon('alert', 16)} Resolve ${pending} open finding${pending === 1 ? '' : 's'} before approval.</div>` : ''}${person.role === current.role ? `<button class="button button-primary full" data-action="approve" ${pending ? 'disabled' : ''}>Approve ${h(current.name)} ${icon('arrow', 16)}</button><button class="button button-outline full" data-action="request-changes">Request changes</button>` : `<div class="role-hint">Next: ${h(data.roleLabels[current.role] || current.role)} <button data-action="switch-role" data-role="${h(current.role)}">Switch to reviewer ${icon('arrow', 14)}</button></div>`}`;
    }
  }
  return `<div class="route-card"><div class="route-top"><div class="eyebrow">APPROVAL ROUTE</div><h3>${version.stagePlan.length} ${version.stagePlan.length === 1 ? 'stage' : 'stages'}</h3><p>Captured for version ${version.number}</p></div><div class="route-steps">${version.stagePlan.map((stage, index) => {
    const status = stageState(submission, stage, version);
    const approval = decisionsOf(submission, version).find((decision) => decision.stageId === stage.id && decision.action === 'approved');
    return `<div class="route-step ${status}"><div class="route-index">${status === 'done' ? icon('check', 14) : String(index + 1).padStart(2, '0')}</div><div><strong>${h(stage.name)}</strong><span>${h(data.roleLabels[stage.role] || stage.role)}${approval ? ` · ${h(approval.actor)}` : ''}</span></div><small>${status === 'done' ? 'Approved' : status === 'current' ? 'Current' : 'Upcoming'}</small></div>`;
  }).join('')}</div>${isCurrent ? `<div class="route-actions">${actions}</div>` : ''}</div><div class="evidence-card">${icon('lock', 19)}<div><strong>Version-bound approval</strong><p>Decisions apply only to this exact content and rule snapshot. A revision starts a new review.</p></div></div>`;
}

function assetPanel(version) {
  const asset = version.asset;
  return `<section class="panel asset-panel"><div class="asset-header"><div><span class="asset-overline">MATERIAL PREVIEW</span><h2>Submitted copy</h2></div><div class="asset-version">v${version.number} <span>·</span> ${version.hash.slice(0, 10)}</div></div><div class="asset-body"><div class="asset-paper"><div class="paper-top"><span class="paper-brand">ClearPath<span>.</span></span><span class="paper-kicker">REVIEW COPY</span></div><div class="copy-content">${h(version.content).replace(/\n/g, '<br/>')}</div><div class="paper-footer">Submitted ${displayTime(version.createdAt)} by ${h(version.author)}</div></div>${asset ? `<div class="attachment"><div class="attachment-head">${icon('file', 17)} <strong>${h(asset.name)}</strong><span>${asset.mime === 'application/pdf' ? 'PDF attachment' : 'Image attachment'}</span></div>${asset.mime.startsWith('image/') ? `<img src="${asset.data}" alt="Uploaded marketing material" />` : `<a class="attachment-link" href="${asset.data}" target="_blank" rel="noopener noreferrer">Open attached PDF ${icon('external', 15)}</a>`}</div>` : ''}${version.referenceUrl ? `<a class="reference-link" href="${h(version.referenceUrl)}" target="_blank" rel="noopener noreferrer">${icon('external', 15)} Open source URL</a>` : ''}</div></section>`;
}

function comparisonPanel(submission, version) {
  const previous = submission.versions.find((item) => item.number === version.number - 1);
  if (!previous) return '';
  return `<details class="panel comparison-panel"><summary>${icon('layers', 17)} Compare version ${previous.number} and ${version.number}<span>See exactly what changed ${icon('chevron', 15)}</span></summary><div class="comparison-grid"><div><strong>Version ${previous.number} · earlier</strong><div class="comparison-copy">${h(previous.content).replace(/\n/g, '<br/>')}</div><div class="comparison-tags">${previous.tags.map(tagPill).join('')}</div></div><div><strong>Version ${version.number} · selected</strong><div class="comparison-copy">${h(version.content).replace(/\n/g, '<br/>')}</div><div class="comparison-tags">${version.tags.map(tagPill).join('')}</div></div></div></details>`;
}

function historyPanel(submission) {
  const entries = [...submission.events].reverse();
  return `<div class="history-grid"><section class="panel detail-panel"><div class="section-head"><div><div class="eyebrow">PERMANENT RECORD</div><h2>Activity timeline</h2></div><button class="button button-outline button-small" data-action="export-audit">${icon('download', 15)} Export audit</button></div><div class="timeline">${entries.map((entry) => `<div class="timeline-entry"><span class="timeline-marker"></span><div><strong>${h(entry.detail)}</strong><p>${h(entry.actor)} · ${displayTime(entry.at)}</p></div></div>`).join('')}</div></section><section class="panel detail-panel"><div class="section-head"><div><div class="eyebrow">CONTENT HISTORY</div><h2>Versions</h2></div></div><div class="version-history">${[...submission.versions].reverse().map((version) => `<button data-version="${version.id}" data-tab="review"><span class="version-badge">v${version.number}</span><span><strong>${displayTime(version.createdAt)}</strong><small>${h(version.tags.map(tagLabel).join(' · ') || 'No tags')} · ${version.hash.slice(0, 12)}</small></span>${icon('chevron', 16)}</button>`).join('')}</div></section></div>`;
}

function detailPage() {
  const submission = data.submissions.find((item) => item.id === ui.selectedId);
  if (!submission) { ui.page = 'submissions'; return submissionsPage(); }
  const version = selectedVersion(submission);
  const isCurrent = version.id === versionOf(submission).id;
  return `<div class="page-wrap detail-wrap"><button class="back-link" data-nav="submissions">${icon('back', 16)} All submissions</button><div class="detail-heading"><div><div class="eyebrow">SUBMISSION CP-${submission.number}</div><h1>${h(submission.title)}</h1><div class="detail-meta">${isCurrent ? statusPill(submission.status) : '<span class="status historic">Historical version</span>'}<span class="meta-divider"></span>${avatar(submission.owner)} <span>Owned by ${h(submission.owner)}</span><span class="meta-divider"></span><span>Updated ${displayDate(submission.updatedAt)}</span></div></div><div class="detail-top-actions"><button class="button button-outline" data-action="export-audit">${icon('download', 16)} Audit package</button>${isCurrent && currentPerson().role === 'marketer' ? `<button class="button button-primary" data-action="new-version">${icon('plus', 16)} Submit revision</button>` : ''}</div></div><div class="detail-tags">${version.tags.map(tagPill).join('') || '<span class="muted">No tags</span>'}</div>
    <div class="detail-tabs"><button class="${ui.detailTab === 'review' ? 'active' : ''}" data-tab="review">Review</button><button class="${ui.detailTab === 'history' ? 'active' : ''}" data-tab="history">History & evidence</button><div class="version-picker"><span>Viewing</span><select id="version-select" aria-label="View version">${[...submission.versions].reverse().map((item) => `<option value="${item.id}" ${item.id === version.id ? 'selected' : ''}>Version ${item.number}${item.id === versionOf(submission).id ? ' · current' : ''}</option>`).join('')}</select></div></div>
    ${ui.detailTab === 'history' ? historyPanel(submission) : `<div class="detail-grid"><div class="detail-main">${assetPanel(version)}${comparisonPanel(submission, version)}${checksPanel(version)}${findingsPanel(submission, version, isCurrent)}${commentsPanel(submission, version, isCurrent)}</div><aside class="detail-side">${routePanel(submission, version, isCurrent)}</aside></div>`}
  </div>`;
}

function rulesPage() {
  return `<div class="page-wrap"><div class="page-heading"><div><div class="eyebrow">POLICY LIBRARY</div><h1>Rule library</h1><p>Write simple preflight checks and choose the tags that activate them.</p></div><button class="button button-primary" data-action="new-rule">${icon('plus', 17)} New rule</button></div><div class="info-strip">${icon('spark', 18)}<span>Rules are sample policy checks. Their version and source are saved with every submission they evaluate.</span></div><div class="rule-grid">${data.rules.map((rule) => `<article class="rule-card ${rule.active ? '' : 'inactive'}"><div class="rule-card-top"><span class="category category-${rule.category.toLowerCase().replace(/\W+/g, '-')}">${h(rule.category)}</span><span class="rule-state">${rule.active ? 'Active' : 'Paused'}</span></div><h3>${h(rule.name)}</h3><p>${rule.kind === 'required' ? 'Require the phrase' : 'Flag the phrase'} <strong>“${h(rule.term)}”</strong> in submitted copy.</p><div class="rule-scope"><span>APPLIES TO</span><div class="tag-list">${rule.scopeTags.length ? rule.scopeTags.map(tagPill).join('') : '<span class="tag tag-global">All submissions</span>'}</div></div><div class="rule-foot"><div><span class="severity severity-${h(rule.severity)}">${h(rule.severity)}</span><small>v${rule.version} · ${h(rule.source)}</small></div><button class="icon-button" data-action="edit-rule" data-id="${rule.id}" aria-label="Edit ${h(rule.name)}">${icon('edit', 17)}</button></div></article>`).join('')}</div></div>`;
}

function pipelinePage() {
  const tags = ui.previewTags.split(',').map((tag) => tag.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean);
  const stages = [...data.stages].sort((a, b) => a.order - b.order);
  const matched = stages.filter((stage) => applicable(stage, tags));
  const matchedRules = data.rules.filter((rule) => applicable(rule, tags));
  return `<div class="page-wrap"><div class="page-heading"><div><div class="eyebrow">REVIEW DESIGN</div><h1>Pipelines</h1><p>Set the review route. Every stage can apply globally or only to matching tags.</p></div><button class="button button-primary" data-action="new-stage">${icon('plus', 17)} Add stage</button></div><div class="pipeline-layout"><div><div class="pipeline-intro"><div class="eyebrow">ACTIVE ROUTE</div><h2>Approval stages</h2><p>Stages run in order. All tags on a stage must be present for it to join a submission’s route.</p></div><div class="stage-stack">${stages.map((stage, index) => `<article class="stage-card ${stage.active ? '' : 'inactive'}"><div class="stage-order">${String(index + 1).padStart(2, '0')}</div><div class="stage-content"><div class="stage-title"><h3>${h(stage.name)}</h3><span class="rule-state">${stage.active ? 'Active' : 'Paused'}</span></div><p>${h(data.roleLabels[stage.role] || stage.role)} approval</p><div class="stage-tags"><span>WHEN</span>${stage.scopeTags.length ? stage.scopeTags.map(tagPill).join('') : '<span class="tag tag-global">Every submission</span>'}</div></div><button class="icon-button" data-action="edit-stage" data-id="${stage.id}" aria-label="Edit ${h(stage.name)}">${icon('edit', 17)}</button></article>`).join('')}</div></div><aside class="pipeline-preview"><div class="preview-head"><span class="preview-icon">${icon('workflow', 20)}</span><div><div class="eyebrow">TEST YOUR ROUTE</div><h3>Preview by tags</h3></div></div><p>Enter any tags to see the review stages and checks they would trigger.</p><label class="form-field"><span>Submission tags</span><input id="preview-tags" placeholder="e.g. affiliate, high-risk" value="${h(ui.previewTags)}" /></label><div id="preview-results">${previewResults(matched, matchedRules)}</div></aside></div></div>`;
}
function previewResults(stages, rules) {
  return `<div class="preview-results"><div class="preview-section"><strong>Approval route <span>${stages.length}</span></strong>${stages.length ? stages.map((stage, index) => `<div class="preview-row"><span>${index + 1}</span>${h(stage.name)} <small>${h(data.roleLabels[stage.role] || stage.role)}</small></div>`).join('') : '<p>No active stages matched.</p>'}</div><div class="preview-section"><strong>Policy checks <span>${rules.length}</span></strong>${rules.length ? rules.map((rule) => `<div class="preview-row"><span>${icon('bolt', 14)}</span>${h(rule.name)}</div>`).join('') : '<p>No active rules matched.</p>'}</div></div>`;
}

function auditPage() {
  const events = data.submissions.flatMap((item) => item.events.map((event) => ({ ...event, submission: item }))).sort((a, b) => b.at.localeCompare(a.at));
  const decisions = data.submissions.reduce((sum, item) => sum + item.decisions.length, 0);
  const versions = data.submissions.reduce((sum, item) => sum + item.versions.length, 0);
  return `<div class="page-wrap"><div class="page-heading"><div><div class="eyebrow">EVIDENCE CENTER</div><h1>Audit trail</h1><p>Trace what was submitted, checked, changed, approved, and published.</p></div></div><div class="audit-summary"><div>${icon('layers', 20)}<strong>${versions}</strong><span>immutable versions</span></div><div>${icon('check', 20)}<strong>${decisions}</strong><span>recorded decisions</span></div><div>${icon('history', 20)}<strong>${events.length}</strong><span>submission events</span></div></div><div class="audit-grid"><section class="panel detail-panel"><div class="section-head"><div><div class="eyebrow">ACTIVITY LOG</div><h2>All submissions</h2></div></div><div class="audit-list">${events.map((entry) => `<button data-open="${entry.submission.id}" class="audit-entry"><span class="audit-symbol">${icon(entry.type === 'approved' || entry.type === 'authorized' ? 'check' : entry.type === 'preflight' ? 'bolt' : 'file', 17)}</span><span><strong>${h(entry.detail)}</strong><small>CP-${entry.submission.number} · ${h(entry.submission.title)}</small></span><span class="audit-time">${displayTime(entry.at)}</span></button>`).join('')}</div></section><aside class="panel detail-panel export-panel"><div class="eyebrow">EXPORT EVIDENCE</div><h2>Audit package</h2><p>Download a submission’s content hashes, rule snapshots, findings, decisions, comments, and complete event history as JSON.</p><label class="form-field"><span>Choose a submission</span><select id="audit-select">${data.submissions.map((item) => `<option value="${item.id}">CP-${item.number} · ${h(item.title)}</option>`).join('')}</select></label><button class="button button-primary full" data-action="export-selected">${icon('download', 16)} Download package</button><div class="export-note">${icon('lock', 16)} Approval is tied to the exact submitted version.</div><div class="config-history"><strong>Policy changes</strong>${[...data.configEvents].reverse().slice(0, 6).map((entry) => `<div>${h(entry.detail)}<small>${h(entry.actor)} · ${displayTime(entry.at)}</small></div>`).join('') || '<p>No policy changes yet.</p>'}</div></aside></div></div>`;
}

function render() {
  if (!data) return;
  let content;
  if (ui.page === 'overview') content = overview();
  else if (ui.page === 'submissions') content = submissionsPage();
  else if (ui.page === 'detail') content = detailPage();
  else if (ui.page === 'rules') content = rulesPage();
  else if (ui.page === 'pipeline') content = pipelinePage();
  else content = auditPage();
  app.innerHTML = shell(content);
  modalRoot.innerHTML = ui.modal ? modalMarkup() : '';
}

function inputField(name, label, value = '', placeholder = '', extra = '') {
  return `<label class="form-field"><span>${label}</span><input name="${name}" value="${h(value)}" placeholder="${h(placeholder)}" ${extra} /></label>`;
}
function modal(title, subtitle, fields, submit, width = '') {
  return `<div class="modal-overlay" data-action="close-modal"><div class="modal ${width}" role="dialog" aria-modal="true" aria-label="${h(title)}"><div class="modal-head"><div><div class="eyebrow">CLEARPATH REVIEW STUDIO</div><h2>${h(title)}</h2><p>${h(subtitle)}</p></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon('close', 18)}</button></div><form data-form="${ui.modal.type}" class="modal-form">${fields}<div class="modal-actions"><button class="button button-outline" type="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">${h(submit)} ${icon('arrow', 16)}</button></div></form></div></div>`;
}
function modalMarkup() {
  const config = ui.modal;
  const submission = data.submissions.find((item) => item.id === ui.selectedId);
  const version = submission && versionOf(submission);
  if (config.type === 'new-submission' || config.type === 'new-version') {
    const revise = config.type === 'new-version';
    const fields = `${revise ? `<div class="revision-note">${icon('history', 17)} Version ${version.number + 1} will run current checks and restart approvals.</div>` : inputField('title', 'Material title', '', 'e.g. Summer campaign email', 'required maxlength="180"')}
      ${inputField('tags', 'Tags', revise ? version.tags.join(', ') : '', 'e.g. credit-card, email, high-risk')}
      <div class="field-help">Use any tags. Matching rules and review stages apply automatically.</div>
      <label class="form-field"><span>Review copy</span><textarea name="content" rows="8" placeholder="Paste the copy reviewers should assess…" required>${revise ? h(version.content) : ''}</textarea></label>
      ${inputField('referenceUrl', 'Source URL · optional', revise ? version.referenceUrl : '', 'https://example.com/campaign')}
      <label class="form-field"><span>Attachment · optional</span><input name="asset" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" /></label><div class="field-help">PNG, JPEG, WebP or PDF up to 5 MB. Paste reviewable text above for preflight checks.${revise && version.asset ? ` Current attachment: ${h(version.asset.name)}.` : ''}</div>`;
    return modal(revise ? 'Submit a revision' : 'New submission', revise ? 'A new version creates a fresh review record.' : 'Bring any marketing material into the shared queue.', fields, revise ? 'Submit revision' : 'Start review', 'modal-wide');
  }
  if (config.type === 'manual-finding') {
    return modal('Add a finding', 'Leave specific, actionable feedback on the current version.', `${inputField('title', 'Finding title', '', 'What needs attention?', 'required')}<label class="form-field"><span>Severity</span><select name="severity"><option>medium</option><option>low</option><option>high</option></select></label><label class="form-field"><span>Explanation</span><textarea name="body" rows="4" required placeholder="Describe the concern and what to change…"></textarea></label>${inputField('evidence', 'Quoted text or location · optional', '', 'Text in the material')}`, 'Add finding');
  }
  if (config.type === 'resolve-finding') {
    const finding = submission.findings.find((item) => item.id === config.id);
    return modal('Resolve finding', finding.title, `<label class="form-field"><span>Resolution</span><select name="status"><option value="resolved">Resolved</option><option value="not_applicable">Not applicable</option></select></label><label class="form-field"><span>Rationale</span><textarea name="rationale" rows="4" required placeholder="Explain why this finding is closed…"></textarea></label>`, 'Save resolution');
  }
  if (config.type === 'request-changes') {
    return modal('Request changes', 'Send this version back to marketing with a clear next step.', `<label class="form-field"><span>What needs to change?</span><textarea name="note" rows="5" required placeholder="Be specific about the revision needed…"></textarea></label>`, 'Request changes');
  }
  if (config.type === 'rule') {
    const rule = data.rules.find((item) => item.id === config.id);
    const fields = `${inputField('name', 'Rule name', rule?.name, 'e.g. Include offer terms', 'required')}
      <div class="form-grid"><label class="form-field"><span>Check type</span><select name="kind"><option value="required" ${rule?.kind === 'required' ? 'selected' : ''}>Required phrase</option><option value="forbidden" ${rule?.kind === 'forbidden' ? 'selected' : ''}>Prohibited phrase</option></select></label><label class="form-field"><span>Severity</span><select name="severity">${['low','medium','high'].map((value) => `<option ${rule?.severity === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div>
      ${inputField('term', 'Phrase to check', rule?.term, 'Exact text, case insensitive', 'required')}
      <div class="form-grid"><label class="form-field"><span>Policy category</span><select name="category">${['Internal policy','Federal','State','Industry standard'].map((value) => `<option ${rule?.category === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>${inputField('source', 'Policy source', rule?.source, 'Document or policy reference', 'required')}</div>
      ${inputField('scopeTags', 'Apply when all these tags are present', rule?.scopeTags.join(', '), 'Leave empty for every submission')}
      <label class="toggle-field"><input type="checkbox" name="active" ${rule?.active !== false ? 'checked' : ''}/><span>Rule is active</span></label>`;
    return modal(rule ? 'Edit rule' : 'New rule', 'Changes apply to future versions. Historical check results remain intact.', fields, rule ? 'Save rule' : 'Create rule', 'modal-wide');
  }
  if (config.type === 'stage') {
    const stage = data.stages.find((item) => item.id === config.id);
    const fields = `${inputField('name', 'Stage name', stage?.name, 'e.g. State review', 'required')}
      <div class="form-grid"><label class="form-field"><span>Reviewer team</span><select name="role">${Object.entries(data.roleLabels).filter(([role]) => role !== 'marketer').map(([role, label]) => `<option value="${role}" ${stage?.role === role ? 'selected' : ''}>${h(label)}</option>`).join('')}</select></label>${inputField('order', 'Order', stage?.order ?? data.stages.length + 1, '1', 'type="number" min="1" required')}</div>
      ${inputField('scopeTags', 'Apply when all these tags are present', stage?.scopeTags.join(', '), 'Leave empty for every submission')}
      <label class="toggle-field"><input type="checkbox" name="active" ${stage?.active !== false ? 'checked' : ''}/><span>Stage is active</span></label>`;
    return modal(stage ? 'Edit stage' : 'Add review stage', 'Matching stages become part of a version’s approval route.', fields, stage ? 'Save stage' : 'Add stage');
  }
  return '';
}

async function fileFrom(form, priorAsset = null) {
  const file = form.elements.asset?.files?.[0];
  if (!file) return priorAsset;
  if (file.size > 5_000_000) throw new Error('Attachment must be under 5 MB.');
  if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type)) throw new Error('Attach a PNG, JPEG, WebP, or PDF file.');
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read attachment.'));
    reader.readAsDataURL(file);
  });
  return { name: file.name, mime: file.type, data: dataUrl };
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action], [data-nav], [data-open], [data-tab], [data-version]');
  if (!target) return;
  if (target.dataset.action === 'close-modal' && target !== event.target && target.classList.contains('modal-overlay')) return;
  if (target.dataset.nav) { ui.page = target.dataset.nav; ui.modal = null; render(); window.scrollTo(0, 0); return; }
  if (target.dataset.open) { ui.selectedId = target.dataset.open; ui.selectedVersionId = null; ui.detailTab = 'review'; ui.page = 'detail'; render(); window.scrollTo(0, 0); return; }
  if (target.dataset.tab) { ui.detailTab = target.dataset.tab; if (target.dataset.version) ui.selectedVersionId = target.dataset.version; render(); return; }
  if (target.dataset.version) { ui.selectedVersionId = target.dataset.version; ui.detailTab = 'review'; render(); return; }
  const action = target.dataset.action;
  if (!action) return;
  if (action === 'close-modal') { ui.modal = null; render(); return; }
  if (action === 'new-submission') ui.modal = { type: 'new-submission' };
  else if (action === 'new-version') ui.modal = { type: 'new-version' };
  else if (action === 'manual-finding') ui.modal = { type: 'manual-finding' };
  else if (action === 'resolve-finding') ui.modal = { type: 'resolve-finding', id: target.dataset.id };
  else if (action === 'request-changes') ui.modal = { type: 'request-changes' };
  else if (action === 'new-rule') ui.modal = { type: 'rule' };
  else if (action === 'edit-rule') ui.modal = { type: 'rule', id: target.dataset.id };
  else if (action === 'new-stage') ui.modal = { type: 'stage' };
  else if (action === 'edit-stage') ui.modal = { type: 'stage', id: target.dataset.id };
  else if (action === 'approve') return mutate('POST', `/api/submissions/${ui.selectedId}/decisions`, { action: 'approve', note: '' }, 'Approval recorded for this version.');
  else if (action === 'publish') return mutate('POST', `/api/submissions/${ui.selectedId}/publish`, {}, 'Publication recorded.');
  else if (action === 'switch-role') {
    const match = data.people.find((person) => person.role === target.dataset.role);
    if (match) { ui.actorId = match.id; localStorage.setItem('clearpath-actor', match.id); render(); toast(`Viewing as ${match.name}.`); }
    return;
  } else if (action === 'export-audit' || action === 'export-selected') {
    const id = action === 'export-selected' ? document.getElementById('audit-select')?.value : ui.selectedId;
    if (id) window.location.href = `/api/submissions/${id}/audit`;
    return;
  }
  render();
  modalRoot.querySelector('input, textarea, select')?.focus();
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'actor-select' || event.target.id === 'mobile-actor-select') { ui.actorId = event.target.value; localStorage.setItem('clearpath-actor', ui.actorId); render(); }
  if (event.target.id === 'status-filter') { ui.status = event.target.value; render(); }
  if (event.target.id === 'tag-filter') { ui.tag = event.target.value; render(); }
  if (event.target.id === 'version-select') { ui.selectedVersionId = event.target.value; render(); }
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'queue-search') {
    const position = event.target.selectionStart;
    ui.query = event.target.value;
    render();
    const input = document.getElementById('queue-search');
    input?.focus();
    input?.setSelectionRange(position, position);
  }
  if (event.target.id === 'preview-tags') {
    ui.previewTags = event.target.value;
    const tags = ui.previewTags.split(',').map((tag) => tag.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean);
    document.getElementById('preview-results').innerHTML = previewResults(
      [...data.stages].sort((a, b) => a.order - b.order).filter((stage) => applicable(stage, tags)),
      data.rules.filter((rule) => applicable(rule, tags))
    );
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  const type = form.dataset.form;
  const values = Object.fromEntries(new FormData(form).entries());
  if (type === 'comment') return mutate('POST', `/api/submissions/${ui.selectedId}/comments`, { body: values.body }, 'Comment posted.');
  if (type === 'new-submission' || type === 'new-version') {
    try {
      const prior = type === 'new-version' ? versionOf(data.submissions.find((item) => item.id === ui.selectedId)).asset : null;
      const asset = await fileFrom(form, prior);
      const body = { title: values.title, tags: values.tags, content: values.content, referenceUrl: values.referenceUrl, asset };
      const path = type === 'new-version' ? `/api/submissions/${ui.selectedId}/versions` : '/api/submissions';
      const result = await request('POST', path, { ...body, actorId: ui.actorId });
      ui.selectedId = result.id; ui.selectedVersionId = null; ui.page = 'detail'; ui.detailTab = 'review'; ui.modal = null;
      await refresh(); toast(type === 'new-version' ? 'Revision submitted. Checks and route refreshed.' : 'Submission added to the review queue.');
      window.scrollTo(0, 0);
    } catch (error) { toast(error.message, 'error'); }
    return;
  }
  if (type === 'manual-finding') return mutate('POST', `/api/submissions/${ui.selectedId}/findings`, values, 'Finding added.');
  if (type === 'resolve-finding') return mutate('PATCH', `/api/submissions/${ui.selectedId}/findings/${ui.modal.id}`, values, 'Resolution recorded.');
  if (type === 'request-changes') return mutate('POST', `/api/submissions/${ui.selectedId}/decisions`, { action: 'request_changes', note: values.note }, 'Changes requested.');
  if (type === 'rule') {
    const path = ui.modal.id ? `/api/rules/${ui.modal.id}` : '/api/rules';
    return mutate(ui.modal.id ? 'PATCH' : 'POST', path, { ...values, scopeTags: values.scopeTags, active: form.elements.active.checked }, 'Rule saved.');
  }
  if (type === 'stage') {
    const path = ui.modal.id ? `/api/stages/${ui.modal.id}` : '/api/stages';
    return mutate(ui.modal.id ? 'PATCH' : 'POST', path, { ...values, order: Number(values.order), scopeTags: values.scopeTags, active: form.elements.active.checked }, 'Stage saved.');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && ui.modal) { ui.modal = null; render(); }
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-open]')) { event.preventDefault(); event.target.click(); }
});

refresh().catch((error) => { app.innerHTML = `<div class="fatal-error"><h1>Could not load Review Studio</h1><p>${h(error.message)}</p><button onclick="location.reload()">Try again</button></div>`; });
