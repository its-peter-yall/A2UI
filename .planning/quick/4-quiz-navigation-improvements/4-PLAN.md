---
phase: quick
plan: 4
type: execute
wave: 1
depends_on: []
files_modified: [
  server/database/learning_persistence.py,
  server/routers/learning.py,
  client/src/lib/learningApi.ts,
  client/src/features/learning/useLearningMutations.ts,
  client/src/features/learning/ConceptCard.tsx,
  client/src/features/learning/LearningPathContainer.tsx,
  server/tests/test_learning_persistence.py
]
autonomous: true

must_haves:
  truths:
    - "Previous button is disabled on the first quiz of a node"
    - "Previous button navigates to the immediate past quiz in a multi-quiz set"
    - "Standard navigation is preserved when not in quiz state"
  artifacts:
    - path: "server/database/learning_persistence.py"
      provides: "decrement_quiz_set_progress method"
    - path: "server/routers/learning.py"
      provides: "/nodes/{id}/previous-quiz endpoint"
    - path: "client/src/features/learning/ConceptCard.tsx"
      provides: "Context-aware navigation button logic"
---

<objective>
Improve quiz navigation by disabling the "Previous" button until the quiz is completed (to avoid cheating) and supporting backward navigation within multi-quiz sets.

Requirements:
1. Disable "Previous" button in quiz card until completed.
2. In multi-quiz sets, "Previous" button should take users to the immediate past quiz.
3. Show "Quiz {X} of {Y}" in the quiz card.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Backend Navigation Support</name>
  <files>server/database/learning_persistence.py, server/routers/learning.py</files>
  <action>
    Implement logic to decrement quiz set progress:
    1. Add `decrement_quiz_set_progress` to `LearningManager` in `learning_persistence.py`.
    2. Add `POST /learning/nodes/{node_id}/previous-quiz` to `learning.py` router.
  </action>
  <done>
    Backend support implemented and verified.
  </done>
</task>

<task type="auto">
  <name>Task 2: Frontend API and Mutations</name>
  <files>client/src/lib/learningApi.ts, client/src/features/learning/useLearningMutations.ts</files>
  <action>
    Add frontend support for previous quiz navigation:
    1. Add `previousQuiz` to `learningApi.ts`.
    2. Add `previousQuizMutation` and `goToPreviousQuiz` to `useLearningMutations.ts`.
  </action>
  <done>
    Frontend mutations implemented and ready for UI consumption.
  </done>
</task>

<task type="auto">
  <name>Task 3: UI Implementation</name>
  <files>client/src/features/learning/ConceptCard.tsx, client/src/features/learning/LearningPathContainer.tsx</files>
  <action>
    Update `ConceptCard` to use the new navigation logic:
    1. Modify `IN_QUIZ` state to render a custom "Previous" button.
    2. Disable the button if `currentQuizIndex === 0` or if it's a single quiz.
    3. Call `onPreviousQuiz` if `currentQuizIndex > 0`.
    4. Pass the callback from `LearningPathContainer`.
  </action>
  <done>
    UI updated and verified context-aware button states.
  </done>
</task>

<task type="auto">
  <name>Task 4: Test Maintenance</name>
  <files>server/tests/test_learning_persistence.py</files>
  <action>
    Fix regressions and add coverage:
    1. Fix `test_create_quiz_attempt_incorrect_answer` (revealed incorrect expectation for `correct_option_id`).
    2. Add `TestQuizSetNavigation` to verify index decrement logic.
  </action>
  <done>
    Tests passing and coverage increased for new navigation feature.
  </done>
</task>

</tasks>

<verification>
1. Run backend tests: `python -m unittest discover server/tests`
2. Run frontend lint: `npm run lint` (in client)
</verification>

<success_criteria>
- Users cannot navigate back to explanation from the first quiz.
- Users can navigate between quizzes in a multi-quiz set.
- Quiz counter "Quiz X of Y" is visible.
- All backend tests pass.
</success_criteria>
