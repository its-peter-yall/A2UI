# Plan 03a-01: Update NodeStatus Enum and State Transitions

<plan>
  <meta>
    <id>03a-01</id>
    <title>Update NodeStatus Enum and State Transitions</title>
    <phase>03a-schema-fixes</phase>
    <depends_on>03-01, 03-02</depends_on>
    <estimated_tasks>4</estimated_tasks>
  </meta>

  <context>
    <problem>
      The current NodeStatus enum only has LOCKED, UNLOCKED, COMPLETED, and ERROR states.
      This doesn't support the sequential learning flow decision (Issue #3) which requires
      distinct UI states for viewing explanation, taking quiz, and showing feedback.
      Additionally, the state transition logic needs updating to support the new flow.
    </problem>
    <decision>
      Implement Option A (Sequential Flow) as decided in issues.md:
      - Distinct UI states: Explanation → Quiz → Feedback → Completed
      - Explanation hidden during quiz to enforce retrieval practice
      - Server tracks which view the user is in
    </decision>
    <files>
      <file path="server/schemas/learning.py" action="modify">
        Update NodeStatus enum with new values
      </file>
      <file path="server/database/learning_persistence.py" action="modify">
        Update _is_valid_transition() with new state machine
      </file>
    </files>
  </context>

  <tasks>
    <task id="1" priority="critical">
      <title>Update NodeStatus enum in learning.py</title>
      <description>
        Replace the existing 4-state enum with the new 5-state enum that supports
        the sequential learning flow.
      </description>
      <location>server/schemas/learning.py:23-29</location>
      <changes>
        <change type="replace">
          <old>
            ```python
            class NodeStatus(str, Enum):
                """Status values for learning concept nodes."""

                LOCKED = "LOCKED"
                UNLOCKED = "UNLOCKED"
                COMPLETED = "COMPLETED"
                ERROR = "ERROR"
            ```
          </old>
          <new>
            ```python
            class NodeStatus(str, Enum):
                """Status values for learning concept nodes.

                State Flow:
                    LOCKED → VIEWING_EXPLANATION → IN_QUIZ → SHOWING_FEEDBACK → COMPLETED
                                    ↓                              ↓
                                  ERROR                        (retry loop back to IN_QUIZ)

                States:
                    LOCKED: Cannot access yet; previous node not completed
                    VIEWING_EXPLANATION: Reading content, quiz hidden
                    IN_QUIZ: Taking quiz, explanation hidden (pure retrieval)
                    SHOWING_FEEDBACK: Showing results and explanations
                    COMPLETED: 100% quiz score achieved, can review
                    ERROR: Generation or system error occurred
                """

                LOCKED = "LOCKED"
                VIEWING_EXPLANATION = "VIEWING_EXPLANATION"
                IN_QUIZ = "IN_QUIZ"
                SHOWING_FEEDBACK = "SHOWING_FEEDBACK"
                COMPLETED = "COMPLETED"
                ERROR = "ERROR"
            ```
          </new>
        </change>
      </changes>
      <verify>
        <check>Enum has exactly 6 values</check>
        <check>Docstring explains state flow</check>
        <check>Values are uppercase strings</check>
      </verify>
    </task>

    <task id="2" priority="critical">
      <title>Update state transition logic in learning_persistence.py</title>
      <description>
        Update the _is_valid_transition() method to implement the new state machine
        that enforces the sequential learning flow.
      </description>
      <location>server/database/learning_persistence.py:457-469</location>
      <changes>
        <change type="replace">
          <old>
            ```python
            @staticmethod
            def _is_valid_transition(
                current_status: NodeStatus, next_status: NodeStatus
            ) -> bool:
                if current_status == next_status:
                    return True
                allowed = {
                    NodeStatus.LOCKED: {NodeStatus.UNLOCKED, NodeStatus.ERROR},
                    NodeStatus.UNLOCKED: {NodeStatus.COMPLETED, NodeStatus.ERROR},
                    NodeStatus.COMPLETED: set(),
                    NodeStatus.ERROR: {NodeStatus.LOCKED, NodeStatus.UNLOCKED},
                }
                return next_status in allowed[current_status]
            ```
          </old>
          <new>
            ```python
            @staticmethod
            def _is_valid_transition(
                current_status: NodeStatus, next_status: NodeStatus
            ) -> bool:
                """Validate state transitions for the sequential learning flow.

                Valid transitions:
                    LOCKED → VIEWING_EXPLANATION (unlock when previous completed)
                    VIEWING_EXPLANATION → IN_QUIZ (user clicks "proceed to quiz")
                    VIEWING_EXPLANATION → ERROR (generation failed)
                    IN_QUIZ → SHOWING_FEEDBACK (quiz submitted)
                    SHOWING_FEEDBACK → IN_QUIZ (retry quiz, score < 100%)
                    SHOWING_FEEDBACK → COMPLETED (score = 100%)
                    ERROR → LOCKED (reset for retry)
                    ERROR → VIEWING_EXPLANATION (regeneration succeeded)

                Note: First node starts as VIEWING_EXPLANATION (not LOCKED).
                """
                if current_status == next_status:
                    return True
                allowed = {
                    NodeStatus.LOCKED: {
                        NodeStatus.VIEWING_EXPLANATION,  # Unlocked by previous completion
                        NodeStatus.ERROR,
                    },
                    NodeStatus.VIEWING_EXPLANATION: {
                        NodeStatus.IN_QUIZ,  # User clicks "proceed to quiz"
                        NodeStatus.ERROR,
                    },
                    NodeStatus.IN_QUIZ: {
                        NodeStatus.SHOWING_FEEDBACK,  # Quiz submitted
                        NodeStatus.ERROR,
                    },
                    NodeStatus.SHOWING_FEEDBACK: {
                        NodeStatus.IN_QUIZ,  # Retry (score < 100%)
                        NodeStatus.COMPLETED,  # Mastered (score = 100%)
                    },
                    NodeStatus.COMPLETED: set(),  # Terminal state
                    NodeStatus.ERROR: {
                        NodeStatus.LOCKED,  # Reset
                        NodeStatus.VIEWING_EXPLANATION,  # Regeneration succeeded
                    },
                }
                return next_status in allowed[current_status]
            ```
          </new>
        </change>
      </changes>
      <verify>
        <check>All 6 states have entries in allowed dict</check>
        <check>COMPLETED is terminal (empty set)</check>
        <check>SHOWING_FEEDBACK can go to IN_QUIZ (retry) or COMPLETED (mastered)</check>
        <check>Docstring documents all valid transitions</check>
      </verify>
    </task>

    <task id="3" priority="high">
      <title>Update get_learning_session completed count logic</title>
      <description>
        The completed_nodes count in get_learning_session() uses NodeStatus.COMPLETED.value
        which will continue to work, but we should ensure the query is correct.
      </description>
      <location>server/database/learning_persistence.py:172</location>
      <changes>
        <change type="verify_only">
          Confirm the query `SUM(CASE WHEN cn.status = ? THEN 1 ELSE 0 END)` with
          NodeStatus.COMPLETED.value will work correctly with the new enum.
          No code change needed - the COMPLETED value is unchanged.
        </change>
      </changes>
      <verify>
        <check>NodeStatus.COMPLETED.value is still "COMPLETED"</check>
        <check>Query uses parameterized value, not hardcoded string</check>
      </verify>
    </task>

    <task id="4" priority="medium">
      <title>Update default status for first node creation</title>
      <description>
        When creating concept nodes, the first node (sequence_index=0) should start
        as VIEWING_EXPLANATION, not LOCKED. Update create_concept_node or document
        that callers must pass the correct status.
      </description>
      <location>server/database/learning_persistence.py:199-263</location>
      <changes>
        <change type="document">
          Add docstring clarification that callers must pass:
          - status=VIEWING_EXPLANATION for first node (index=0)
          - status=LOCKED for subsequent nodes (index>0)
          
          Alternatively, add logic to auto-determine status based on sequence_index.
          Decision: Document caller responsibility for flexibility.
        </change>
      </changes>
      <verify>
        <check>Docstring clarifies status expectations</check>
        <check>Orchestration layer passes correct initial status</check>
      </verify>
    </task>
  </tasks>

  <verification>
    <run_tests>python -m unittest server.tests.test_learning_persistence</run_tests>
    <manual_checks>
      <check>Import NodeStatus from learning.py succeeds</check>
      <check>All 6 enum values accessible</check>
      <check>State transitions match documented flow</check>
    </manual_checks>
  </verification>

  <rollback>
    <steps>
      <step>Revert learning.py NodeStatus enum to original 4 values</step>
      <step>Revert learning_persistence.py _is_valid_transition to original</step>
      <step>Re-run tests to confirm rollback successful</step>
    </steps>
  </rollback>
</plan>
