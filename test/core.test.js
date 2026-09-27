import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seedState, saveRule, saveStage, savePipeline, previewRoute, createSubmission, addVersion, decide, publish,
  resolveFinding, addManualFinding, currentVersion, currentFindings, auditPackage,
  hashVersion,
} from '../lib/core.js';

test('arbitrary tags select rules and approval stages, with versioned snapshots', () => {
  const state = seedState();
  const stage = saveStage(state, null, {
    actorId: 'maya', name: 'Experimental review', role: 'legal', scopeTags: 'experimental', order: 4, active: true,
  });
  const rule = saveRule(state, null, {
    actorId: 'maya', name: 'Campaign reference', kind: 'required', term: 'Campaign ID',
    source: 'Sample policy', category: 'Internal policy', severity: 'medium',
    scopeTags: 'experimental', stageId: stage.id, active: true,
  });
  const submission = createSubmission(state, {
    actorId: 'alex', title: 'Any format campaign', tags: 'experimental, print',
    content: 'A new exploratory campaign for existing customers.',
  });
  const first = currentVersion(submission);
  assert.deepEqual(first.tags, ['experimental', 'print']);
  assert.deepEqual(first.stagePlan.map((item) => item.name), ['Compliance review', 'Experimental review']);
  assert.equal(first.checks.find((item) => item.ruleId === rule.id).ruleVersion, 1);
  assert.equal(currentFindings(submission).length, 1);

  saveRule(state, rule.id, { ...rule, actorId: 'maya', term: 'Reference number' });
  saveStage(state, stage.id, { ...stage, actorId: 'maya', name: 'Updated legal review' });
  addVersion(state, submission.id, {
    actorId: 'alex', tags: 'experimental, print',
    content: 'Reference number 23. An updated exploratory campaign for existing customers.',
  });
  assert.equal(first.checks.find((item) => item.ruleId === rule.id).ruleVersion, 1);
  assert.equal(first.stagePlan.at(-1).name, 'Experimental review');
  assert.equal(currentVersion(submission).checks.find((item) => item.ruleId === rule.id).ruleVersion, 2);
  assert.equal(currentVersion(submission).stagePlan.at(-1).name, 'Updated legal review');
});

test('stage checks run only when their stage and extra tag conditions match', () => {
  const state = seedState();
  const stage = saveStage(state, null, {
    actorId: 'maya', name: 'Regional review', role: 'legal', scopeTags: 'region-west', order: 4, active: true,
  });
  const rule = saveRule(state, null, {
    actorId: 'maya', name: 'Regional notice', kind: 'required', term: 'Regional notice',
    source: 'Sample regional policy', category: 'Internal policy', severity: 'medium',
    scopeTags: 'email', stageId: stage.id, active: true,
  });
  const withoutStage = createSubmission(state, {
    actorId: 'alex', title: 'Email outside region', tags: 'email', content: 'A standard email campaign for existing customers.',
  });
  assert.equal(currentVersion(withoutStage).checks.some((check) => check.ruleId === rule.id), false);
  const withoutExtraTag = createSubmission(state, {
    actorId: 'alex', title: 'Regional print campaign', tags: 'region-west, print', content: 'A regional print campaign for existing customers.',
  });
  assert.equal(currentVersion(withoutExtraTag).checks.some((check) => check.ruleId === rule.id), false);
  const matching = createSubmission(state, {
    actorId: 'alex', title: 'Regional email campaign', tags: 'region-west, email', content: 'A regional email campaign for existing customers.',
  });
  const check = currentVersion(matching).checks.find((item) => item.ruleId === rule.id);
  assert.equal(check.stageId, stage.id);
  assert.equal(check.stageName, 'Regional review');
  assert.equal(check.passed, false);
  saveStage(state, stage.id, { ...stage, actorId: 'maya', active: false });
  const paused = createSubmission(state, {
    actorId: 'alex', title: 'Paused regional campaign', tags: 'region-west, email', content: 'Another regional email campaign for existing customers.',
  });
  assert.equal(currentVersion(paused).checks.some((item) => item.ruleId === rule.id), false);
  assert.equal(currentVersion(matching).checks.find((item) => item.ruleId === rule.id).stageName, 'Regional review');
});

