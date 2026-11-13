> Planning and process documentation, written in **Portuguese**.
> This file is the index and the reading order for whoever arrives new.

# docs/

## Reading order for a newcomer

1. [extractor/PROJECT.md](extractor/PROJECT.md) — what PagePace is and what the extractor must do.
2. [extractor/ARCHITECTURE.md](extractor/ARCHITECTURE.md) — the seven layers, the packages and the structural decisions.
3. [extractor/SCHEMA.md](extractor/SCHEMA.md) — the data contract (`RawDocument`, `Book`, `Overlay`, `Anchor`) and its versioning rules.
4. [extractor/EVALUATION.md](extractor/EVALUATION.md) — the metrics, the goals, the baseline and the regression gate.
5. [extractor/DECISIONS.md](extractor/DECISIONS.md) — the ADR log: read only the `ADR-NNN` entries you need (the index at the top lists all of them).

After that, depending on the work: [extractor/ROADMAP.md](extractor/ROADMAP.md)
(plan) + [extractor/phases/](extractor/phases/) (the phase you are in),
[extractor/STATE.md](extractor/STATE.md) (live state of the extractor),
[app/](app/) for the reading app, [WORKFLOW.md](WORKFLOW.md) for the process.

## What each file is

| Path | What it is |
|---|---|
| `extractor/PROJECT.md` | Problem, goals and scope of the extractor |
| `extractor/ARCHITECTURE.md` | Layers, packages, structural decisions |
| `extractor/SCHEMA.md` | The contract between extractor, app and eval (versioned) |
| `extractor/EVALUATION.md` | Metrics, goals, baseline, runner flags |
| `extractor/DECISIONS.md` | ADRs — why each choice was made |
| `extractor/ROADMAP.md` | Milestones and phases of the extractor |
| `extractor/phases/` | One file per phase (E0…E10, SEG): tasks and acceptance criteria |
| `extractor/REQUIREMENTS.md`, `GLOSSARY.md`, `CORPUS.md` | Requirements, vocabulary, corpus policy |
| `extractor/BACKLOG.md`, `OPEN-QUESTIONS.md` | Ideas outside the current task; open questions for the owner |
| `extractor/STATE.md` | Hand-off file: current task, handoff, blockers, metrics |
| `extractor/archive/` | Older state logs and closed questions (history, never deleted) |
| `extractor/spikes/` | Throwaway experiments that informed decisions |
| `app/` | Planning of the reader app: `PROJECT.md`, `ROADMAP.md`, `READING-MODES.md`, `ARCHITECTURE.md`, `OCR-FLOW.md`, `VIEW-ORIGINAL.md`, `STATE.md`, `DECISIONS.md`, `OPEN-QUESTIONS.md` |
| `templates/` | `PHASE.md` and `TASK.md` — the templates for planning work |
| `WORKFLOW.md` | The process: git, the task cycle, the session protocol |
| `GUIA-DO-PO.md` | Step-by-step guide for the project owner (Windows/PowerShell) |

## The working memory of the process

[WORKFLOW.md](WORKFLOW.md), [GUIA-DO-PO.md](GUIA-DO-PO.md),
[extractor/archive/](extractor/archive/) and [../.opencode/](../.opencode/)
(skills for the AI agents) are the **working memory** of how this project runs:
they hold the rules, the hand-offs and the recipes, not the product itself.
The live state always lives in the `STATE.md` files; history lives in git.
