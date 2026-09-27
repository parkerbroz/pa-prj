import { createHash, randomUUID } from 'node:crypto';

export const people = [
  { id: 'alex', name: 'Alex Morgan', role: 'marketer', initials: 'AM', color: 'violet' },
  { id: 'maya', name: 'Maya Chen', role: 'compliance', initials: 'MC', color: 'blue' },
  { id: 'jordan', name: 'Jordan Ellis', role: 'partner_ops', initials: 'JE', color: 'amber' },
  { id: 'sam', name: 'Sam Rivera', role: 'legal', initials: 'SR', color: 'rose' },
];

export const roleLabels = {
  marketer: 'Marketing',
  compliance: 'Compliance',
  partner_ops: 'Partner operations',
  legal: 'Legal',
};

export const categories = ['Internal policy', 'Federal', 'State', 'Industry standard'];
export const severities = ['low', 'medium', 'high'];

export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function cleanTags(input) {
  const values = Array.isArray(input) ? input : String(input || '').split(',');
  return [...new Set(values.map((value) => String(value).trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean))].slice(0, 24);
}

export function hashVersion(content, tags, asset, referenceUrl = '') {
  return createHash('sha256')
    .update(JSON.stringify({ content, tags, asset: asset || null, referenceUrl }))
    .digest('hex');
}

function validateAsset(asset) {
  if (!asset) return null;
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
  if (!allowed.includes(asset.mime) || typeof asset.name !== 'string' || typeof asset.data !== 'string') {
    throw new AppError('Attach a PNG, JPEG, WebP, or PDF file.');
  }
  const prefix = `data:${asset.mime};base64,`;
  if (!asset.data.startsWith(prefix) || asset.data.length > 7_000_000) {
    throw new AppError('The attachment must be under 5 MB.');
  }
  return { name: asset.name.slice(0, 160), mime: asset.mime, data: asset.data };
}

function validateReferenceUrl(raw) {
  if (!raw) return '';
  try {
    const url = new URL(String(raw));
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    throw new AppError('Reference URL must start with http:// or https://.');
  }
}

function requireActor(actorId) {
  const person = people.find((item) => item.id === actorId);
  if (!person) throw new AppError('Choose a valid demo user.');
  return person;
}

function event(submission, type, actor, detail, versionId, at) {
  submission.events.push({ id: randomUUID(), type, actor, detail, versionId, at });
  submission.updatedAt = at;
}

function applicable(item, tags) {
  return item.active && item.scopeTags.every((tag) => tags.includes(tag));
}

export function runChecks(content, tags, rules) {
  return rules.filter((rule) => applicable(rule, tags)).map((rule) => {
    const hasTerm = content.toLocaleLowerCase().includes(rule.term.toLocaleLowerCase());
    const passed = rule.kind === 'required' ? hasTerm : !hasTerm;
    return {
      id: randomUUID(), ruleId: rule.id, ruleVersion: rule.version,
      name: rule.name, category: rule.category, source: rule.source,
      kind: rule.kind, term: rule.term, severity: rule.severity,
      scopeTags: [...rule.scopeTags], passed,
      evidence: passed ? '' : rule.kind === 'required' ? `Missing: “${rule.term}”` : `Found: “${rule.term}”`,
    };
  });
}

function stagePlan(tags, stages) {
  return stages.filter((stage) => applicable(stage, tags))
    .sort((a, b) => a.order - b.order)
    .map((stage) => ({ id: stage.id, version: stage.version, name: stage.name, role: stage.role, scopeTags: [...stage.scopeTags] }));
}