test('invalid pipeline edits leave the configuration intact', () => {
  const state = seedState();
  const globalStage = state.stages.find((stage) => stage.scopeTags.length === 0);
  assert.throws(() => saveStage(state, globalStage.id, { ...globalStage, actorId: 'maya', active: false }), /Every active pipeline needs/);
  assert.equal(state.stages.find((stage) => stage.id === globalStage.id).active, true);
  assert.equal(state.stages.find((stage) => stage.id === globalStage.id).version, 1);
  assert.throws(() => saveRule(state, null, {
    actorId: 'maya', name: 'Unattached check', kind: 'required', term: 'Required phrase',
    source: 'Sample policy', category: 'Internal policy', severity: 'low', stageId: 'not-a-stage',
  }), /existing pipeline stage/);
});

test('named pipelines are assigned by tags and preview matches submitted snapshots', () => {
  const state = seedState();
  const draft = savePipeline(state, null, {
    actorId: 'maya', name: 'Affiliate route', scopeTags: 'affiliate', priority: 5, active: false,
  });
  assert.throws(() => savePipeline(state, draft.id, { ...draft, actorId: 'maya', active: true }), /Add an active stage/);
  const stage = saveStage(state, null, {
    actorId: 'maya', pipelineId: draft.id, name: 'Partner compliance', role: 'partner_ops',
    scopeTags: [], order: 1, active: true,
  });
  const rule = saveRule(state, null, {
    actorId: 'maya', pipelineId: draft.id, stageId: stage.id, name: 'Affiliate disclosure',
    kind: 'required', term: 'Advertising disclosure', source: 'Sample partner policy',
    category: 'Internal policy', severity: 'medium', scopeTags: [], active: true,
  });
  savePipeline(state, draft.id, { ...draft, actorId: 'maya', active: true });
  const generalPreview = previewRoute(state, 'email');
  assert.equal(generalPreview.pipeline.id, 'default');
  const preview = previewRoute(state, 'affiliate, email');
  assert.equal(preview.pipeline.id, draft.id);
  assert.deepEqual(preview.stages.map((item) => item.id), [stage.id]);
  assert.ok(preview.rules.some((item) => item.id === rule.id));
  assert.ok(preview.rules.some((item) => item.baseline));
  const mr = createSubmission(state, {
    actorId: 'alex', title: 'Affiliate email', tags: 'affiliate, email',
    content: 'Guaranteed approval when you compare options for existing customers.',
  });
  assert.equal(currentVersion(mr).pipeline.id, preview.pipeline.id);
  assert.deepEqual(currentVersion(mr).stagePlan.map((item) => item.id), preview.stages.map((item) => item.id));
  assert.deepEqual(currentVersion(mr).checks.map((item) => item.ruleId), preview.rules.map((item) => item.id));
  assert.ok(currentVersion(mr).checks.some((check) => check.pipelineId === 'default' && !check.passed));

  const specific = savePipeline(state, null, {
    actorId: 'maya', name: 'Affiliate email route', scopeTags: 'affiliate, email', priority: 0, active: false,
  });
  saveStage(state, null, { actorId: 'maya', pipelineId: specific.id, name: 'Email compliance', role: 'compliance', scopeTags: [], order: 1, active: true });
  savePipeline(state, specific.id, { ...specific, actorId: 'maya', active: true });
  assert.equal(previewRoute(state, 'affiliate, email').pipeline.id, specific.id);
  assert.equal(currentVersion(mr).pipeline.id, draft.id);
});

test('legacy stores still have a default pipeline without rewriting old versions', () => {
  const state = seedState();
  delete state.pipelines;
  state.stages.forEach((stage) => { delete stage.pipelineId; });
  state.rules.forEach((rule) => { delete rule.pipelineId; });
  assert.equal(previewRoute(state, 'affiliate').pipeline.id, 'default');
  const mr = createSubmission(state, { actorId: 'alex', title: 'Legacy routing', tags: 'affiliate', content: 'Advertising disclosure in this affiliate example.' });
  assert.equal(currentVersion(mr).pipeline.id, 'default');
  assert.ok(currentVersion(mr).stagePlan.length >= 2);
});

