---
name: studio-clarify
description: Ask minimal high-signal clarification questions for Studio planning or execution work. Use when the assistant needs only a few crucial answers and should keep the interaction suitable for Telegram chat.
metadata: { "openclaw": { "requires": { "bins": ["node"] } } }
---

# Studio Clarify

Read first:

- `../../prompts/clarification-policy.md`
- `../../references/project-typology.md`
- `../../references/stage-playbooks.md`

Then follow this process:

- Ask 1-3 questions only.
- Prefer one yes/no, one single-choice, and one short free-text prompt.
- Use numbered options if the answer set is finite.
- Keep questions studio-specific:
  - venue / site
  - date / install window
  - dimensions / measurement state
  - material / finish direction
  - print readiness
  - procurement urgency
- Do not restate the whole plan. Ask only what is currently blocking accurate action.
- If the bridge already returned a planning question batch, present it as-is in a compact form.