function makeVersion(state, submission, input, actor, at) {
  const content = String(input.content || '').trim();
  if (content.length < 10 || content.length > 30000) throw new AppError('Review copy must be between 10 and 30,000 characters.');
  const tags = cleanTags(input.tags);
  const asset = validateAsset(input.asset);
  const referenceUrl = validateReferenceUrl(input.referenceUrl);
  const stages = stagePlan(tags, state.stages);
  if (!stages.length) throw new AppError('No active review stage applies to these tags. Add a global stage in Pipelines.');
  const checks = runChecks(content, tags, state.rules);
  const version = {
    id: randomUUID(), number: submission.versions.length + 1,
    content, tags, asset, referenceUrl, hash: hashVersion(content, tags, asset, referenceUrl),
    createdAt: at, author: actor.name, checks, stagePlan: stages,
  };
  submission.versions.push(version);
  for (const check of checks.filter((item) => !item.passed)) {
    submission.findings.push({
      id: randomUUID(), versionId: version.id, source: 'preflight', ruleId: check.ruleId,
      title: check.name, body: `Review this copy against ${check.source}.`,
      evidence: check.evidence, severity: check.severity, status: 'open',
      createdAt: at, createdBy: 'Automated preflight', resolution: '', resolvedAt: null, resolvedBy: null,
    });
  }
  return version;
}

export function currentVersion(submission) {
  return submission.versions.at(-1);
}

export function currentFindings(submission) {
  const version = currentVersion(submission);
  return submission.findings.filter((finding) => finding.versionId === version.id);
}

export function nextStage(submission) {
  const version = currentVersion(submission);
  return version.stagePlan.find((stage) => !submission.decisions.some(
    (decision) => decision.versionId === version.id && decision.stageId === stage.id && decision.action === 'approved'
  ));
}

function getSubmission(state, id) {
  const submission = state.submissions.find((item) => item.id === id);
  if (!submission) throw new AppError('Submission not found.', 404);
  return submission;
}

export function createSubmission(state, input, at = new Date().toISOString()) {
  const actor = requireActor(input.actorId);
  const title = String(input.title || '').trim();
  if (title.length < 4 || title.length > 180) throw new AppError('Title must be between 4 and 180 characters.');
  const submission = {
    id: randomUUID(), number: state.nextNumber++, title, owner: actor.name,
    createdAt: at, updatedAt: at, status: 'in_review', authorizedVersionId: null,
    versions: [], findings: [], decisions: [], comments: [], events: [],
  };
  const version = makeVersion(state, submission, input, actor, at);
  event(submission, 'submitted', actor.name, `Submitted version ${version.number} for review`, version.id, at);
  event(submission, 'preflight', 'Automated preflight', `${version.checks.filter((check) => !check.passed).length} finding(s) across ${version.checks.length} applicable checks`, version.id, at);
  state.submissions.unshift(submission);
  return submission;
}

export function addVersion(state, id, input, at = new Date().toISOString()) {
  const submission = getSubmission(state, id);
  const actor = requireActor(input.actorId);
  if (actor.role !== 'marketer') throw new AppError('Select the marketing demo user to submit a revision.', 403);
  const prior = currentVersion(submission);
  const version = makeVersion(state, submission, input, actor, at);
  if (submission.authorizedVersionId) {
    event(submission, 'approval_invalidated', 'System', `Version ${prior.number} approval does not apply to version ${version.number}`, version.id, at);
  }
  submission.authorizedVersionId = null;
  submission.status = 'in_review';
  event(submission, 'revised', actor.name, `Submitted version ${version.number} for review`, version.id, at);
  event(submission, 'preflight', 'Automated preflight', `${version.checks.filter((check) => !check.passed).length} finding(s) across ${version.checks.length} applicable checks`, version.id, at);
  return submission;
}

export function addComment(state, id, input, at = new Date().toISOString()) {
  const submission = getSubmission(state, id);
  const actor = requireActor(input.actorId);
  const body = String(input.body || '').trim();
  if (!body || body.length > 3000) throw new AppError('Comment must be between 1 and 3,000 characters.');
  const comment = { id: randomUUID(), versionId: currentVersion(submission).id, body, author: actor.name, role: actor.role, at };
  submission.comments.push(comment);
  event(submission, 'comment', actor.name, body, comment.versionId, at);
  return submission;
}

