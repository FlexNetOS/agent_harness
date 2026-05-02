# Architecture Decision Records (ADRs)

This directory holds the harness's architecture decisions. Each ADR captures one decision, its context, the alternatives considered, and the consequences.

## Format

Each ADR follows the same shape:

- **Status** — Proposed, Accepted, Superseded
- **Context** — what's currently true, why a decision is needed
- **Decision** — what we will do
- **Consequences** — positive, negative, neutral
- **Alternatives Considered** — what we ruled out and why
- **References** — files, links, prior art

## Index

| ID | Title | Status |
|---|---|---|
| [0001](./0001-claude-4x-model-migration.md) | Claude 4.X Model Migration | Proposed |
| [0002](./0002-claude-api-feature-coverage.md) | Claude API Feature Coverage | Proposed |
| [0003](./0003-hook-and-plugin-verification.md) | Hook and Plugin Verification Protocol | Proposed |
| [0004](./0004-devcontainer-packaging.md) | DevContainer + Docker Packaging | Proposed |

## Conventions

- File name: `NNNN-kebab-case-title.md` (zero-padded, monotonic).
- Once an ADR is **Accepted**, edits should be Superseded ADRs, not in-place rewrites — preserves the decision trail.
- Cross-link related ADRs in the `Related:` header.
- Architectural facts that span multiple ADRs (e.g., the cross-harness portability model) live in sibling docs like `../cross-harness.md`, not in ADRs.
