# Plan 03a-02: Add Quiz Attempts Table and Mastery Tracking

<plan>
  <meta>
    <id>03a-02</id>
    <title>Add Quiz Attempts Table and Mastery Tracking</title>
    <phase>03a-schema-fixes</phase>
    <depends_on>03a-01</depends_on>
    <estimated_tasks>5</estimated_tasks>
  </meta>

  <context>
    <problem>
      Issue #1 identifies that the system lacks quiz retry functionality with mastery
      requirements. Users must achieve 100% score to proceed to the next topic, but
      there's no mechanism to track multiple attempts or enforce this requirement.
    </problem>
    <requirements>
      - Track each quiz attempt with timestamp and score
      - Support multiple attempts per node
      - Enforce 100% mastery before allowing progression
      - Show attempt history for user feedback
    </requirements>
    <files>
      <file path="server/schemas/learning.py" action="modify">
        Add QuizAttempt and QuizAttemptResponse Pydantic models
      </file>
      <file path="server/database/learning_persistence.py" action="modify">
        Add quiz_attempts table and CRUD operations
      </file>
    </files>
  </context>

  <tasks>
    <task id="1" priority="critical">
      <title>Add quiz_attempts table to init_learning_tables()</title>
      <description>
        Create the quiz_attempts table to track each quiz submission with score
        and selected answers. This enables retry functionality and mastery tracking.
      </description>
      <location>server/database/learning_persistence.py:41-116</location>
      <changes>
        <change type="insert_after" anchor="quiz_data table creation">
          ```python
          cursor.execute(
              """
              CREATE TABLE IF NOT EXISTS quiz_attempts (
                  id TEXT PRIMARY KEY,
                  node_id TEXT NOT NULL,
                  attempt_number INTEGER NOT NULL,
                  selected_option_id TEXT NOT NULL,
                  is_correct INTEGER NOT NULL,
                  score_percent INTEGER NOT NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (node_id)
                      REFERENCES concept_nodes(id)
                      ON DELETE CASCADE
              )
              """
          )
          ```
        </change>
        <change type="insert_after" anchor="quiz_data index">
          ```python
          cursor.execute(
              """
              CREATE INDEX IF NOT EXISTS idx_quiz_attempts_node_id
              ON quiz_attempts(node_id)
              """
          )
          cursor.execute(
              """
              CREATE INDEX IF NOT EXISTS idx_quiz_attempts_node_attempt
              ON quiz_attempts(node_id, attempt_number)
              """
          )
          ```
        </change>
      </changes>
      <verify>
        <check>Table has all required columns</check>
        <check>Foreign key references concept_nodes(id)</check>
        <check>Indexes created for efficient queries</check>
      </verify>
    </task>

    <task id="2" priority="critical">
      <title>Add QuizAttempt Pydantic models to learning.py</title>
      <description>
        Create Pydantic models for quiz attempt tracking: base model for creation
        and response model for API responses.
      </description>
      <location>server/schemas/learning.py (after QuizResult class, ~line 238)</location>
      <changes>
        <change type="insert_after" anchor="QuizResult class">
          ```python
          class QuizAttemptBase(BaseModel):
              """Base fields for quiz attempts."""

              model_config = ConfigDict(from_attributes=True)

              node_id: str = Field(..., description="Concept node identifier")
              selected_option_id: str = Field(
                  ...,
                  description="Selected option identifier (A, B, C, or D)",
                  pattern=r"^[A-D]$",
              )


          class QuizAttemptCreate(QuizAttemptBase):
              """Schema for creating a quiz attempt."""

              pass


          class QuizAttemptResponse(ResponseBase, TimestampMixin, QuizAttemptBase):
              """Response schema for quiz attempts with result details."""

              attempt_number: int = Field(..., description="Attempt number (1-indexed)", ge=1)
              is_correct: bool = Field(..., description="Whether the selected answer was correct")
              score_percent: int = Field(
                  ...,
                  description="Score as percentage (0 or 100 for single-question quiz)",
                  ge=0,
                  le=100,
              )
              correct_option_id: str = Field(
                  ...,
                  description="The correct option identifier",
                  pattern=r"^[A-D]$",
              )
              explanation: str = Field(
                  ...,
                  description="Explanation for the selected answer",
              )
              is_mastered: bool = Field(
                  ...,
                  description="Whether 100% score was achieved (can proceed)",
              )


          class QuizAttemptHistory(BaseModel):
              """History of all quiz attempts for a node."""

              model_config = ConfigDict(from_attributes=True)

              node_id: str = Field(..., description="Concept node identifier")
              total_attempts: int = Field(..., description="Total number of attempts", ge=0)
              is_mastered: bool = Field(..., description="Whether quiz is mastered (100%)")
              best_score: int = Field(..., description="Best score achieved", ge=0, le=100)
              attempts: List[QuizAttemptResponse] = Field(
                  default_factory=list,
                  description="List of all attempts in order",
              )
          ```
        </change>
      </changes>
      <verify>
        <check>QuizAttemptBase has node_id and selected_option_id</check>
        <check>QuizAttemptResponse includes is_mastered field</check>
        <check>QuizAttemptHistory provides aggregate stats</check>
        <check>All fields have proper validation</check>
      </verify>
    </task>

    <task id="3" priority="high">
      <title>Add create_quiz_attempt() method to LearningManager</title>
      <description>
        Implement the method to record a quiz attempt, calculate score,
        and return the attempt details with mastery status.
      </description>
      <location>server/database/learning_persistence.py (after get_quiz_for_node)</location>
      <changes>
        <change type="insert">
          ```python
          def create_quiz_attempt(
              self,
              node_id: str,
              selected_option_id: str,
          ) -> Dict[str, Any]:
              """Record a quiz attempt and return result with mastery status.

              Args:
                  node_id: The concept node identifier
                  selected_option_id: The selected option (A, B, C, or D)

              Returns:
                  Dict with attempt details including is_correct, score_percent,
                  correct_option_id, explanation, and is_mastered

              Raises:
                  ValueError: If node_id not found or has no quiz
              """
              conn = self._get_connection()
              try:
                  cursor = conn.cursor()

                  # Get quiz data for this node
                  quiz = self.get_quiz_for_node(node_id)
                  if quiz is None:
                      raise ValueError(f"No quiz found for node: {node_id}")

                  # Find correct option and selected option details
                  correct_option = None
                  selected_option = None
                  for opt in quiz.options:
                      if opt.is_correct:
                          correct_option = opt
                      if opt.id == selected_option_id:
                          selected_option = opt

                  if selected_option is None:
                      raise ValueError(f"Invalid option id: {selected_option_id}")

                  is_correct = selected_option.is_correct
                  score_percent = 100 if is_correct else 0

                  # Get next attempt number
                  cursor.execute(
                      """
                      SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next_attempt
                      FROM quiz_attempts
                      WHERE node_id = ?
                      """,
                      (node_id,),
                  )
                  attempt_number = cursor.fetchone()["next_attempt"]

                  # Insert attempt record
                  attempt_id = str(uuid.uuid4())
                  now = datetime.now(timezone.utc).isoformat()
                  cursor.execute(
                      """
                      INSERT INTO quiz_attempts (
                          id, node_id, attempt_number, selected_option_id,
                          is_correct, score_percent, created_at
                      )
                      VALUES (?, ?, ?, ?, ?, ?, ?)
                      """,
                      (
                          attempt_id,
                          node_id,
                          attempt_number,
                          selected_option_id,
                          1 if is_correct else 0,
                          score_percent,
                          now,
                      ),
                  )
                  conn.commit()

                  logger.info(
                      f"Quiz attempt recorded: node={node_id}, "
                      f"attempt={attempt_number}, correct={is_correct}"
                  )

                  return {
                      "id": attempt_id,
                      "node_id": node_id,
                      "attempt_number": attempt_number,
                      "selected_option_id": selected_option_id,
                      "is_correct": is_correct,
                      "score_percent": score_percent,
                      "correct_option_id": correct_option.id,
                      "explanation": selected_option.explanation,
                      "is_mastered": is_correct,  # 100% = mastered for single question
                      "created_at": now,
                      "updated_at": now,
                  }
              except sqlite3.Error as e:
                  logger.error(f"Error creating quiz attempt: {e}")
                  raise
              finally:
                  conn.close()
          ```
        </change>
      </changes>
      <verify>
        <check>Method validates node has quiz</check>
        <check>Correctly identifies selected and correct options</check>
        <check>Calculates attempt_number incrementally</check>
        <check>Returns is_mastered based on 100% score</check>
      </verify>
    </task>

    <task id="4" priority="high">
      <title>Add get_quiz_attempts() method to LearningManager</title>
      <description>
        Implement method to retrieve attempt history for a node, including
        aggregate stats like total_attempts, best_score, and is_mastered.
      </description>
      <location>server/database/learning_persistence.py (after create_quiz_attempt)</location>
      <changes>
        <change type="insert">
          ```python
          def get_quiz_attempts(self, node_id: str) -> Dict[str, Any]:
              """Get quiz attempt history for a node.

              Args:
                  node_id: The concept node identifier

              Returns:
                  Dict with total_attempts, is_mastered, best_score, and attempts list
              """
              conn = self._get_connection()
              try:
                  cursor = conn.cursor()

                  # Get all attempts ordered by attempt_number
                  cursor.execute(
                      """
                      SELECT
                          id, node_id, attempt_number, selected_option_id,
                          is_correct, score_percent, created_at
                      FROM quiz_attempts
                      WHERE node_id = ?
                      ORDER BY attempt_number ASC
                      """,
                      (node_id,),
                  )
                  rows = cursor.fetchall()

                  attempts = []
                  best_score = 0
                  is_mastered = False

                  for row in rows:
                      score = row["score_percent"]
                      if score > best_score:
                          best_score = score
                      if score == 100:
                          is_mastered = True

                      attempts.append({
                          "id": row["id"],
                          "node_id": row["node_id"],
                          "attempt_number": row["attempt_number"],
                          "selected_option_id": row["selected_option_id"],
                          "is_correct": bool(row["is_correct"]),
                          "score_percent": score,
                          "created_at": row["created_at"],
                      })

                  return {
                      "node_id": node_id,
                      "total_attempts": len(attempts),
                      "is_mastered": is_mastered,
                      "best_score": best_score,
                      "attempts": attempts,
                  }
              except sqlite3.Error as e:
                  logger.error(f"Error getting quiz attempts: {e}")
                  raise
              finally:
                  conn.close()
          ```
        </change>
      </changes>
      <verify>
        <check>Returns empty list if no attempts</check>
        <check>Correctly calculates best_score from all attempts</check>
        <check>is_mastered is True only if any attempt scored 100%</check>
        <check>Attempts ordered by attempt_number</check>
      </verify>
    </task>

    <task id="5" priority="medium">
      <title>Add check_mastery() helper method</title>
      <description>
        Add a simple helper method to quickly check if a node's quiz is mastered
        without fetching full attempt history.
      </description>
      <location>server/database/learning_persistence.py (after get_quiz_attempts)</location>
      <changes>
        <change type="insert">
          ```python
          def check_mastery(self, node_id: str) -> bool:
              """Check if a node's quiz has been mastered (100% score achieved).

              Args:
                  node_id: The concept node identifier

              Returns:
                  True if any attempt scored 100%, False otherwise
              """
              conn = self._get_connection()
              try:
                  cursor = conn.cursor()
                  cursor.execute(
                      """
                      SELECT 1
                      FROM quiz_attempts
                      WHERE node_id = ? AND score_percent = 100
                      LIMIT 1
                      """,
                      (node_id,),
                  )
                  return cursor.fetchone() is not None
              except sqlite3.Error as e:
                  logger.error(f"Error checking mastery: {e}")
                  raise
              finally:
                  conn.close()
          ```
        </change>
      </changes>
      <verify>
        <check>Returns False for node with no attempts</check>
        <check>Returns False for node with only failed attempts</check>
        <check>Returns True if any attempt has score_percent = 100</check>
        <check>Uses LIMIT 1 for efficiency</check>
      </verify>
    </task>
  </tasks>

  <verification>
    <run_tests>python -m unittest server.tests.test_learning_persistence</run_tests>
    <manual_checks>
      <check>quiz_attempts table created on init</check>
      <check>Can create and retrieve attempts</check>
      <check>Mastery check works correctly</check>
      <check>Pydantic models validate correctly</check>
    </manual_checks>
    <new_tests_needed>
      <test>test_create_quiz_attempt_correct_answer</test>
      <test>test_create_quiz_attempt_incorrect_answer</test>
      <test>test_create_quiz_attempt_invalid_option</test>
      <test>test_get_quiz_attempts_empty</test>
      <test>test_get_quiz_attempts_multiple</test>
      <test>test_check_mastery_not_mastered</test>
      <test>test_check_mastery_mastered</test>
    </new_tests_needed>
  </verification>

  <rollback>
    <steps>
      <step>Drop quiz_attempts table if exists</step>
      <step>Remove Pydantic models from learning.py</step>
      <step>Remove methods from LearningManager</step>
      <step>Re-run tests to confirm rollback successful</step>
    </steps>
  </rollback>
</plan>