export function addManualFinding(state, id, input, at = new Date().toISOString()) {
  const submission = getSubmission(state, id);
  const actor = requireActor(input.actorId);
  if (actor.role === 'marketer') throw new AppError('Select a reviewer to add a finding.', 403);
  if (['approved', 'published'].includes(submission.status)) throw new AppError('Approved content is locked. Submit a revision to reopen review.');
  const title = String(input.title || '').trim();
  const body = String(input.body || '').trim();
  if (title.length < 4 || !body) throw new AppError('Add a title and explanation for the finding.');
  if (!severities.includes(input.severity)) throw new AppError('Choose a valid severity.');
  const version = currentVersion(submission);
  submission.findings.push({
    id: randomUUID(), versionId: version.id, source: 'reviewer', ruleId: null,
    title, body, evidence: String(input.evidence || '').slice(0, 300),
    severity: input.severity, status: 'open', createdAt: at, createdBy: actor.name,
    resolution: '', resolvedAt: null, resolvedBy: null,
  });
  event(submission, 'finding_added', actor.name, title, version.id, at);
  return submission;
}

export function resolveFinding(state, id, findingId, input, at = new Date().toISOString()) {
  const submission = getSubmission(state, id);
  const actor = requireActor(input.actorId);
  if (actor.role === 'marketer') throw new AppError('Select a reviewer to resolve a finding.', 403);
  if (['approved', 'published'].includes(submission.status)) throw new AppError('Approved content is locked. Submit a revision to reopen review.');
  const finding = submission.findings.find((item) => item.id === findingId && item.versionId === currentVersion(submission).id);
  if (!finding) throw new AppError('Current-version finding not found.', 404);
  if (finding.status !== 'open') throw new AppError('This finding is already closed.');
  if (!['resolved', 'not_applicable'].includes(input.status)) throw new AppError('Choose a valid resolution.');
  const rationale = String(input.rationale || '').trim();
  if (rationale.length < 5) throw new AppError('Add a short resolution note for the audit trail.');
  finding.status = input.status;
  finding.resolution = rationale;
  finding.resolvedAt = at;
  finding.resolvedBy = actor.name;
  event(submission, 'finding_resolved', actor.name, `${finding.title}: ${input.status.replace('_', ' ')} — ${rationale}`, finding.versionId, at);
  return submission;
}

export function decide(state, id, input, at = new Date().toISOString()) {
  const submission = getSubmission(state, id);
  const actor = requireActor(input.actorId);
  const version = currentVersion(submission);
  if (!['approve', 'request_changes'].includes(input.action)) throw new AppError('Choose a valid decision.');
  if (['approved', 'published'].includes(submission.status)) throw new AppError('This version is already approved. Submit a revision to reopen review.');
  if (submission.status === 'changes_requested') throw new AppError('This version is awaiting a marketing revision.');
  const stage = nextStage(submission);
  if (!stage) throw new AppError('All stages are already complete.');
  if (actor.role !== stage.role) throw new AppError(`The next stage requires ${roleLabels[stage.role] || stage.role}.`, 403);
  const note = String(input.note || '').trim();
  if (input.action === 'request_changes' && note.length < 5) throw new AppError('Explain what needs to change.');
  if (input.action === 'approve' && currentFindings(submission).some((item) => item.status === 'open')) {
    throw new AppError('Resolve or mark all current findings not applicable before approving.');
  }
  const action = input.action === 'approve' ? 'approved' : 'changes_requested';
  submission.decisions.push({ id: randomUUID(), versionId: version.id, stageId: stage.id, stageName: stage.name, role: stage.role, actor: actor.name, action, note, at });
  event(submission, action, actor.name, `${stage.name}${note ? ` — ${note}` : ''}`, version.id, at);
  if (action === 'changes_requested') {
    submission.status = 'changes_requested';
  } else if (!nextStage(submission)) {
    submission.status = 'approved';
    submission.authorizedVersionId = version.id;
    event(submission, 'authorized', 'System', `Version ${version.number} authorized for publication (${version.hash.slice(0, 12)})`, version.id, at);
  } else {
    submission.status = 'in_review';
  }
  return submission;
}

