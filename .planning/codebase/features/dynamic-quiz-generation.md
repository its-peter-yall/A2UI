# Dynamic Quiz Generation Strategy

## Objective
Enhance the adaptive learning system to dynamically determine quiz quantity based on topic complexity. The goal is to move beyond "one-size-fits-all" assessments, using single quizzes for simple hooks and multi-quiz chains for deep, complex topics (e.g., Quantum Mechanics, Economics).

## Core Philosophy
- **Basic Concepts:** Single quiz to verify recall and establish a "hook" into the material.
- **Complex Topics:** Progressive quiz chains (Recall → Application → Synthesis) to reinforce fundamental understanding and test depth.

## Implementation Strategy

### 1. Schema Updates (`server/schemas/learning.py`)
*   **Target:** `TopicNode`
*   **Change:** Add two new optional fields:
    *   `complexity`: `Literal["Basic", "Intermediate", "Advanced"]` (default: "Intermediate")
    *   `quiz_count`: `int` (range 1-5, default: 1)
*   **Rationale:** Allows the Planner to explicitly signal the depth required for each topic.

### 2. Planner Agent Enhancements (`server/agents/planner.py`)
*   **Role:** Curriculum Architect.
*   **Action:** Update the `PLANNER_SYSTEM_PROMPT`.
*   **Instructions:**
    *   Analyze the inherent complexity of a sub-topic.
    *   Assign `quiz_count` based on depth:
        *   **1 Quiz:** Definitions, simple facts, introductions.
        *   **2-3 Quizzes:** Processes, cause-and-effect, comparisons.
        *   **3-5 Quizzes:** Deep synthesis, multi-step reasoning, counter-intuitive concepts.
*   **Outcome:** A tailored roadmap where the "weight" of assessment matches the "weight" of the concept.

### 3. Quizzer Agent Enhancements (`server/agents/quizzer.py`)
*   **Role:** Content Generator.
*   **Action:**
    *   Modify `generate_quiz` to accept `quiz_count` from the `TopicNode`.
    *   Update logic to loop or batch-generate `quiz_count` number of quizzes.
    *   **Crucial Prompt Logic:** If `quiz_count > 1`, enforce a "difficulty gradient":
        *   *Q1 (Easy):* Terminology/Recall.
        *   *Q2 (Medium):* Application/Scenario.
        *   *Q3+ (Hard):* Analysis/Synthesis/Connection to previous topics.
*   **Output:** Returns a `QuizSet` (list of `QuizCard`s) instead of a single `QuizCard`.

### 4. Course Orchestrator Updates (`server/services/course_orchestrator.py`)
*   **Role:** Traffic Controller.
*   **Action:**
    *   Extract `quiz_count` from the Planner's `TopicNode`.
    *   Pass this count to the `QuizzerAgent`.
    *   Handle the `QuizSet` return type and ensure it is correctly passed to `learning_manager.create_concept_node` (which already supports `QuizSet`).

### 4.1 Backend Progression Logic (`server/database/learning_persistence.py`)
*   **Target:** `submit_quiz_answer` (or equivalent logic).
*   **Action:**
    *   Check if the node has a `QuizSet`.
    *   If `current_quiz_index < total_quizzes - 1` AND answer is correct:
        *   Increment `current_quiz_index`.
        *   Return `is_mastered=False` but `next_quiz_ready=True`.
    *   Only mark node as `COMPLETED` (`is_mastered=True`) when the *last* quiz in the set is passed.

### 4.2 Quiz Options Shuffling & Explanations
*   **Target:** `server/database/learning_persistence.py` & `server/schemas/learning.py`
*   **Action:**
    *   Ensure `QuizSet` logic maintains the existing secure shuffling mechanism (`option_id` vs `display_label`) for *each* quiz in the set.
    *   Verify that `QuizOption` explanations (correct/incorrect) are preserved and correctly associated with the stable `option_id` across shuffles.
    *   Ensure the `QuizAttemptResponse` correctly returns the `explanation` for the selected option (even if incorrect) and the `correct_option_id` only upon mastery/completion of that specific quiz step.

### 5. Frontend Verification (`client/src/features/learning/ConceptCard.tsx`)
*   **Current State:** The frontend `ConceptCard` already contains logic for `QuizSet` (e.g., "Quiz X of Y" displays).
*   **Action:** Verify the "Next Quiz" transition within the `IN_QUIZ` state ensures a smooth user experience (UX) where the user completes all quizzes in the chain before unlocking the node.

## Feasibility
*   **Database:** `server/database/learning_persistence.py` already supports `QuizSet` storage and `quiz_data` tables.
*   **Architecture:** The Scatter-Gather pattern in `CourseOrchestrator` readily supports variable-weight tasks.
*   **Cost:** Minimal impact. Generating 2-3 extra small JSON objects for complex topics is negligible compared to the value of deeper assessment.

## Next Steps
1.  Apply Schema changes.
2.  Update Planner prompts.
3.  Update Quizzer logic.
4.  Wire up the Orchestrator.
