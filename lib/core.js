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
export const DEFAULT_PIPELINE_ID = 'default';

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
  return item.active && !item.deletedAt && item.scopeTags.every((tag) => tags.includes(tag));
}

export function listPipelines(state) {
  return state.pipelines || [{
    id: DEFAULT_PIPELINE_ID, version: 1, name: 'Default review',
    scopeTags: [], priority: 0, active: true,
  }];
}

const stagePipelineId = (stage) => stage.pipelineId || DEFAULT_PIPELINE_ID;
const rulePipelineId = (rule, stages) => {
  const stage = rule.stageId ? stages.find((item) => item.id === rule.stageId) : null;
  return stage ? stagePipelineId(stage) : rule.pipelineId || DEFAULT_PIPELINE_ID;
};

// Older demo stores allowed pipeline-level checks. Move them under an
// unconditional stage without changing any already-submitted version snapshot.
export function migrateOrphanChecks(state, at = new Date().toISOString()) {
  let changed = false;
  state.configEvents ||= [];
  for (const rule of state.rules) {
    if (rule.stageId || rule.deletedAt) continue;
    const pipelineId = rule.pipelineId || DEFAULT_PIPELINE_ID;
    let stage = state.stages.filter((item) => stagePipelineId(item) === pipelineId
      && item.active && !item.deletedAt && item.scopeTags.length === 0)
      .sort((a, b) => a.order - b.order)[0];
    if (!stage) {
      stage = { id: randomUUID(), version: 1, name: 'Preflight review', role: 'compliance',
        pipelineId, scopeTags: [], order: 1, active: true };
      state.stages.push(stage);
      state.configEvents.push({ id: randomUUID(), type: 'stage_created', actor: 'System',
        detail: `${stage.name} created to house older checks`, at });
    }
    rule.stageId = stage.id;
    rule.pipelineId = pipelineId;
    rule.version += 1;
    state.configEvents.push({ id: randomUUID(), type: 'rule_migrated', actor: 'System',
      detail: `${rule.name} moved to ${stage.name} v${rule.version}`, at });
    changed = true;
  }
  if (changed) state.schemaVersion = Math.max(state.schemaVersion || 0, 4);
  return changed;
}

export function matchingPipelines(state, tags) {
  return listPipelines(state).map((pipeline, index) => ({ pipeline, index }))
    .filter(({ pipeline }) => applicable(pipeline, tags))
    .sort((a, b) => b.pipeline.scopeTags.length - a.pipeline.scopeTags.length
      || b.pipeline.priority - a.pipeline.priority || a.index - b.index)
    .map(({ pipeline }) => pipeline);
}

function rulesFor(tags, rules, stages, pipelineId) {
  return rules.filter((rule) => {
    if (!applicable(rule, tags)) return false;
    const owner = rulePipelineId(rule, stages);
    if (owner !== pipelineId && owner !== DEFAULT_PIPELINE_ID) return false;
    if (!rule.stageId) return false;
    const stage = stages.find((item) => item.id === rule.stageId);
    return Boolean(stage && applicable(stage, tags));
  });
}

export function runChecks(content, tags, rules, stages = [], pipelineId = DEFAULT_PIPELINE_ID) {
  return rulesFor(tags, rules, stages, pipelineId).map((rule) => {
    const stage = rule.stageId ? stages.find((item) => item.id === rule.stageId) : null;
    const ai = rule.kind === 'ai';
    const hasTerm = content.toLocaleLowerCase().includes(rule.term.toLocaleLowerCase());
    const passed = ai ? null : rule.kind === 'required' ? hasTerm : !hasTerm;
    return {
      id: randomUUID(), ruleId: rule.id, ruleVersion: rule.version,
      name: rule.name, category: rule.category, source: rule.source,
      kind: rule.kind, term: rule.term, instruction: rule.instruction || '', severity: rule.severity,
      pipelineId: rulePipelineId(rule, stages),
      scopeTags: [...rule.scopeTags], stageId: stage.id,
      stageName: stage.name, stageVersion: stage.version, passed,
      status: ai ? 'pending' : passed ? 'passed' : 'flagged', model: null,
      explanation: '', completedAt: ai ? null : new Date().toISOString(),
      evidence: ai || passed ? '' : rule.kind === 'required' ? `Missing: “${rule.term}”` : `Found: “${rule.term}”`,
    };
  });
}