export function publish(state, id, input, at = new Date().toISOString()) {
  const submission = getSubmission(state, id);
  const actor = requireActor(input.actorId);
  if (actor.role !== 'marketer') throw new AppError('Select the marketing demo user to mark an asset published.', 403);
  const version = currentVersion(submission);
  if (submission.status !== 'approved' || submission.authorizedVersionId !== version.id) {
    throw new AppError('Only the approved current version can be marked published.');
  }
  submission.status = 'published';
  event(submission, 'published', actor.name, `Marked approved version ${version.number} as published`, version.id, at);
  return submission;
}

function cleanRule(input, prior) {
  const name = String(input.name || '').trim();
  const term = String(input.term || '').trim();
  const source = String(input.source || '').trim();
  if (name.length < 4 || term.length < 2 || !source) throw new AppError('Rule needs a name, phrase, and policy source.');
  if (!['required', 'forbidden'].includes(input.kind)) throw new AppError('Choose a rule check type.');
  if (!categories.includes(input.category)) throw new AppError('Choose a rule category.');
  if (!severities.includes(input.severity)) throw new AppError('Choose a severity.');
  return {
    id: prior?.id || randomUUID(), version: prior ? prior.version + 1 : 1,
    name: name.slice(0, 120), term: term.slice(0, 500), source: source.slice(0, 250),
    kind: input.kind, category: input.category, severity: input.severity,
    scopeTags: cleanTags(input.scopeTags), active: input.active !== false,
  };
}

export function saveRule(state, id, input, at = new Date().toISOString()) {
  const actor = requireActor(input.actorId);
  if (actor.role === 'marketer') throw new AppError('Select a reviewer to manage rules.', 403);
  const index = id ? state.rules.findIndex((item) => item.id === id) : -1;
  if (id && index < 0) throw new AppError('Rule not found.', 404);
  const rule = cleanRule(input, index >= 0 ? state.rules[index] : null);
  if (index < 0) state.rules.push(rule); else state.rules[index] = rule;
  state.configEvents.push({ id: randomUUID(), type: index < 0 ? 'rule_created' : 'rule_updated', actor: actor.name, detail: `${rule.name} v${rule.version}`, at });
  return rule;
}

function cleanStage(input, prior, nextOrder) {
  const name = String(input.name || '').trim();
  if (name.length < 4 || name.length > 120) throw new AppError('Stage name must be between 4 and 120 characters.');
  if (!roleLabels[input.role] || input.role === 'marketer') throw new AppError('Choose a reviewer role.');
  const order = Number.isInteger(input.order) ? input.order : prior?.order ?? nextOrder;
  if (order < 1 || order > 100) throw new AppError('Stage order must be between 1 and 100.');
  return {
    id: prior?.id || randomUUID(), version: prior ? prior.version + 1 : 1,
    name, role: input.role, scopeTags: cleanTags(input.scopeTags),
    order,
    active: input.active !== false,
  };
}

export function saveStage(state, id, input, at = new Date().toISOString()) {
  const actor = requireActor(input.actorId);
  if (actor.role === 'marketer') throw new AppError('Select a reviewer to manage stages.', 403);
  const index = id ? state.stages.findIndex((item) => item.id === id) : -1;
  if (id && index < 0) throw new AppError('Stage not found.', 404);
  const stage = cleanStage(input, index >= 0 ? state.stages[index] : null, state.stages.length + 1);
  if (index < 0) state.stages.push(stage); else state.stages[index] = stage;
  if (!state.stages.some((item) => item.active && item.scopeTags.length === 0)) {
    throw new AppError('Keep at least one active stage that applies to every submission.');
  }
  state.configEvents.push({ id: randomUUID(), type: index < 0 ? 'stage_created' : 'stage_updated', actor: actor.name, detail: `${stage.name} v${stage.version}`, at });
  return stage;
}

export function auditPackage(submission) {
  return {
    exportType: 'ClearPath review audit package', exportedAt: new Date().toISOString(),
    submission: {
      id: submission.id, number: submission.number, title: submission.title, owner: submission.owner,
      createdAt: submission.createdAt, updatedAt: submission.updatedAt, status: submission.status,
      authorizedVersionId: submission.authorizedVersionId,
    },
    versions: submission.versions.map(({ asset, ...version }) => ({
      ...version,
      asset: asset ? { ...asset, sha256: createHash('sha256').update(Buffer.from(asset.data.split(',')[1], 'base64')).digest('hex') } : null,
    })),
    findings: submission.findings, decisions: submission.decisions,
    comments: submission.comments, events: submission.events,
  };
}

