Add these two bullets to the END of the existing "## Constraints" section in
context/TECH_CONTEXT.md. Do not create a new heading: the assembler extracts
only the FIRST heading matching /constraints|do not|guardrails/i, so a new
section would never be injected.

- Frontend work follows `docs/DESIGN_LANGUAGE.md`. It is the visual contract:
  colour tokens, the dark scheme, the type scale and the component specs. Read
  it before writing UI code; do not derive a second design language beside it.
- Do not sample designs, colour or copy from other products. Structure and
  interaction conventions are shared vocabulary; another product's visual
  identity is not.
