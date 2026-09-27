# Marketing review workspace

A take-home prototype for reviewing marketing materials with a pull-request-style workflow. The UI has four views: an MR list, an MR detail view, a pipeline builder, and a stage builder. It has no product-specific taxonomy: any tags can be used, and tag conditions determine which stages and checks apply.

## Run

Requires Node.js 20+. No package installation or external service is needed.

```sh
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The first launch seeds fictional data in `data/store.json` (ignored by Git). Set `PORT`, `HOST`, and `DATA_FILE` to change the listener and storage path. For a container, use `HOST=0.0.0.0`.

To share a temporary demo, run `cloudflared tunnel --url http://127.0.0.1:3000` while the server stays running. Its public URL is temporary. Use only fictional content: demo role switching is not authentication.

## Demo flow

1. Open **Pipeline** and preview a route with tags such as `affiliate, high-risk`.
2. Open a stage, edit its reviewer/team and tag conditions, and add a required or prohibited phrase check. Checks can have additional tag conditions or be moved to pipeline-level preflight.
3. Open **MRs**, create a material with any tags, and paste reviewable copy. Optional images/PDFs and source URLs are stored with the version.
4. Switch demo users to add findings, request changes, submit a revision, resolve findings, approve each stage, and mark the approved version published.
5. On the MR, open **History & evidence** or export its JSON audit package.

Existing demo stores created before the stage-check update still work. Their previously unassigned checks appear under **Pipeline-level checks**, where they can be moved into a stage. A fresh seeded store starts with checks attached to stages.

## Model and safeguards

- One shared MR queue, filterable by status, tag, and text.
- Ordered approval stages with arbitrary tag conditions. At least one active global stage is required.
- Checks are either pipeline-level or attached to a stage. An attached check runs only if that stage and any extra check tags match the MR. Checks run when a version is submitted, before human review.
- Each version snapshots its content hash, applicable stages, checks, check results, and rule/stage versions. Later configuration changes affect new versions only.
- Automated failures create findings, but never auto-reject or auto-approve. Reviewers must resolve open findings before approval.
- Approvals bind to a version; revisions invalidate prior publication authorization.
- JSON audit export contains the original content/attachment, SHA-256 hashes, findings, comments, decisions, and events.

Run `npm test` for workflow and tag-routing tests.

This is a workflow demonstration, not a legal determination engine. Sample policies are fictional. Checks are exact, case-insensitive phrase checks on pasted text; attachments are not OCR'd. The local JSON store is not tamper-evident regulated storage. Production use would require authentication, permissions, durable storage, retention rules, rule governance, and expert-maintained policy content.
