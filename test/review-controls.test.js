import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seedState, saveRule, saveStage, deleteRule, deleteStage, migrateOrphanChecks,
  createSubmission, addVersion, closeSubmission, currentVersion, previewRoute,
  completeAiCheck, recoverPendingAiChecks, decide, resolveFinding, auditPackage,
} from '../lib/core.js';
import { evaluateAiCheck } from '../lib/ai.js';

test('checks must belong to a stage and older orphan checks migrate once', () => {
  const state = seedState();
  const historical = JSON.stringify(state.submissions[0].versions[0]);
  assert.throws(() => saveRule(state, null, {
    actorId: 'maya', name: 'Unattached check', kind: 'required', term: 'disclosure',
    source: 'Policy', category: 'Internal policy', severity: 'medium',
  }), /Every check must belong to a stage/);
  const old = state.rules[0];
  delete old.stageId;
  const oldVersion = old.version;
  assert.equal(migrateOrphanChecks(state), true);
  assert.ok(state.stages.some((stage) => stage.id === old.stageId && stage.scopeTags.length === 0));
  assert.equal(old.version, oldVersion + 1);
  assert.equal(migrateOrphanChecks(state), false);
  assert.equal(JSON.stringify(state.submissions[0].versions[0]), historical);
  assert.ok(previewRoute(state, 'social').rules.every((rule) => rule.stageId));
});

test('deleting checks and stages removes future routing but preserves old MR evidence', () => {
  const state = seedState();
  const stage = saveStage(state, null, {
    actorId: 'maya', name: 'Regional review', role: 'legal', scopeTags: 'regional', order: 4, active: true,
  });
  const rule = saveRule(state, null, {
    actorId: 'maya', stageId: stage.id, name: 'Regional statement', kind: 'required', term: 'local terms',
    source: 'Regional policy', category: 'Internal policy', severity: 'medium', active: true,
  });
  const mr = createSubmission(state, {
    actorId: 'alex', title: 'Regional material', tags: 'regional',
    content: 'A regional campaign with no particular offer terms.',
  });
  const original = JSON.stringify(currentVersion(mr));
  deleteRule(state, rule.id, { actorId: 'maya' });
  assert.equal(previewRoute(state, 'regional').rules.some((item) => item.id === rule.id), false);
  assert.throws(() => saveRule(state, rule.id, { ...rule, actorId: 'maya' }), /Deleted checks/);
  deleteStage(state, stage.id, { actorId: 'maya' });
  assert.equal(previewRoute(state, 'regional').stages.some((item) => item.id === stage.id), false);
  assert.equal(JSON.stringify(currentVersion(mr)), original);
  assert.throws(() => deleteStage(state, state.stages.find((item) => item.name === 'Compliance review').id, { actorId: 'maya' }), /Keep one active stage/);
});

test('closing an MR is audited and stops review without deleting versions', () => {
  const state = seedState();
  const mr = createSubmission(state, {
    actorId: 'alex', title: 'Stopped campaign', tags: 'social',
    content: 'A campaign that will not move forward.',
  });
  decide(state, mr.id, { actorId: 'maya', action: 'approve' });
  const versionId = currentVersion(mr).id;
  closeSubmission(state, mr.id, { actorId: 'alex', reason: 'Campaign was cancelled before publication.' });
  assert.equal(mr.status, 'closed');
  assert.equal(mr.authorizedVersionId, null);
  assert.equal(auditPackage(mr).versions[0].id, versionId);
  assert.equal(auditPackage(mr).submission.closeReason, 'Campaign was cancelled before publication.');
  assert.ok(mr.events.some((item) => item.type === 'closed'));
  assert.throws(() => addVersion(state, mr.id, { actorId: 'alex', tags: 'social', content: 'New content for a closed campaign.' }), /Closed MRs/);
  assert.throws(() => decide(state, mr.id, { actorId: 'maya', action: 'approve' }), /Closed MRs/);
});

test('interrupted AI checks become manual-review findings on restart', () => {
  const state = seedState();
  const stage = state.stages.find((item) => item.name === 'Compliance review');
  saveRule(state, null, {
    actorId: 'maya', stageId: stage.id, name: 'Review contextual claim', kind: 'ai',
    instruction: 'Flag any claim that requires substantiation.', source: 'Claims policy',
    category: 'Internal policy', severity: 'medium', active: true,
  });
  const mr = createSubmission(state, {
    actorId: 'alex', title: 'Interrupted AI example', tags: 'social',
    content: 'Customers can compare options on our site.',
  });
  assert.equal(recoverPendingAiChecks(state), 1);
  assert.equal(recoverPendingAiChecks(state), 0);
  assert.equal(currentVersion(mr).checks.find((item) => item.kind === 'ai').status, 'error');
  assert.equal(mr.findings.filter((item) => item.source === 'ai').length, 1);
  assert.throws(() => decide(state, mr.id, { actorId: 'maya', action: 'approve' }), /Resolve or mark/);
});

test('AI stage checks block approval until they finish and flagged results need human resolution', () => {
  const state = seedState();
  const stage = state.stages.find((item) => item.name === 'Compliance review');
  saveRule(state, null, {
    actorId: 'maya', stageId: stage.id, name: 'Assess claim substantiation', kind: 'ai',
    instruction: 'Flag claims that lack an identifiable supporting source.',
    source: 'Claim substantiation policy', category: 'Internal policy', severity: 'high', active: true,
  });
  const mr = createSubmission(state, {
    actorId: 'alex', title: 'AI review example', tags: 'social',
    content: 'Our service can help customers compare options.',
  });
  const version = currentVersion(mr);
  const check = version.checks.find((item) => item.kind === 'ai');
  assert.equal(check.status, 'pending');
  assert.throws(() => decide(state, mr.id, { actorId: 'maya', action: 'approve' }), /AI checks to finish/);
  completeAiCheck(state, mr.id, version.id, check.id, {
    status: 'flagged', explanation: 'This claim needs a source.', evidence: 'compare options', model: 'test-model',
  });
  assert.equal(check.status, 'flagged');
  assert.equal(check.model, 'test-model');
  const finding = mr.findings.find((item) => item.ruleId === check.ruleId && item.versionId === version.id);
  assert.equal(finding.status, 'open');
  assert.throws(() => decide(state, mr.id, { actorId: 'maya', action: 'approve' }), /Resolve or mark/);
  resolveFinding(state, mr.id, finding.id, { actorId: 'maya', status: 'not_applicable', rationale: 'Source reviewed manually.' });
  decide(state, mr.id, { actorId: 'maya', action: 'approve' });
  assert.equal(mr.status, 'approved');
});

test('AI integration sends structured, non-stored copy-only requests', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ status: 'completed', output: [{
      type: 'message', content: [{ type: 'output_text', text: JSON.stringify({
        flagged: true, explanation: 'Needs substantiation.', evidence: 'Compare options',
      }) }],
    }] }) };
  };
  const result = await evaluateAiCheck(
    { name: 'Claims', instruction: 'Flag unsubstantiated claims.', source: 'Internal guide' },
    { tags: ['email'], content: 'Compare options with our new tool.', asset: { data: 'private attachment' } },
    { apiKey: 'test-key', model: 'gpt-4o-mini', fetchImpl },
  );
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(body.store, false);
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.equal(body.input.includes('private attachment'), false);
  assert.equal(result.status, 'flagged');
  assert.equal(result.evidence, 'Compare options');
});