function stagePlan(tags, stages, pipelineId) {
  return stages.filter((stage) => stagePipelineId(stage) === pipelineId && applicable(stage, tags))
    .sort((a, b) => a.order - b.order)
    .map((stage) => ({ id: stage.id, version: stage.version, name: stage.name, role: stage.role, scopeTags: [...stage.scopeTags] }));
}

export function previewRoute(state, inputTags) {
  const tags = cleanTags(inputTags);
  const matches = matchingPipelines(state, tags);
  const pipeline = matches[0] || null;
  if (!pipeline) return { tags, pipeline: null, matches: [], stages: [], rules: [] };
  return {
    tags,
    pipeline: { ...pipeline, scopeTags: [...pipeline.scopeTags] },
    matches: matches.map((item) => ({ id: item.id, name: item.name, scopeTags: [...item.scopeTags], priority: item.priority })),
    stages: stagePlan(tags, state.stages, pipeline.id),
    rules: rulesFor(tags, state.rules, state.stages, pipeline.id).map((rule) => ({
      id: rule.id, name: rule.name, stageId: rule.stageId || null,
      baseline: rulePipelineId(rule, state.stages) === DEFAULT_PIPELINE_ID && pipeline.id !== DEFAULT_PIPELINE_ID,
      stageName: state.stages.find((stage) => stage.id === rule.stageId)?.name || null,
    })),
  };
}