export function seedState() {
  const now = Date.now();
  const daysAgo = (days) => new Date(now - days * 86400000).toISOString();
  const rules = [
    { name: 'Avoid absolute approval claims', kind: 'forbidden', term: 'guaranteed approval', source: 'ClearPath sample language guide', category: 'Internal policy', severity: 'high', scopeTags: [] },
    { name: 'Identify partner content', kind: 'required', term: 'Advertising disclosure', source: 'ClearPath sample partner policy', category: 'Internal policy', severity: 'medium', scopeTags: ['affiliate'] },
    { name: 'Include card pricing label', kind: 'required', term: 'APR', source: 'ClearPath sample card review guide', category: 'Internal policy', severity: 'medium', scopeTags: ['credit-card'] },
    { name: 'Clarify prequalification', kind: 'required', term: 'not a commitment to lend', source: 'ClearPath sample mortgage copy guide', category: 'Internal policy', severity: 'medium', scopeTags: ['mortgage'] },
  ].map((rule) => ({ ...rule, id: randomUUID(), version: 1, active: true }));
  const stages = [
    { name: 'Compliance review', role: 'compliance', scopeTags: [], order: 1 },
    { name: 'Partner review', role: 'partner_ops', scopeTags: ['affiliate'], order: 2 },
    { name: 'Legal review', role: 'legal', scopeTags: ['high-risk'], order: 3 },
  ].map((stage) => ({ ...stage, id: randomUUID(), version: 1, active: true }));
  const state = { schemaVersion: 1, nextNumber: 1001, rules, stages, submissions: [], configEvents: [] };
  const card = createSubmission(state, { actorId: 'alex', title: 'Next chapter card email', tags: ['credit-card', 'email', 'high-risk'], content: 'Start your next chapter with ClearPath. Guaranteed approval for everyone who applies. Apply in minutes.' }, daysAgo(2.2));
  decide(state, card.id, { actorId: 'maya', action: 'request_changes', note: 'Please revise the approval claim and add the pricing label.' }, daysAgo(2));
  createSubmission(state, { actorId: 'alex', title: 'Flexible borrowing page', tags: ['personal-loan', 'landing-page'], content: 'Explore flexible borrowing with ClearPath. Rates, terms and eligibility vary by applicant. Apply online when you are ready.' }, daysAgo(1.4));
  createSubmission(state, { actorId: 'alex', title: 'Partner comparison article', tags: ['affiliate', 'article'], content: 'Compare ways to borrow and find the option that fits your plans. Explore ClearPath products and apply online.' }, daysAgo(1.1));
  const mortgage = createSubmission(state, { actorId: 'alex', title: 'Homebuyer prequalification FAQ', tags: ['mortgage', 'website'], content: 'Understand your homebuying options. Prequalification is an estimate, not a commitment to lend. Final terms depend on review.' }, daysAgo(3.4));
  decide(state, mortgage.id, { actorId: 'maya', action: 'approve', note: 'Copy reviewed against the current sample policy.' }, daysAgo(3));
  const newsletter = createSubmission(state, { actorId: 'alex', title: 'Monthly money newsletter', tags: ['email', 'existing-customer'], content: 'Make room for your next goal. Here are three ways to plan your monthly budget with more confidence.' }, daysAgo(5));
  decide(state, newsletter.id, { actorId: 'maya', action: 'approve', note: 'Ready to send.' }, daysAgo(4.5));
  publish(state, newsletter.id, { actorId: 'alex' }, daysAgo(4));
  createSubmission(state, { actorId: 'alex', title: 'Everyday confidence social post', tags: ['social', 'brand'], content: 'Small steps can lead to clearer financial choices. Explore educational resources from ClearPath.' }, daysAgo(0.5));
  state.submissions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return state;
}
