# Custom Learning Mode

Status: proposed; awaiting user review before implementation.

## User objective

Add Custom to the learning page's Auto / Lite / Full mode dropdown.
In Custom, the user chooses the exact number of concept cards and whether
research is enabled for that course.

## Proposed interaction

- Auto remains the initial selection. Existing Auto, Lite, and Full behavior
  remains supported.
- Selecting Custom reveals a compact settings row below the topic input.
- A labeled Number of concepts field accepts a required whole number from
  1 through 30. It starts empty, so the user supplies the count explicitly.
  This proposed range retains the existing maximum course size of 30.
- A labeled Research switch uses the existing per-course web-search state,
  initially off. Its value agrees with the existing globe control; both
  controls represent one setting, never independent research flags.
- Research is visible in Custom even without configured search providers.
  In that case it is disabled with guidance to configure search in Settings.
  Custom generation with research off remains available.
- Switching modes hides the Custom settings while retaining the entered
  count during the mounted form's lifetime. Only Custom submits the count.
- Invalid or missing counts prevent submission and receive clear, accessible
  validation feedback. Pending generation disables the settings.
- The settings fit narrow viewports and follow the existing visual styles.

## Contract and generation behavior

- Extend the selected and resolved mode unions to include custom.
- Extend generation requests and session responses with optional
  custom_topic_count. It is required for custom and absent/null otherwise.
- Server validation rejects missing counts for custom, non-integer values
  including booleans and fractions, counts outside 1–30, and non-null custom
  counts supplied with other modes. Existing requests remain compatible.
- Custom bypasses automatic depth classification. The planner receives the
  exact requested count and a Custom prompt enforcing that count.
- A Custom outline must contain exactly that many topics. If the first
  outline has the wrong count, retry once using stricter count instructions.
  A second mismatch fails generation through the existing durable error flow;
  do not silently truncate, pad, or accept a different count.
- Support one- and two-topic Custom outlines while retaining the existing
  Lite range of 3–10 and Full range of 10–30.
- Persist the selected mode, resolved mode, and requested count on SQLite
  and MongoDB through the existing repository contracts. Carry the requested
  count into checkpointed graph state and restore it when resuming a job.
- Research on/off reuses GenerateCourseOptions.webSearchEnabled, existing
  scoped search headers, and the graph's optional researcher stage. No
  separate research pipeline or credential persistence is introduced.
- Preserve detached 202 generation, batching, progress events, quizzes,
  cancellation, and regeneration behavior for Custom courses.

## Acceptance criteria

1. The dropdown offers Auto, Lite, Full, and Custom.
2. Custom exposes a user-entered count and a research toggle.
3. A submitted count of N produces an accepted outline with exactly N topics;
   tests include 1, 2, intermediate counts, and 30.
4. Missing, fractional, boolean, zero, negative, and above-limit counts are
   rejected at the appropriate client/server boundary.
5. Research off skips the researcher; research on follows existing search
   configuration and executes the optional research stage.
6. Custom count survives session reads and generation resume on both stores.
7. Existing modes and requests without custom_topic_count remain compatible.
8. Meaningful failing tests precede implementation. Focused tests, regression
   suites, client build, lint, and appropriate coverage gates are verified.

## Alternatives considered

The recommended settings row provides room for clear labels and validation
without crowding the topic input. Putting both controls inside the dropdown
would complicate its listbox interaction. A separate modal adds an extra
step for two small settings.

## Scope

This feature controls concept count and optional web research. Quiz count,
per-concept pedagogy, model selection, and existing global provider settings
continue to use their current rules.

## Specification references

docs/ARCHITECTURE.md, docs/STACK.md, docs/TESTING.md,
docs/CONVENTIONS.md, docs/STRUCTURE.md, docs/INTEGRATIONS.md,
docs/CONCERNS.md, and docs/learning-depth-modes/goal.md.
