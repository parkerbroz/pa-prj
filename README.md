# Marketing review workspace

A take-home prototype for reviewing marketing materials with a pull-request-style workflow. The UI has MRs, Pipelines, and Documents tabs. MR and pipeline detail views support review and configuration. Tags determine which stages, checks, and reference documents apply.

## Run

Requires Node.js 20+. No package installation is needed. Law updates require outbound HTTPS access to official government sites.

```sh
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The first launch seeds fictional data in `data/store.json` (ignored by Git). Set `PORT`, `HOST`, and `DATA_FILE` to change the listener and storage path. For a container, use `HOST=0.0.0.0`.

Keep the prototype on localhost for now. When you decide to share it, `ngrok http 3000` can expose the local server temporarily. Use only fictional content: demo role switching is not authentication.

## Demo flow

1. Open **Pipelines** and click **New pipeline**. Give it required MR tags; it starts as a draft.
2. Click **Add stage**, configure its reviewer and optional additional tags, then return to the pipeline and activate it. Every active pipeline needs one active stage without additional tags.
3. In **Test MR tags**, enter tags such as `affiliate, high-risk`. The preview uses the same routing function as submission and shows the selected pipeline, stages, and checks.
4. Open **MRs**. Add multiple tag filters; an MR must contain all selected tags. Create a material with any tags and paste reviewable copy.
5. Switch demo users to add findings, request changes, submit a revision, resolve findings, approve each stage, and mark the approved version published.
6. Open **Documents** to inspect captured federal and state law text, add a reference, check source coverage, or fetch configured sources now. State references match MRs tagged `state-xx` (for example, `state-ca`).
7. On the MR, inspect the source versions captured at submission, open **Files & history** to inspect copy and attachments, or export its JSON audit package.

Existing demo stores still work. They appear as the active default pipeline without rewriting prior MR versions. On startup, previously unassigned checks are moved under an active unconditional stage (or a new **Preflight review** stage) for future submissions. Historical MR versions are unchanged.

## AI checks

Add an **AI review** check inside a stage, with a specific instruction and policy source. Matching checks run automatically when each MR version is submitted, alongside phrase checks. AI results are advisory: a flagged result opens a finding; a service error or missing configuration opens a manual-review finding. A pending result blocks approval, and no check can approve or publish an MR. A restart turns interrupted pending checks into manual-review findings.

AI calls are off by default. To enable them, set `AI_CHECKS_ENABLED=1` and `OPENAI_API_KEY` in the server environment or in the gitignored `.env` at the repository root, then restart the server. Explicit environment variables take precedence over `.env`. `OPENAI_MODEL` optionally overrides the default `gpt-4o-mini`. Do not put the key in browser code or a committed file. The request sends pasted review copy, tags, the check instruction, and its policy source to OpenAI; it does not send attachments. The API request uses Structured Outputs and `store: false`. This is not a substitute for legal review or a complete data-governance assessment. For a no-network demo, leave AI off; configured AI checks will visibly require manual review instead of passing silently.

## Model and safeguards

### Documents and updates

- The library starts with the federal FTC Act section, two Regulation Z advertising sections, and verified, directly fetchable consumer protection or advertising sections for 16 states. The coverage panel tracks all 50 states and identifies states without a configured section. This is a starter set of source documents, not a complete corpus of federal or state law.
- The U.S. Code section comes from the House Office of the Law Revision Counsel, and the federal regulations use the official eCFR versioned XML API. State sections are fetched from official HTTPS `.gov` pages. The app checks configured sources nightly at 2:00 a.m. in the server's local time zone, and catches up after a restart if a full run was missed. The server must be running for a scheduled check to execute.
- Reviewers can fetch all, federal, or state sources on demand and add specific official law URLs. The import keeps source URLs, fetch and source dates where available, SHA-256 text hashes, prior text versions, and per-source errors. A failed refresh retains the last captured text with an error status.
- MR versions capture the matching document ID, version, and hash at submission. Reviewers can reopen the saved text later. The full audit package includes these references. Documents provide cited material for human review; their presence does not turn a law into an automatic check or establish that it applies to an MR.
- URLs pinned to an annual edition, such as Florida's 2026 statutes and Montana's 2025 code, need source review when a new edition is published. The coverage panel counts fetched sections, not completeness of a state's laws.

Set `DOCUMENT_SYNC_DISABLED=1` only when you need to run the app without scheduled or startup fetching, such as an isolated test. The **Fetch now** control remains available.

## Model and safeguards

- One shared MR queue, filterable by status, multiple tags (AND), and text.
- Active pipelines have arbitrary required tags. The matching pipeline with the most required tags wins; a higher numeric priority breaks equal-specificity ties, then the earlier-created pipeline wins. The active default supplies baseline checks to every MR and its approval route when no specialized pipeline matches.
- Ordered approval stages belong to one pipeline and can have additional tag conditions. Each active pipeline needs an active stage that applies to every MR routed to it.
- Checks belong to stages and run only if their stage and any extra check tags match the MR. Checks run when a version is submitted, before human review.
- Reviewers can delete checks or stages without erasing historical results. Deleting a stage also retires its checks; an active pipeline must retain an unconditional review stage.
- Each version snapshots its content hash, selected pipeline, applicable stages, checks, check results, and configuration versions. Later changes affect new versions only.
- Automated failures create findings, but never auto-reject or auto-approve. Reviewers must resolve open findings before approval.
- Approvals bind to a version; revisions invalidate prior publication authorization.
- An MR can be manually closed with a reason unless it has been marked published. Closing makes it read-only, but keeps its versions and audit trail.
- JSON audit export contains the original content/attachment, SHA-256 hashes, findings, comments, decisions, closure details, and events.

Run `npm test` for workflow and tag-routing tests.

This is a workflow demonstration, not a legal determination engine. Sample policies are fictional. Phrase checks inspect pasted text; AI checks are optional and advisory. Attachments are not OCR'd. Law pages and extracted text require human verification for currency and applicability. The local JSON store is not tamper-evident regulated storage. Production use would require authentication, permissions, durable storage, retention rules, rule governance, and expert-maintained policy content.