test('equal-specificity pipelines use priority and incomplete routes stay inactive', () => {
  const state = seedState();
  const first = savePipeline(state, null, { actorId: 'maya', name: 'Affiliate route', scopeTags: 'affiliate', priority: 1, active: false });
  const second = savePipeline(state, null, { actorId: 'maya', name: 'Email route', scopeTags: 'email', priority: 2, active: false });
  saveStage(state, null, { actorId: 'maya', pipelineId: first.id, name: 'Affiliate approval', role: 'compliance', scopeTags: [], order: 1, active: true });
  saveStage(state, null, { actorId: 'maya', pipelineId: second.id, name: 'Email approval', role: 'legal', scopeTags: [], order: 1, active: true });
  savePipeline(state, first.id, { ...first, actorId: 'maya', active: true });
  savePipeline(state, second.id, { ...second, actorId: 'maya', active: true });
  assert.equal(previewRoute(state, 'affiliate, email').pipeline.id, second.id);
  assert.throws(() => savePipeline(state, 'default', {
    actorId: 'maya', name: 'Default review', scopeTags: 'email', priority: 0, active: true,
  }), /default pipeline must stay active/);
  assert.equal(previewRoute(state, 'print').pipeline.id, 'default');
});

test('change requests require a revision; approval belongs to the current version', () => {
  const state = seedState();
  const submission = createSubmission(state, {
    actorId: 'alex', title: 'General audience postcard', tags: 'print, regional',
    content: 'A simple postcard for the regional ClearPath campaign.',
  });
  decide(state, submission.id, { actorId: 'maya', action: 'request_changes', note: 'Clarify the audience.' });
  assert.equal(submission.status, 'changes_requested');
  assert.throws(() => decide(state, submission.id, { actorId: 'maya', action: 'approve' }), /awaiting a marketing revision/);
  const firstId = currentVersion(submission).id;
  addVersion(state, submission.id, { actorId: 'alex', tags: 'print, regional', content: 'A simple postcard for existing customers in the regional ClearPath campaign.' });
  assert.equal(submission.status, 'in_review');
  decide(state, submission.id, { actorId: 'maya', action: 'approve', note: 'Audience clarified.' });
  assert.equal(submission.status, 'approved');
  assert.equal(submission.authorizedVersionId, currentVersion(submission).id);
  assert.notEqual(submission.authorizedVersionId, firstId);
  publish(state, submission.id, { actorId: 'alex' });
  assert.equal(submission.status, 'published');
  addVersion(state, submission.id, { actorId: 'alex', tags: 'print, regional', content: 'A revised postcard for existing regional ClearPath customers.' });
  assert.equal(submission.status, 'in_review');
  assert.equal(submission.authorizedVersionId, null);
  assert.ok(submission.events.some((event) => event.type === 'approval_invalidated'));
  assert.throws(() => publish(state, submission.id, { actorId: 'alex' }), /approved current version/);
});

test('findings block approval until a reviewer records a resolution', () => {
  const state = seedState();
  const submission = createSubmission(state, {
    actorId: 'alex', title: 'New promotional copy', tags: 'social',
    content: 'Guaranteed approval for every ClearPath customer.',
  });
  assert.equal(currentFindings(submission).length, 1);
  assert.throws(() => decide(state, submission.id, { actorId: 'maya', action: 'approve' }), /Resolve or mark all current findings/);
  const finding = currentFindings(submission)[0];
  resolveFinding(state, submission.id, finding.id, { actorId: 'maya', status: 'not_applicable', rationale: 'Reviewed and accepted for this demonstration.' });
  assert.throws(() => resolveFinding(state, submission.id, finding.id, { actorId: 'maya', status: 'resolved', rationale: 'Changed copy.' }), /already closed/);
  decide(state, submission.id, { actorId: 'maya', action: 'approve' });
  assert.equal(submission.status, 'approved');
  assert.throws(() => addManualFinding(state, submission.id, { actorId: 'maya', title: 'Late finding', body: 'Too late.', severity: 'low' }), /locked/);
});

test('audit export retains the reviewed attachment and hashes the reference URL', () => {
  const state = seedState();
  const asset = { name: 'creative.png', mime: 'image/png', data: 'data:image/png;base64,aGVsbG8=' };
  const submission = createSubmission(state, {
    actorId: 'alex', title: 'Image campaign review', tags: 'display',
    content: 'Reviewable copy for this display campaign.', asset,
    referenceUrl: 'https://example.com/campaign',
  });
  const exported = auditPackage(submission);
  assert.equal(exported.versions[0].asset.data, asset.data);
  assert.equal(exported.versions[0].asset.sha256, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  assert.notEqual(
    hashVersion('same copy', ['display'], null, 'https://example.com/one'),
    hashVersion('same copy', ['display'], null, 'https://example.com/two'),
  );
});
