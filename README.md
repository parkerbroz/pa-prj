# ClearPath Review Studio

A working take-home prototype for marketing compliance teams. All materials enter one shared queue. Any tags can be added to a submission; rules and review stages apply when their configured tags match. Marketers and reviewers work on numbered, immutable versions, and every decision stays attached to the version it covered.

## Run locally

Requires Node.js 20 or later. No package installation or external services are required.

```sh
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The first launch creates fictional sample data in `data/store.json`. That file is ignored by Git. Set `PORT`, `HOST`, and `DATA_FILE` to change the listener and storage location. For a container or hosted environment, set `HOST=0.0.0.0`.

To share a temporary interview demo, keep the server running and start a [Cloudflare quick tunnel](https://developers.cloudflare.com/tunnel/get-started/#quick-tunnels-development) in another terminal:

```sh
brew install cloudflared
cloudflared tunnel --url http://127.0.0.1:3000
```

The tunnel prints a public URL and lasts only while its process and the local server remain running. Use fictional demo content; this prototype has no real user authentication.

## Demo flow

1. In **Pipelines**, enter tags in the route preview. An empty scope means a stage applies to every submission; a scoped stage applies when all of its tags are present.
2. Add a stage for any new tag, then add a matching required or prohibited phrase in **Rule library**.
3. Switch the demo user to **Alex Morgan · Marketing** and create a submission using that tag. Paste copy or attach an image/PDF with reviewable copy entered separately.
4. Switch to the assigned reviewer to add findings or request changes. Alex can submit a new version, which reruns checks and restarts the approval route.
5. Approve each required stage, then switch back to Marketing to mark the approved version published.
6. Open **History & evidence** or download an **Audit package**. Editing a published material starts a new review and removes its prior publication authorization.

The fictional seed data includes examples across email, web, social, article, and print-like workflows. No product or channel names are hardcoded into the rule engine.

## What is implemented

- Shared queue with status, tag, and text filters
- General submissions with open ended tags, pasted copy, optional source URL, and optional PNG/JPEG/WebP/PDF attachment
- Configurable rule library with category, source, severity, version, active state, and tag conditions
- Configurable sequential approval stages with reviewer team, order, active state, and tag conditions
- Live tag-based route preview
- Rule and stage snapshots for each submitted version
- Deterministic preflight checks, reviewer findings, comments, resolutions, change requests, version comparison, approvals, and publication gate
- JSON audit export with original content, attachment data, SHA-256 hashes, check results, rule/stage snapshots, findings, decisions, comments, and timestamped events
- Local JSON persistence using atomic file replacement

## Test

```sh
npm test
```

The tests cover arbitrary tag routing, configuration snapshots, revision gates, finding resolution, publication authorization, and audit exports.

## Design and limits

Read [DESIGN.md](DESIGN.md) for the product rationale. This is a demo, not a legal determination engine. The seeded rules are fictional sample internal policies. Automated checks are deliberately narrow and inspect the text supplied by the marketer; image and PDF attachments are preserved for human review but are not OCR'd. The role switcher simulates teams and is not authentication. The local JSON store is an application-level history, not tamper-evident regulated storage. Real deployment would need identity, access controls, durable storage, retention policy, rule governance, and expert-maintained legal content before handling actual customer campaigns.
