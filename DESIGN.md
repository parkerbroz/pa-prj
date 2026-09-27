# ClearPath Marketing Compliance Review

## Product concept

ClearPath Financial needs to approve a growing volume of marketing materials across products and channels. Today, reviews are managed through email and spreadsheets, which makes it difficult to see what is waiting, understand why an asset was rejected, or prove who approved a specific version.

ClearPath Marketing Compliance Review is a shared workspace for submitting, checking, revising, approving, and auditing marketing materials.

The product borrows useful ideas from pull requests and CI/CD: every submission is versioned, automated checks run before human review, reviewers leave findings in context, and approval gates control release. The user-facing product should still speak in marketing and compliance language. Marketers should see “submissions,” “findings,” and “approvals,” not software-development terminology they do not use.

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
- Status: in review, changes requested, approved, or published
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

The workflow branches based on tags. An administrator can configure a stage or check to apply to every submission or only when the submission has specified tags. Tags are open ended; products, channels, and jurisdictions are examples, not fixed choices in the data model.

Automated checks run as a preflight step before a human review begins. Example checks include:

- Required disclosure is missing
- A claim does not match an approved source or product term
- A phrase is prohibited by internal policy
- The selected state is missing from the submission metadata
- An affiliate disclosure is missing
- A rate, fee, or offer date may be stale
- The asset uses a disclosure that is not approved for the selected product or channel

Checks should return an explanation, severity, rule reference, and suggested next action. Automated results are decision support, not final legal determinations. A human reviewer remains responsible for approval.

## Main product surfaces

### 1. Submission queue

The home screen is a work queue for marketers and compliance workers. Users can filter by status or any tag and search material titles and owners. The prototype shows counts for items in review, changes requested, approved or published, and open findings. Review time and first-pass approval metrics are natural next steps.

The queue should make the next action obvious. A compliance reviewer should be able to open “high-risk affiliate submissions awaiting review” without navigating through projects or folders.

### 2. Submission detail

The detail view contains:

- A preview of the asset
- Submission metadata and applicable rule sets
- Version selector and side-by-side comparison
- Automated preflight results
- Findings with quoted evidence and policy sources
- Reviewer comments and replies
- Current approval status and required approvers
- Full audit history

Marketers should be able to respond to a finding, upload a new version, and see which findings were resolved or reopened. Reviewers should be able to approve, reject, request changes, or escalate.

### 3. Workflow builder

Administrators can create reusable workflow templates using a small set of steps:

- Automated preflight
- Marketing review
- Compliance review
- Legal review
- Product review
- Final approval
- Publish authorization

The 24-hour MVP should provide a template-based builder with configurable steps and tag conditions rather than an entirely free-form workflow engine. This keeps the product understandable for nontechnical administrators while demonstrating the core value.

### 4. Rules and approved content

Rules should be managed separately from individual submissions. Each rule has an owner, scope, severity, effective date, and version. Approved disclosures, rate tables, product terms, and claims should also have a source of truth.

When a check runs, the system records the exact rule version and source content used. If a rule changes later, the historical review remains reproducible.

## Audit trail and governance

Auditability is a first-class product feature, not a reporting add-on.

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

AI can make review faster by identifying likely issues, matching claims to approved sources, summarizing changes, and suggesting fixes. It should not silently approve content or present uncertain interpretations as legal advice.

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
7. View and export the immutable audit trail.

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

ClearPath is best positioned as a financial-marketing compliance workflow and evidence system. The pull-request metaphor explains the interaction model, but the product’s real value is the combination of finance-specific rules, metadata-driven routing, human approval gates, version control, and regulator-ready audit history.
