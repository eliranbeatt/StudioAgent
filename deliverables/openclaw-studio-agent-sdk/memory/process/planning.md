# Planning Process

## Goal

Run a stepwise project planning workflow that fits Telegram chat.

## Rules

- Enter planning mode only after explicit user confirmation or a very clear planning request.
- Keep each clarification batch to 1-3 questions.
- Ask blockers first, then element-specific gaps, then project-level gaps.
- Use numbered choices when selection is possible.
- After each answered set, move directly to the next set.
- When there are no more critical question sets, propose finalization.

## Bridge operations

- Start or resume: `planning.run.start`
- Read current batch: `planning.questions.next`
- Submit answers: `planning.answers.submit`
- Finalize: `planning.finalize`

## Telegram formatting

- One short intro line
- One flat list of questions
- One reply format hint, for example: `1. ... 2. ...`
