# ClearPath Marketing Compliance Review

## Product concept

ClearPath Financial needs to approve a growing volume of marketing materials across products and channels. Today, reviews are managed through email and spreadsheets, which makes it difficult to see what is waiting, understand why an asset was rejected, or prove who approved a specific version.

ClearPath Marketing Compliance Review is a shared workspace for submitting, checking, revising, approving, and auditing marketing materials.

The product borrows useful ideas from pull requests and CI/CD: every material is versioned, automated checks run before human review, reviewers leave findings in context, and approval gates control release. This prototype calls each material an MR, while keeping the rest of the interface in plain marketing and compliance language.

## Users and their goals

### Marketers

Marketers need to submit an asset once, understand what is blocking it, respond to feedback without losing context, and know when it is ready to publish.

### Compliance reviewers

Compliance workers need a prioritized queue, enough context to make a decision, structured findings, and confidence that the final approval is tied to the exact content reviewed.

### Compliance administrators

Administrators need to define review workflows, maintain internal rules and approved disclosures, manage permissions, and produce an audit package when requested.

## Core model

There is one shared ClearPath workspace rather than a separate repository for every channel. All marketing materials live in the same searchable queue and are filtered using metadata.

Each submission has:

- Tags: any combination of product, channel, jurisdiction, audience, partner, campaign, or other labels the team creates
- Owner: the marketer or team responsible for the submission
- Status: in review, changes requested, approved, published, or closed
- Version history: every submitted revision, with its own findings and approvals

The internal Git analogy is:

| Development concept | ClearPath concept |
|---|---|
| Repository | Shared marketing compliance workspace |
| Pull request | Marketing submission |
| Commit | New submitted version |
| Issue | Compliance finding |
| CI check | Automated policy check |
| Reviewer | Compliance, legal, product, or marketing approver |
| Merge gate | Required approval |
| Release | Authorization to publish |

The analogy is useful for designing the system, but it should remain optional in the interface.

## Review workflow

The default workflow is:

`Draft → Automated preflight → Compliance review → Changes requested or approved → Publish`

The workflow branches based on tags. An administrator can create named pipelines with required tags. The most-specific active match wins, with priority breaking ties. The default pipeline supplies baseline checks to every MR and its approval route when no specialized pipeline matches. Within the selected pipeline, stages and checks can have additional tag conditions. Tags are open ended; products, channels, and jurisdictions are examples, not fixed choices in the data model.

Checks belong to stages, never directly to a pipeline. Matching deterministic and optional AI checks run when each version is submitted, before human approval. If an AI check cannot run, it opens a manual-review finding rather than passing silently. Example checks include:

- Required disclosure is missing
- A claim does not match an approved source or product term
- A phrase is prohibited by internal policy
- The selected state is missing from the submission metadata
- An affiliate disclosure is missing
- A rate, fee, or offer date may be stale
- The asset uses a disclosure that is not approved for the selected product or channel

Checks should return an explanation, severity, rule reference, and suggested next action. Automated results are decision support, not final legal determinations. A human reviewer remains responsible for approval.

## Main product surfaces

### 1. MR list

The home screen is a work queue for marketers and compliance workers. Users can filter by status, multiple tags that must all match, and search material titles and owners. Review time and first-pass approval metrics are natural next steps.

The queue should make the next action obvious. A compliance reviewer should be able to open “high-risk affiliate submissions awaiting review” without navigating through projects or folders.

### 2. MR detail

The detail view contains:

- A preview of the asset
- Submission metadata and applicable rule sets
- File/version history with copy and attachment changes, a version selector, and side-by-side comparison
- Automated preflight results
- Findings with quoted evidence and policy sources
- Reviewer comments and replies
- Visual pipeline progress, current approval status, and required approvers
- Full audit history

Marketers can respond in the discussion and submit a new version. Reviewers can add or resolve findings, request changes, or approve. An MR can also be closed with a reason; the record remains available but read-only. Explicit escalation and rejection states are future extensions.

### 3. Pipeline builder

Administrators can create multiple named pipelines, assign each required MR tags, and build its ordered route from conditional human approval stages. New pipelines start as drafts so an incomplete route cannot capture MRs. Automated checks run at submission time when their pipeline and stage match; publication is a separate action after all stages approve.

The 24-hour MVP provides an ordered, tag-conditional builder rather than an entirely free-form workflow engine. The route preview calls the same backend selection function used for actual MR submissions.

### 4. Stage builder

Each stage has a reviewer team, order, active state, and tag condition. Its checks have an additional optional tag condition, type, severity, policy category, source, and version. Approved disclosures, rate tables, product terms, and claims should eventually have a governed source of truth.

When a check runs, the system records the exact rule and stage versions used. Checks and stages can be deleted from future routes without erasing historical results. An active pipeline must retain an unconditional stage.

## Audit trail and governance

Auditability is a first-class product feature, not a reporting add-on. The prototype records evidence and exports it as JSON, but its local file storage is not tamper-evident regulated storage.

For every submission version, the system should record:

- Who submitted it and when
- The exact file or content reviewed
- Which automated checks ran and their results
- Which rules and approved sources were used
- Every finding, comment, response, and status change
- Who approved or rejected it and when
- Which approval stages were required for the version
- The version that was ultimately authorized for publication

Approval should attach to a specific immutable version. If approved content is edited, the system creates a new version and invalidates the prior publication authorization. This prevents a common audit problem: proving that someone approved “the campaign” without proving which wording or creative they actually reviewed.

The system should support an exportable audit package containing the final asset, metadata, findings, approvals, rule references, timestamps, and version history.

## Safety and AI principles

AI can make review faster by identifying likely issues, matching claims to approved sources, summarizing changes, and suggesting fixes. The prototype implements configurable advisory text checks with explicit server-side opt-in. They run automatically on version submission, send pasted copy but not attachments, and never approve content or present uncertain interpretations as legal advice.

Every AI finding should include:

- The text or visual region that triggered it
- The reason it was flagged
- The policy or source it was compared against
- A confidence or uncertainty indicator
- A human resolution state

Human reviewers should be able to mark a finding as resolved, accepted with rationale, or not applicable. Those decisions become useful feedback for improving internal rules without turning past reviewer judgment into an unreviewed automatic approval.

## 24-hour MVP

The demo should show several kinds of materials moving through the same shared queue. Each material can carry any set of tags; those tags determine the applicable rules and approval stages.

The demo should allow a user to:

1. Submit an asset with its content and any set of tags.
2. Run deterministic preflight checks against a small sample rule library.
3. View findings alongside the asset.
4. Request changes and upload a revised version.
5. Approve the revised version as a compliance reviewer.
6. Filter the shared queue by tags and status.
7. View and export the versioned audit record.

Example sample findings can illustrate a global prohibited phrase, a channel-specific disclosure, or a product-specific notice. These should be clearly labeled as demonstration rules rather than a complete legal compliance engine.

## Success measures

The product should measure whether it increases throughput without weakening control. Useful metrics include:

- Median time from submission to decision
- Time spent waiting for each review stage
- First-pass approval rate
- Number of revision cycles per asset
- Reviewer workload by queue and risk level
- Percentage of published assets with complete approval records
- Number of expired or unapproved assets detected after publication

The primary success criterion is not simply fewer reviewer comments. It is faster, more consistent review with a defensible record of how every publication decision was made.

## Product positioning

ClearPath is best positioned as a financial-marketing compliance workflow and evidence system. The pull-request metaphor explains the interaction model, but the product’s real value is the combination of governed rules, metadata-driven routing, human approval gates, version control, and an exportable decision history. Regulated use would require stronger identity, retention, and tamper-evidence controls.
