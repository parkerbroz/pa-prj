const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const toastRoot = document.getElementById('toast-root');

let data;
const ui = {
  page: 'mrs', mrId: null, stageId: null, versionId: null, detailTab: 'review',
  query: '', status: 'all', tag: 'all', previewTags: '', modal: null,
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
const tagsFrom = (input) => [...new Set(String(input || '').split(',').map((tag) => tag.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean))];
const currentVersion = (mr) => mr.versions.at(-1);
const selectedVersion = (mr) => mr.versions.find((version) => version.id === ui.versionId) || currentVersion(mr);
const actor = () => data.people.find((person) => person.id === ui.actorId) || data.people[1];
const findingsFor = (mr, version) => mr.findings.filter((finding) => finding.versionId === version.id);
const decisionsFor = (mr, version) => mr.decisions.filter((decision) => decision.versionId === version.id);
const nextStage = (mr) => currentVersion(mr).stagePlan.find((stage) => !decisionsFor(mr, currentVersion(mr)).some((decision) => decision.stageId === stage.id && decision.action === 'approved'));
const applies = (item, tags) => item.active && item.scopeTags.every((tag) => tags.includes(tag));
const matchingRules = (tags) => data.rules.filter((rule) => applies(rule, tags) && (!rule.stageId || data.stages.some((stage) => stage.id === rule.stageId && applies(stage, tags))));
const statusName = (status) => ({ in_review: 'In review', changes_requested: 'Changes requested', approved: 'Approved', published: 'Published' })[status] || status;
const pill = (label, kind = '') => `<span class="pill ${kind}">${h(label)}</span>`;
const tagPills = (tags) => tags.length ? tags.map((tag) => pill(tag, 'tag')).join('') : '<span class="muted">No tags</span>';
const statusPill = (status) => pill(statusName(status), `status-${status}`);
const canConfigure = () => actor().role !== 'marketer';

function readRoute() {
  const parts = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
  if (parts[0] === 'pipeline' && parts[1] === 'stages') {
    ui.page = 'stage'; ui.stageId = parts[2] === 'new' ? null : parts[2] || null;
  } else if (parts[0] === 'pipeline') {
    ui.page = 'pipeline'; ui.stageId = null;
  } else if (parts[0] === 'mrs' && parts[1]) {
    ui.page = 'mr'; ui.mrId = parts[1];
  } else { ui.page = 'mrs'; ui.mrId = null; }
}
function go(page, id = null) {
  const path = page === 'pipeline' ? '/pipeline' : page === 'stage' ? `/pipeline/stages/${id || 'new'}` : page === 'mr' ? `/mrs/${id}` : '/mrs';
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
    <header class="topbar"><div class="topbar-inner"><button class="workspace-name" data-nav="mrs">Review workspace</button><nav aria-label="Main navigation"><button class="nav-link ${['mrs','mr'].includes(ui.page) ? 'active' : ''}" data-nav="mrs">MRs</button><button class="nav-link ${['pipeline','stage'].includes(ui.page) ? 'active' : ''}" data-nav="pipeline">Pipeline</button></nav><label class="user-switch"><span>Viewing as</span><select id="actor-select" aria-label="Demo user">${data.people.map((person) => `<option value="${person.id}" ${person.id === selected.id ? 'selected' : ''}>${h(person.name)} · ${h(data.roleLabels[person.role])}</option>`).join('')}</select></label></div></header>
    <main class="page">${content}</main>
  </div>`;
}

function mrList() {
  const tags = [...new Set(data.submissions.flatMap((mr) => currentVersion(mr).tags))].sort();
  const query = ui.query.trim().toLowerCase();
  const items = data.submissions.filter((mr) => {
    const version = currentVersion(mr);
    return (ui.status === 'all' || mr.status === ui.status)
      && (ui.tag === 'all' || version.tags.includes(ui.tag))
      && (!query || `${mr.number} ${mr.title} ${mr.owner} ${version.tags.join(' ')}`.toLowerCase().includes(query));
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `<div class="page-heading"><div><div class="eyebrow">REVIEW QUEUE</div><h1>MRs</h1><p>Marketing materials awaiting review and approval.</p></div><button class="button primary" data-action="new-mr">${icon('plus')} New MR</button></div>
    <div class="panel"><div class="toolbar"><label class="search">${icon('search')}<input id="mr-search" type="search" placeholder="Search MRs, owners, tags" value="${h(ui.query)}" /></label><select id="status-filter" aria-label="Filter by status"><option value="all">All statuses</option>${['in_review','changes_requested','approved','published'].map((status) => `<option value="${status}" ${ui.status === status ? 'selected' : ''}>${statusName(status)}</option>`).join('')}</select><select id="tag-filter" aria-label="Filter by tag"><option value="all">All tags</option>${tags.map((tag) => `<option value="${h(tag)}" ${ui.tag === tag ? 'selected' : ''}>${h(tag)}</option>`).join('')}</select></div>
    <div class="table-wrap"><table><thead><tr><th>MR</th><th>Tags</th><th>Owner</th><th>Next step</th><th>Updated</th><th>Status</th></tr></thead><tbody>${items.map((mr) => {
      const version = currentVersion(mr);
      const next = mr.status === 'changes_requested' ? 'Marketing revision' : mr.status === 'approved' ? 'Ready to publish' : mr.status === 'published' ? 'Complete' : nextStage(mr)?.name || 'Complete';
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
  const failed = version.checks.filter((check) => !check.passed).length;
  return `<section class="panel section"><div class="section-heading"><div><h2>Checks <span class="count">${version.checks.length}</span></h2><p>Automated flags are advisory; reviewers make approval decisions.</p></div>${pill(failed ? `${failed} flagged` : 'All clear', failed ? 'status-changes_requested' : 'status-approved')}</div><div class="item-list">${version.checks.map((check) => `<div class="list-item"><span class="result-icon ${check.passed ? 'passed' : 'failed'}">${icon(check.passed ? 'check' : 'alert')}</span><div class="item-body"><strong>${h(check.name)}</strong><small>${h(check.stageName || 'Pipeline preflight')} · ${h(check.category)} · ${h(check.source)} · rule v${check.ruleVersion}</small>${check.evidence ? `<p>${h(check.evidence)}</p>` : ''}</div><span class="muted">${check.passed ? 'Passed' : 'Review'}</span></div>`).join('') || '<div class="empty compact">No checks applied to this version.</div>'}</div></section>`;
}
function findingsPanel(mr, version, isCurrent) {
  const findings = findingsFor(mr, version);
  const editable = isCurrent && canConfigure() && !['approved', 'published'].includes(mr.status);
  return `<section class="panel section"><div class="section-heading"><h2>Findings <span class="count">${findings.length}</span></h2>${editable ? '<button class="button" data-action="manual-finding">+ Add finding</button>' : ''}</div><div class="item-list">${findings.map((finding) => `<div class="finding"><div class="finding-head"><strong>${h(finding.title)}</strong><span>${pill(finding.severity, `severity-${finding.severity}`)} ${pill(finding.status.replace('_', ' '), finding.status === 'open' ? 'status-changes_requested' : 'status-approved')}</span></div><p>${h(finding.body)}</p>${finding.evidence ? `<blockquote>${h(finding.evidence)}</blockquote>` : ''}<small>${h(finding.createdBy)} · ${time(finding.createdAt)}</small>${finding.status === 'open' && editable ? `<button class="link-button" data-action="resolve-finding" data-id="${finding.id}">Resolve finding →</button>` : ''}${finding.status !== 'open' ? `<div class="resolution">${h(finding.resolution)} · ${h(finding.resolvedBy)}</div>` : ''}</div>`).join('') || '<div class="empty compact">No findings on this version.</div>'}</div></section>`;
}
function discussionPanel(mr, version, isCurrent) {
  const comments = mr.comments.filter((comment) => comment.versionId === version.id);
  return `<section class="panel section"><div class="section-heading"><h2>Discussion <span class="count">${comments.length}</span></h2></div><div class="item-list">${comments.map((comment) => `<div class="comment"><div><strong>${h(comment.author)}</strong><small>${h(data.roleLabels[comment.role])} · ${time(comment.at)}</small></div><p>${h(comment.body)}</p></div>`).join('') || '<div class="empty compact">No comments yet.</div>'}</div>${isCurrent ? '<form data-form="comment" class="comment-form"><textarea name="body" rows="3" required placeholder="Add a comment…"></textarea><button class="button" type="submit">Post comment</button></form>' : ''}</section>`;
}
function routePanel(mr, version, isCurrent) {
  const decisions = decisionsFor(mr, version);
  const pending = findingsFor(mr, version).filter((finding) => finding.status === 'open').length;
  const current = isCurrent ? nextStage(mr) : null;
  let actions = '';
  if (isCurrent && mr.status === 'approved') actions = actor().role === 'marketer' ? '<button class="button primary full" data-action="publish">Mark published</button>' : '<p class="hint">Approved. Switch to Marketing to mark it published.</p>';
  else if (isCurrent && mr.status === 'published') actions = '<p class="hint">This version was marked published.</p>';
  else if (isCurrent && mr.status === 'changes_requested') actions = actor().role === 'marketer' ? '<button class="button primary full" data-action="new-version">Submit revision</button>' : '<p class="hint">Waiting for a marketing revision.</p>';
  else if (isCurrent && current) actions = `${pending ? `<p class="hint warning">Resolve ${pending} open finding${pending === 1 ? '' : 's'} before approval.</p>` : ''}${actor().role === current.role ? `<button class="button primary full" data-action="approve" ${pending ? 'disabled' : ''}>Approve ${h(current.name)}</button><button class="button full" data-action="request-changes">Request changes</button>` : `<p class="hint">Next reviewer: ${h(data.roleLabels[current.role] || current.role)}.</p><button class="button full" data-action="switch-role" data-role="${h(current.role)}">Switch to reviewer</button>`}`;
  return `<aside class="panel route"><h2>Approval route</h2><p>For version ${version.number}. A revision starts a new route.</p><ol>${version.stagePlan.map((stage) => {
    const approval = decisions.find((decision) => decision.stageId === stage.id && decision.action === 'approved');
    const state = approval ? 'done' : current?.id === stage.id ? 'current' : 'waiting';
    return `<li class="${state}"><span class="step-dot">${approval ? icon('check', 13) : version.stagePlan.indexOf(stage) + 1}</span><div><strong>${h(stage.name)}</strong><small>${h(data.roleLabels[stage.role] || stage.role)}${approval ? ` · ${h(approval.actor)}` : ''}</small></div><span class="step-state">${approval ? 'Approved' : state === 'current' ? 'Current' : 'Waiting'}</span></li>`;
  }).join('')}</ol><div class="route-actions">${actions}</div></aside>`;
}
function historyPanel(mr) {
  return `<div class="history-grid"><section class="panel section"><div class="section-heading"><h2>Activity</h2><button class="button" data-action="export-audit">${icon('download')} Export audit</button></div><div class="timeline">${[...mr.events].reverse().map((entry) => `<div class="event"><div><strong>${h(entry.detail)}</strong><small>${h(entry.actor)} · ${time(entry.at)}</small></div></div>`).join('')}</div></section><section class="panel section"><h2>Versions</h2><div class="item-list">${[...mr.versions].reverse().map((version) => `<button class="version-row" data-version="${version.id}"><strong>v${version.number}</strong><span>${date(version.createdAt)}<small>${h(version.tags.join(', ') || 'No tags')} · ${version.hash.slice(0, 12)}</small></span></button>`).join('')}</div></section></div>`;
}
function mrPage() {
  const mr = data.submissions.find((item) => item.id === ui.mrId);
  if (!mr) return '<div class="empty">MR not found. <button class="link-button" data-nav="mrs">Back to MRs</button></div>';
  const version = selectedVersion(mr);
  const isCurrent = version.id === currentVersion(mr).id;
  return `<button class="back-link" data-nav="mrs">${icon('back')} All MRs</button><div class="page-heading detail-heading"><div><div class="eyebrow">MR #${mr.number}</div><h1>${h(mr.title)}</h1><div class="meta">${isCurrent ? statusPill(mr.status) : pill('Historical version')}<span>Owner ${h(mr.owner)}</span><span>Updated ${date(mr.updatedAt)}</span></div><div class="pill-row">${tagPills(version.tags)}</div></div><div class="heading-actions"><button class="button" data-action="export-audit">${icon('download')} Audit package</button>${isCurrent && actor().role === 'marketer' ? '<button class="button primary" data-action="new-version">+ New version</button>' : ''}</div></div><div class="view-tabs"><button class="${ui.detailTab === 'review' ? 'active' : ''}" data-tab="review">Review</button><button class="${ui.detailTab === 'history' ? 'active' : ''}" data-tab="history">History & evidence</button><label>Version <select id="version-select">${[...mr.versions].reverse().map((item) => `<option value="${item.id}" ${item.id === version.id ? 'selected' : ''}>v${item.number}${item.id === currentVersion(mr).id ? ' · current' : ''}</option>`).join('')}</select></label></div>${ui.detailTab === 'history' ? historyPanel(mr) : `<div class="detail-layout"><div class="detail-main">${contentPanel(version)}${comparisonPanel(mr, version)}${checksPanel(version)}${findingsPanel(mr, version, isCurrent)}${discussionPanel(mr, version, isCurrent)}</div>${routePanel(mr, version, isCurrent)}</div>`}`;
}

function checkRow(rule) {
  return `<div class="check-config ${rule.active ? '' : 'paused'}"><div><strong>${h(rule.name)}</strong><small>${rule.kind === 'required' ? 'Require' : 'Flag'} “${h(rule.term)}” · ${h(rule.category)} · ${h(rule.source)} · v${rule.version}</small><div class="pill-row">${rule.scopeTags.length ? tagPills(rule.scopeTags) : pill('All matching MRs', 'tag')}${pill(rule.active ? 'Active' : 'Paused')}</div></div>${canConfigure() ? `<button class="button small" data-action="edit-rule" data-id="${rule.id}">Edit</button>` : ''}</div>`;
}
function previewResults(tags) {
  const stages = [...data.stages].filter((stage) => applies(stage, tags)).sort((a, b) => a.order - b.order);
  const rules = matchingRules(tags);
  return `<div class="preview-group"><strong>Stages · ${stages.length}</strong>${stages.map((stage, index) => `<div>${index + 1}. ${h(stage.name)} <span>${h(data.roleLabels[stage.role])}</span></div>`).join('') || '<p>No active stages matched.</p>'}</div><div class="preview-group"><strong>Checks · ${rules.length}</strong>${rules.map((rule) => `<div>${h(rule.name)} <span>${h(data.stages.find((stage) => stage.id === rule.stageId)?.name || 'Pipeline')}</span></div>`).join('') || '<p>No active checks matched.</p>'}</div>`;
}
function pipelinePage() {
  const stages = [...data.stages].sort((a, b) => a.order - b.order);
  const globalChecks = data.rules.filter((rule) => !rule.stageId);
  return `<div class="page-heading"><div><div class="eyebrow">CONFIGURATION</div><h1>Pipeline</h1><p>One route for all MRs. Tags determine which stages and checks apply.</p></div>${canConfigure() ? `<button class="button primary" data-action="new-stage">${icon('plus')} Add stage</button>` : ''}</div><div class="builder-layout"><div><section class="panel section"><div class="section-heading"><div><h2>Stages</h2><p>Run in order. All tags on a stage must be present for it to apply.</p></div></div><div class="stage-list">${stages.map((stage) => { const count = data.rules.filter((rule) => rule.stageId === stage.id).length; return `<button class="stage-row ${stage.active ? '' : 'paused'}" data-stage="${stage.id}"><span class="stage-number">${stage.order}</span><span class="stage-details"><strong>${h(stage.name)}</strong><small>${h(data.roleLabels[stage.role])} · ${count} ${count === 1 ? 'check' : 'checks'} · ${stage.active ? 'Active' : 'Paused'}</small><span class="pill-row">${stage.scopeTags.length ? tagPills(stage.scopeTags) : pill('All MRs', 'tag')}</span></span><span class="chevron">→</span></button>`; }).join('')}</div></section><section class="panel section"><div class="section-heading"><div><h2>Pipeline-level checks</h2><p>Preflight checks not attached to a specific stage.</p></div>${canConfigure() ? '<button class="button" data-action="new-rule" data-stage-id="">+ Add check</button>' : ''}</div><div class="item-list">${globalChecks.map(checkRow).join('') || '<div class="empty compact">No pipeline-level checks.</div>'}</div></section><details class="panel disclosure"><summary>Configuration history</summary><div class="config-history">${[...data.configEvents].reverse().map((entry) => `<div>${h(entry.detail)}<small>${h(entry.actor)} · ${time(entry.at)}</small></div>`).join('') || '<div class="empty compact">No changes yet.</div>'}</div></details></div><aside class="panel section preview"><h2>Preview route</h2><p>Enter MR tags to see the stages and checks that would apply.</p><label class="field"><span>Tags</span><input id="preview-tags" placeholder="e.g. affiliate, high-risk" value="${h(ui.previewTags)}" /></label><div id="preview-results">${previewResults(tagsFrom(ui.previewTags))}</div></aside></div>`;
}
function stagePage() {
  const stage = ui.stageId ? data.stages.find((item) => item.id === ui.stageId) : null;
  if (ui.stageId && !stage) return '<div class="empty">Stage not found. <button class="link-button" data-nav="pipeline">Back to pipeline</button></div>';
  const rules = stage ? data.rules.filter((rule) => rule.stageId === stage.id) : [];
  return `<button class="back-link" data-nav="pipeline">${icon('back')} Pipeline</button><div class="page-heading"><div><div class="eyebrow">STAGE BUILDER</div><h1>${h(stage?.name || 'New stage')}</h1><p>Configure the approval gate and the checks it brings into preflight.</p></div>${stage ? pill(`v${stage.version}`) : ''}</div><div class="builder-layout"><div><section class="panel section"><div class="section-heading"><h2>Stage settings</h2></div><form data-form="stage" class="settings-form"><label class="field"><span>Name</span><input name="name" required maxlength="120" placeholder="e.g. State review" value="${h(stage?.name)}" ${canConfigure() ? '' : 'disabled'} /></label><div class="field-grid"><label class="field"><span>Reviewer team</span><select name="role" ${canConfigure() ? '' : 'disabled'}>${Object.entries(data.roleLabels).filter(([role]) => role !== 'marketer').map(([role, label]) => `<option value="${role}" ${stage?.role === role ? 'selected' : ''}>${h(label)}</option>`).join('')}</select></label><label class="field"><span>Order</span><input name="order" type="number" min="1" max="100" required value="${stage?.order || data.stages.length + 1}" ${canConfigure() ? '' : 'disabled'} /></label></div><label class="field"><span>Apply when all tags are present</span><input name="scopeTags" placeholder="Leave empty for all MRs" value="${h(stage?.scopeTags.join(', '))}" ${canConfigure() ? '' : 'disabled'} /><small>Any tags are allowed. Separate them with commas.</small></label><label class="checkbox"><input name="active" type="checkbox" ${stage?.active !== false ? 'checked' : ''} ${canConfigure() ? '' : 'disabled'} /> Active stage</label>${canConfigure() ? `<div class="form-actions"><button class="button primary" type="submit">${stage ? 'Save stage' : 'Create stage'}</button></div>` : '<p class="hint">Switch to a reviewer to change the pipeline.</p>'}</form></section><section class="panel section"><div class="section-heading"><div><h2>Stage checks <span class="count">${rules.length}</span></h2><p>These checks run on a new MR version when this stage matches its tags.</p></div>${stage && canConfigure() ? `<button class="button" data-action="new-rule" data-stage-id="${stage.id}">+ Add check</button>` : ''}</div>${stage ? `<div class="item-list">${rules.map(checkRow).join('') || '<div class="empty compact">No checks yet. This stage can still require human approval.</div>'}</div>` : '<div class="empty compact">Create the stage to add checks.</div>'}</section></div><aside class="panel section guidance"><h2>How this works</h2><p>When someone submits an MR, its tags select the active stages. Checks attached to matching stages run as advisory preflight.</p><p>Reviewers resolve findings and approve in stage order. Each MR version stores the route and check results it saw.</p></aside></div>`;
}

function render() {
  if (!data) return;
  const content = ui.page === 'mr' ? mrPage() : ui.page === 'pipeline' ? pipelinePage() : ui.page === 'stage' ? stagePage() : mrList();
  app.innerHTML = shell(content);
  modalRoot.innerHTML = ui.modal ? modalMarkup() : '';
}
const field = (name, label, value = '', placeholder = '', extra = '') => `<label class="field"><span>${label}</span><input name="${name}" value="${h(value)}" placeholder="${h(placeholder)}" ${extra} /></label>`;
function modal(title, note, fields, submit, wide = false) {
  return `<div class="modal-overlay" data-action="close-modal"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${h(title)}"><div class="modal-heading"><div><h2>${h(title)}</h2><p>${h(note)}</p></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon('close', 18)}</button></div><form data-form="${ui.modal.type}" class="modal-form">${fields}<div class="form-actions"><button class="button" type="button" data-action="close-modal">Cancel</button><button class="button primary" type="submit">${h(submit)}</button></div></form></div></div>`;
}
function modalMarkup() {
  const config = ui.modal;
  const mr = data.submissions.find((item) => item.id === ui.mrId);
  const version = mr && currentVersion(mr);
  if (config.type === 'new-mr' || config.type === 'new-version') {
    const revise = config.type === 'new-version';
    return modal(revise ? 'Submit new version' : 'New MR', revise ? 'Checks and approvals restart for the new version.' : 'Submit any marketing material for review.', `${revise ? '' : field('title', 'Title', '', 'Campaign name or asset title', 'required maxlength="180"')}${field('tags', 'Tags', revise ? version.tags.join(', ') : '', 'e.g. email, state-ny, high-risk')}<p class="field-help">Tags select the matching stages and checks.</p><label class="field"><span>Review copy</span><textarea name="content" rows="8" required placeholder="Paste the copy reviewers should assess…">${revise ? h(version.content) : ''}</textarea></label>${field('referenceUrl', 'Source URL (optional)', revise ? version.referenceUrl : '', 'https://example.com') }<label class="field"><span>Attachment (optional)</span><input name="asset" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" /></label><p class="field-help">PNG, JPEG, WebP or PDF up to 5 MB. Preflight checks inspect pasted copy only.${revise && version.asset ? ` Current: ${h(version.asset.name)}.` : ''}</p>`, revise ? 'Submit version' : 'Create MR', true);
  }
  if (config.type === 'manual-finding') return modal('Add finding', 'Leave actionable feedback on this version.', `${field('title', 'Title', '', 'What needs attention?', 'required')}<label class="field"><span>Severity</span><select name="severity"><option>medium</option><option>low</option><option>high</option></select></label><label class="field"><span>Explanation</span><textarea name="body" rows="4" required></textarea></label>${field('evidence', 'Quoted text (optional)')}`, 'Add finding');
  if (config.type === 'resolve-finding') {
    const finding = mr.findings.find((item) => item.id === config.id);
    return modal('Resolve finding', finding?.title || '', `<label class="field"><span>Resolution</span><select name="status"><option value="resolved">Resolved</option><option value="not_applicable">Not applicable</option></select></label><label class="field"><span>Rationale</span><textarea name="rationale" rows="4" required placeholder="Explain why this is closed…"></textarea></label>`, 'Save resolution');
  }
  if (config.type === 'request-changes') return modal('Request changes', 'Send this version back to Marketing.', '<label class="field"><span>What needs to change?</span><textarea name="note" rows="5" required></textarea></label>', 'Request changes');
  if (config.type === 'rule') {
    const rule = data.rules.find((item) => item.id === config.id);
    const selectedStageId = rule?.stageId ?? config.stageId ?? '';
    return modal(rule ? 'Edit check' : 'Add check', 'Changes apply to future MR versions. Historical results remain unchanged.', `${field('name', 'Name', rule?.name, 'e.g. Required disclosure', 'required')}<div class="field-grid"><label class="field"><span>Type</span><select name="kind"><option value="required" ${rule?.kind === 'required' ? 'selected' : ''}>Required phrase</option><option value="forbidden" ${rule?.kind === 'forbidden' ? 'selected' : ''}>Prohibited phrase</option></select></label><label class="field"><span>Severity</span><select name="severity">${['low','medium','high'].map((value) => `<option ${rule?.severity === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div>${field('term', 'Phrase', rule?.term, 'Exact text, case insensitive', 'required')}<div class="field-grid"><label class="field"><span>Policy category</span><select name="category">${['Internal policy','Federal','State','Industry standard'].map((value) => `<option ${rule?.category === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>${field('source', 'Policy source', rule?.source, 'Document or policy reference', 'required')}</div><label class="field"><span>Runs with</span><select name="stageId"><option value="">Pipeline preflight</option>${[...data.stages].sort((a, b) => a.order - b.order).map((stage) => `<option value="${stage.id}" ${selectedStageId === stage.id ? 'selected' : ''}>${h(stage.name)}</option>`).join('')}</select></label>${field('scopeTags', 'Additional required tags', rule?.scopeTags.join(', '), 'Leave empty for any matching MR')}<label class="checkbox"><input name="active" type="checkbox" ${rule?.active !== false ? 'checked' : ''} /> Active check</label>`, rule ? 'Save check' : 'Add check', true);
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
  const target = event.target.closest('[data-nav], [data-open], [data-stage], [data-version], [data-tab], [data-action]');
  if (!target) return;
  if (target.classList.contains('modal-overlay') && target !== event.target) return;
  if (target.dataset.nav) { ui.modal = null; go(target.dataset.nav); return; }
  if (target.dataset.open) { ui.versionId = null; ui.detailTab = 'review'; go('mr', target.dataset.open); return; }
  if (target.dataset.stage) { go('stage', target.dataset.stage); return; }
  if (target.dataset.version) { ui.versionId = target.dataset.version; ui.detailTab = 'review'; render(); return; }
  if (target.dataset.tab) { ui.detailTab = target.dataset.tab; render(); return; }
  const action = target.dataset.action;
  if (action === 'close-modal') { ui.modal = null; render(); return; }
  if (action === 'new-stage') { go('stage'); return; }
  if (action === 'new-mr' || action === 'new-version' || action === 'manual-finding' || action === 'request-changes') ui.modal = { type: action };
  else if (action === 'resolve-finding') ui.modal = { type: action, id: target.dataset.id };
  else if (action === 'new-rule') ui.modal = { type: 'rule', stageId: target.dataset.stageId || '' };
  else if (action === 'edit-rule') ui.modal = { type: 'rule', id: target.dataset.id };
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
  if (event.target.id === 'tag-filter') { ui.tag = event.target.value; render(); }
  if (event.target.id === 'version-select') { ui.versionId = event.target.value; render(); }
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'mr-search') { const position = event.target.selectionStart; ui.query = event.target.value; render(); const input = document.getElementById('mr-search'); input?.focus(); input?.setSelectionRange(position, position); }
  if (event.target.id === 'preview-tags') { ui.previewTags = event.target.value; document.getElementById('preview-results').innerHTML = previewResults(tagsFrom(ui.previewTags)); }
});
document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form).entries());
  const type = form.dataset.form;
  if (type === 'comment') return mutate('POST', `/api/submissions/${ui.mrId}/comments`, { body: values.body }, 'Comment posted.');
  if (type === 'new-mr' || type === 'new-version') {
    try {
      const prior = type === 'new-version' ? currentVersion(data.submissions.find((mr) => mr.id === ui.mrId)).asset : null;
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
    const result = await mutate(ui.stageId ? 'PATCH' : 'POST', path, { ...values, order: Number(values.order), active: form.elements.active.checked }, 'Stage saved.');
    if (result && !ui.stageId) go('stage', result.id);
    return;
  }
  if (type === 'manual-finding') return mutate('POST', `/api/submissions/${ui.mrId}/findings`, values, 'Finding added.');
  if (type === 'resolve-finding') return mutate('PATCH', `/api/submissions/${ui.mrId}/findings/${ui.modal.id}`, values, 'Resolution recorded.');
  if (type === 'request-changes') return mutate('POST', `/api/submissions/${ui.mrId}/decisions`, { action: 'request_changes', note: values.note }, 'Changes requested.');
  if (type === 'rule') return mutate(ui.modal.id ? 'PATCH' : 'POST', ui.modal.id ? `/api/rules/${ui.modal.id}` : '/api/rules', { ...values, active: form.elements.active.checked }, 'Check saved.');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && ui.modal) { ui.modal = null; render(); }
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-open]')) { event.preventDefault(); event.target.click(); }
});
window.addEventListener('hashchange', () => { readRoute(); render(); });
readRoute();
refresh().catch((error) => { app.innerHTML = `<div class="fatal"><h1>Could not load workspace</h1><p>${h(error.message)}</p><button onclick="location.reload()">Try again</button></div>`; });