function makeVersion(state, submission, input, actor, at) {
  const content = String(input.content || '').trim();
  if (content.length < 10 || content.length > 30000) throw new AppError('Review copy must be between 10 and 30,000 characters.');
  const tags = cleanTags(input.tags);
  const asset = validateAsset(input.asset);
  const referenceUrl = validateReferenceUrl(input.referenceUrl);
  const route = previewRoute(state, tags);
  if (!route.pipeline || !route.stages.length) throw new AppError('No active pipeline with a review stage applies to these tags.');
  const checks = runChecks(content, tags, state.rules, state.stages, route.pipeline.id);
  checks.forEach((check) => { if (check.status !== 'pending') check.completedAt = at; });
  const version = {
    id: randomUUID(), number: submission.versions.length + 1,
    content, tags, asset, referenceUrl, hash: hashVersion(content, tags, asset, referenceUrl),
    createdAt: at, author: actor.name, checks, stagePlan: route.stages,
    documentReferences: (state.documents || [])
      .filter((document) => document.contentHash && document.scopeTags.every((tag) => tags.includes(tag)))
      .map((document) => ({
        id: document.id, title: document.title, sourceUrl: document.sourceUrl,
        contentHash: document.contentHash, version: document.version,
        lastFetchedAt: document.lastFetchedAt, sourceAsOf: document.sourceAsOf || null,
        status: document.status,
      })),
    pipeline: { id: route.pipeline.id, name: route.pipeline.name, version: route.pipeline.version,
      scopeTags: [...route.pipeline.scopeTags], priority: route.pipeline.priority },
  };
  submission.versions.push(version);
  for (const check of checks.filter((item) => item.passed === false)) {
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

export function completeAiCheck(state, id, versionId, checkId, result, at = new Date().toISOString()) {
  const submission = getSubmission(state, id);
  const version = submission.versions.find((item) => item.id === versionId);
  const check = version?.checks.find((item) => item.id === checkId && item.kind === 'ai');
  if (!check) throw new AppError('AI check not found for this version.', 404);
  if (check.status !== 'pending') throw new AppError('This AI check has already completed.');
  const flagged = result.status === 'flagged';
  const error = result.status === 'error';
  if (!['passed', 'flagged', 'error'].includes(result.status)) throw new AppError('Invalid AI check result.');
  check.status = result.status;
  check.passed = !flagged && !error;
  check.model = result.model || null;
  check.explanation = String(result.explanation || '').slice(0, 1000);
  check.evidence = String(result.evidence || '').slice(0, 500);
  check.completedAt = at;
  if (flagged || error) {
    submission.findings.push({
      id: randomUUID(), versionId, source: 'ai', ruleId: check.ruleId,
      title: error ? `${check.name} could not run` : check.name,
      body: error ? 'AI preflight was unavailable. A reviewer must assess this check manually.'
        : check.explanation || `Review this copy against ${check.source}.`,
      evidence: check.evidence, severity: check.severity, status: 'open',
      createdAt: at, createdBy: 'AI preflight', resolution: '', resolvedAt: null, resolvedBy: null,
    });
  }
  event(submission, 'ai_check', 'AI preflight', `${check.name}: ${error ? 'unavailable' : flagged ? 'flagged for review' : 'no issue found'}`, versionId, at);
  return submission;
}

// A process can stop after a submitted version is saved but before its AI
// request completes. Fail closed on restart so the reviewer can resolve the
// resulting finding instead of waiting on an abandoned pending check.
export function recoverPendingAiChecks(state, at = new Date().toISOString()) {
  let recovered = 0;
  for (const submission of state.submissions) {
    for (const version of submission.versions) {
      for (const check of version.checks || []) {
        if (check.kind !== 'ai' || check.status !== 'pending') continue;
        completeAiCheck(state, submission.id, version.id, check.id, {
          status: 'error', model: null,
          explanation: 'The server stopped before this AI check completed.', evidence: '',
        }, at);
        recovered += 1;
      }
    }
  }
  return recovered;
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
  event(submission, 'preflight', 'Automated preflight', `${version.checks.filter((check) => check.passed === false).length} finding(s), ${version.checks.filter((check) => check.status === 'pending').length} AI check(s) pending across ${version.checks.length} applicable checks`, version.id, at);
  state.submissions.unshift(submission);
  return submission;
}

export function addVersion(state, id, input, at = new Date().toISOString()) {
  const submission = getSubmission(state, id);
  if (submission.status === 'closed') throw new AppError('Closed MRs cannot receive revisions.');
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
  event(submission, 'preflight', 'Automated preflight', `${version.checks.filter((check) => check.passed === false).length} finding(s), ${version.checks.filter((check) => check.status === 'pending').length} AI check(s) pending across ${version.checks.length} applicable checks`, version.id, at);
  return submission;
}

export function addComment(state, id, input, at = new Date().toISOString()) {
  const submission = getSubmission(state, id);
  if (submission.status === 'closed') throw new AppError('Closed MRs are read-only.');
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
  if (submission.status === 'closed') throw new AppError('Closed MRs are read-only.');
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
  if (submission.status === 'closed') throw new AppError('Closed MRs are read-only.');
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
  if (submission.status === 'closed') throw new AppError('Closed MRs cannot be approved.');
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
  if (input.action === 'approve' && version.checks.some((check) => check.status === 'pending')) {
    throw new AppError('Wait for all AI checks to finish before approving.');
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

export function closeSubmission(state, id, input, at = new Date().toISOString()) {
  const submission = getSubmission(state, id);
  const actor = requireActor(input.actorId);
  if (submission.status === 'closed') throw new AppError('This MR is already closed.');
  if (submission.status === 'published') throw new AppError('A published MR cannot be closed.');
  const reason = String(input.reason || '').trim();
  if (reason.length < 5 || reason.length > 1000) throw new AppError('Add a close reason between 5 and 1,000 characters.');
  submission.status = 'closed';
  submission.authorizedVersionId = null;
  submission.closedAt = at;
  submission.closedBy = actor.name;
  submission.closeReason = reason;
  event(submission, 'closed', actor.name, `Closed MR: ${reason}`, currentVersion(submission).id, at);
  return submission;
}

function cleanRule(input, prior, stages, pipelines) {
  const name = String(input.name || '').trim();
  const term = String(input.term || '').trim();
  const instruction = String(input.instruction || '').trim();
  const source = String(input.source || '').trim();
  if (name.length < 4 || !source) throw new AppError('Check needs a name and policy source.');
  if (!['required', 'forbidden', 'ai'].includes(input.kind)) throw new AppError('Choose a check type.');
  if (input.kind === 'ai' && (instruction.length < 10 || instruction.length > 2000)) throw new AppError('AI instruction must be between 10 and 2,000 characters.');
  if (input.kind !== 'ai' && term.length < 2) throw new AppError('Add a phrase of at least 2 characters.');
  if (!categories.includes(input.category)) throw new AppError('Choose a rule category.');
  if (!severities.includes(input.severity)) throw new AppError('Choose a severity.');
  const stageId = input.stageId || null;
  if (!stageId) throw new AppError('Every check must belong to a stage.');
  const stage = stageId ? stages.find((item) => item.id === stageId) : null;
  if (!stage || stage.deletedAt) throw new AppError('Choose an existing pipeline stage.');
  const pipelineId = input.pipelineId || prior?.pipelineId || (stage ? stagePipelineId(stage) : DEFAULT_PIPELINE_ID);
  if (!pipelines.some((item) => item.id === pipelineId)) throw new AppError('Choose an existing pipeline.');
  if (stage && stagePipelineId(stage) !== pipelineId) throw new AppError('The check and stage must belong to the same pipeline.');
  return {
    id: prior?.id || randomUUID(), version: prior ? prior.version + 1 : 1,
    name: name.slice(0, 120), term: input.kind === 'ai' ? '' : term.slice(0, 500),
    instruction: input.kind === 'ai' ? instruction : '', source: source.slice(0, 250),
    kind: input.kind, category: input.category, severity: input.severity,
    scopeTags: cleanTags(input.scopeTags), pipelineId, stageId, active: input.active !== false,
  };
}

export function saveRule(state, id, input, at = new Date().toISOString()) {
  const actor = requireActor(input.actorId);
  if (actor.role === 'marketer') throw new AppError('Select a reviewer to manage rules.', 403);
  const index = id ? state.rules.findIndex((item) => item.id === id) : -1;
  if (id && index < 0) throw new AppError('Rule not found.', 404);
  if (index >= 0 && state.rules[index].deletedAt) throw new AppError('Deleted checks cannot be edited.');
  const rule = cleanRule(input, index >= 0 ? state.rules[index] : null, state.stages, listPipelines(state));
  if (index < 0) state.rules.push(rule); else state.rules[index] = rule;
  state.configEvents.push({ id: randomUUID(), type: index < 0 ? 'rule_created' : 'rule_updated', actor: actor.name, detail: `${rule.name} v${rule.version}`, at });
  return rule;
}

export function deleteRule(state, id, input, at = new Date().toISOString()) {
  const actor = requireActor(input.actorId);
  if (actor.role === 'marketer') throw new AppError('Select a reviewer to delete checks.', 403);
  const rule = state.rules.find((item) => item.id === id && !item.deletedAt);
  if (!rule) throw new AppError('Check not found.', 404);
  rule.active = false;
  rule.deletedAt = at;
  rule.deletedBy = actor.name;
  state.configEvents.push({ id: randomUUID(), type: 'rule_deleted', actor: actor.name,
    detail: `${rule.name} deleted from ${state.stages.find((stage) => stage.id === rule.stageId)?.name || 'stage'}`, at });
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
    order, pipelineId: input.pipelineId || prior?.pipelineId || DEFAULT_PIPELINE_ID,
    active: input.active !== false,
  };
}

export function saveStage(state, id, input, at = new Date().toISOString()) {
  const actor = requireActor(input.actorId);
  if (actor.role === 'marketer') throw new AppError('Select a reviewer to manage stages.', 403);
  const index = id ? state.stages.findIndex((item) => item.id === id) : -1;
  if (id && index < 0) throw new AppError('Stage not found.', 404);
  if (index >= 0 && state.stages[index].deletedAt) throw new AppError('Deleted stages cannot be edited.');
  const stage = cleanStage(input, index >= 0 ? state.stages[index] : null, state.stages.length + 1);
  if (!listPipelines(state).some((item) => item.id === stage.pipelineId)) throw new AppError('Choose an existing pipeline.');
  if (index >= 0 && stagePipelineId(state.stages[index]) !== stage.pipelineId) throw new AppError('Move stages by creating them in the target pipeline.');
  const nextStages = [...state.stages];
  if (index < 0) nextStages.push(stage); else nextStages[index] = stage;
  if (listPipelines(state).some((pipeline) => pipeline.active && !nextStages.some((item) =>
    stagePipelineId(item) === pipeline.id && item.active && item.scopeTags.length === 0))) {
    throw new AppError('Every active pipeline needs an active stage that applies to all its MRs.');
  }
  state.stages = nextStages;
  state.configEvents.push({ id: randomUUID(), type: index < 0 ? 'stage_created' : 'stage_updated', actor: actor.name, detail: `${stage.name} v${stage.version}`, at });
  return stage;
}

export function deleteStage(state, id, input, at = new Date().toISOString()) {
  const actor = requireActor(input.actorId);
  if (actor.role === 'marketer') throw new AppError('Select a reviewer to delete stages.', 403);
  const stage = state.stages.find((item) => item.id === id && !item.deletedAt);
  if (!stage) throw new AppError('Stage not found.', 404);
  const pipeline = listPipelines(state).find((item) => item.id === stagePipelineId(stage));
  if (pipeline?.active && !state.stages.some((item) => item.id !== id
    && stagePipelineId(item) === pipeline.id && item.active && !item.deletedAt && item.scopeTags.length === 0)) {
    throw new AppError('Keep one active stage that applies to every MR in this pipeline.');
  }
  stage.active = false;
  stage.deletedAt = at;
  stage.deletedBy = actor.name;
  const attached = state.rules.filter((rule) => rule.stageId === id && !rule.deletedAt);
  for (const rule of attached) {
    rule.active = false;
    rule.deletedAt = at;
    rule.deletedBy = actor.name;
  }
  state.configEvents.push({ id: randomUUID(), type: 'stage_deleted', actor: actor.name,
    detail: `${stage.name} deleted with ${attached.length} check(s)`, at });
  return stage;
}

export function savePipeline(state, id, input, at = new Date().toISOString()) {
  const actor = requireActor(input.actorId);
  if (actor.role === 'marketer') throw new AppError('Select a reviewer to manage pipelines.', 403);
  const existing = listPipelines(state);
  const index = id ? existing.findIndex((item) => item.id === id) : -1;
  if (id && index < 0) throw new AppError('Pipeline not found.', 404);
  const prior = index >= 0 ? existing[index] : null;
  const name = String(input.name || '').trim();
  if (name.length < 4 || name.length > 120) throw new AppError('Pipeline name must be between 4 and 120 characters.');
  const scopeTags = cleanTags(input.scopeTags);
  const active = input.active === true;
  const priority = Number(input.priority ?? prior?.priority ?? 0);
  if (!Number.isInteger(priority) || priority < -100 || priority > 100) throw new AppError('Priority must be a whole number from -100 to 100.');
  if (id === DEFAULT_PIPELINE_ID && (!active || scopeTags.length)) throw new AppError('The default pipeline must stay active and match all MRs.');
  if (id !== DEFAULT_PIPELINE_ID && active && !scopeTags.length) throw new AppError('Assign at least one tag before activating this pipeline.');
  const pipeline = {
    id: prior?.id || randomUUID(), version: prior ? prior.version + 1 : 1,
    name, scopeTags, priority, active,
  };
  if (pipeline.active && !state.stages.some((stage) => stagePipelineId(stage) === pipeline.id && stage.active && !stage.deletedAt && stage.scopeTags.length === 0)) {
    throw new AppError('Add an active stage that applies to all MRs in this pipeline before activating it.');
  }
  const nextPipelines = [...existing];
  if (index < 0) nextPipelines.push(pipeline); else nextPipelines[index] = pipeline;
  state.pipelines = nextPipelines;
  state.schemaVersion = Math.max(state.schemaVersion || 0, 3);
  state.configEvents.push({ id: randomUUID(), type: index < 0 ? 'pipeline_created' : 'pipeline_updated', actor: actor.name, detail: `${pipeline.name} v${pipeline.version}`, at });
  return pipeline;
}

export function auditPackage(submission, state) {
  const references = submission.versions.flatMap((version) => version.documentReferences || []);
  const sourceDocuments = [...new Map(references.map((reference) => {
    const document = state?.documents?.find((item) => item.id === reference.id);
    const snapshot = document?.version === reference.version ? document
      : document?.history?.find((item) => item.version === reference.version);
    return [`${reference.id}:${reference.version}`, { ...reference, text: snapshot?.text || null }];
  })).values()];
  return {
    exportType: 'ClearPath review audit package', exportedAt: new Date().toISOString(),
    submission: {
      id: submission.id, number: submission.number, title: submission.title, owner: submission.owner,
      createdAt: submission.createdAt, updatedAt: submission.updatedAt, status: submission.status,
      authorizedVersionId: submission.authorizedVersionId,
      closedAt: submission.closedAt || null, closedBy: submission.closedBy || null,
      closeReason: submission.closeReason || null,
    },
    versions: submission.versions.map(({ asset, ...version }) => ({
      ...version,
      asset: asset ? { ...asset, sha256: createHash('sha256').update(Buffer.from(asset.data.split(',')[1], 'base64')).digest('hex') } : null,
    })),
    findings: submission.findings, decisions: submission.decisions,
    comments: submission.comments, events: submission.events, sourceDocuments,
  };
}

export function seedState() {
  const now = Date.now();
  const daysAgo = (days) => new Date(now - days * 86400000).toISOString();
  const pipelines = [{
    id: DEFAULT_PIPELINE_ID, version: 1, name: 'Default review',
    scopeTags: [], priority: 0, active: true,
  }];
  const stages = [
    { name: 'Compliance review', role: 'compliance', scopeTags: [], order: 1 },
    { name: 'Partner review', role: 'partner_ops', scopeTags: ['affiliate'], order: 2 },
    { name: 'Legal review', role: 'legal', scopeTags: ['high-risk'], order: 3 },
  ].map((stage) => ({ ...stage, id: randomUUID(), pipelineId: DEFAULT_PIPELINE_ID, version: 1, active: true }));
  const rules = [
    { name: 'Avoid absolute approval claims', kind: 'forbidden', term: 'guaranteed approval', source: 'ClearPath sample language guide', category: 'Internal policy', severity: 'high', scopeTags: [], stageId: stages[0].id },
    { name: 'Identify partner content', kind: 'required', term: 'Advertising disclosure', source: 'ClearPath sample partner policy', category: 'Internal policy', severity: 'medium', scopeTags: [], stageId: stages[1].id },
    { name: 'Include card pricing label', kind: 'required', term: 'APR', source: 'ClearPath sample card review guide', category: 'Internal policy', severity: 'medium', scopeTags: ['credit-card'], stageId: stages[0].id },
    { name: 'Clarify prequalification', kind: 'required', term: 'not a commitment to lend', source: 'ClearPath sample mortgage copy guide', category: 'Internal policy', severity: 'medium', scopeTags: ['mortgage'], stageId: stages[0].id },
  ].map((rule) => ({ ...rule, id: randomUUID(), pipelineId: DEFAULT_PIPELINE_ID, version: 1, active: true }));
  const state = { schemaVersion: 3, nextNumber: 1001, pipelines, rules, stages, submissions: [], configEvents: [] };
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
