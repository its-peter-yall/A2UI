---
status: investigating
trigger: "quiz-submission-400-invalid-option-id"
created: 2026-02-17T23:25:00Z
updated: 2026-02-17T23:25:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: Option ID mismatch between client and server.
test: Examine how quiz options are generated and submitted.
expecting: Identify where the ID becomes inconsistent.
next_action: Examine ConceptCard.tsx and the server's submit-quiz endpoint.

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Successful quiz submission.
actual: 400 Bad Request: Invalid option id: 4a4a1f07-f007-49c0-b5ff-148aa0d9d943.
errors: learningApi.ts:115 API Request Failed: /learning/nodes/753e554a-91e0-48db-8ac7-c0b4f030b007/submit-quiz {detail: 'Invalid option id: 4a4a1f07-f007-49c0-b5ff-148aa0d9d943'}
reproduction: Clicking submit in ConceptCard.tsx calls submitQuiz with an option id that the server rejects.
started: Unknown

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: 
fix: 
verification: 
files_changed: []
