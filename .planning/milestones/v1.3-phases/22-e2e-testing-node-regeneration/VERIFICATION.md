# Phase 22: E2E Testing — Node Regeneration

**Status:** `pending`  
**Milestone:** v1.3 Human Verification & E2E Testing  
**Depends on:** Phase 19 (Orchestrator Integration — complete), Phase 21 (recommended)  
**Audit Source:** v1.2-MILESTONE-AUDIT.md — Tech Debt Item #2

---

## Purpose

This phase addresses the human E2E testing for node regeneration with multi-quiz nodes. While the `regenerate_node()` method is implemented and tested with unit tests, human verification ensures the full flow works correctly with real QuizSet regeneration.

---

## Gap Source

From `v1.2-MILESTONE-AUDIT.md`:

```yaml
tech_debt:
  - phase: 19-orchestrator-integration
    items:
      - "Human E2E testing recommended: Regenerate multi-quiz node and verify QuizSet regeneration"
```

---

## Test Scenarios

### Scenario 1: Trigger Multi-Quiz Node Regeneration

**Objective:** Verify regeneration works for nodes with quiz_count > 1

**Prerequisites:**
- Existing learning session with at least one topic having quiz_count > 1
- Node must be in ERROR status (or manually set for testing)

**Steps:**
1. Generate a learning session with complex topics
2. Simulate a node error (or use existing error state):
   - Option A: Manually set node status to ERROR in database
   - Option B: Wait for natural generation error (rare)
3. Navigate to the errored topic
4. Click "Regenerate Content" button

**Expected Results:**
- Regeneration request sent to backend
- Loading state displays during regeneration
- New content generated successfully
- Full QuizSet regenerated (matching original quiz_count)

**Verification:**
```bash
# Check node status before regeneration
sqlite3 server/data/agui.db "SELECT id, status, error_message FROM concept_nodes WHERE id = '<node_id>';"

# Check logs for regeneration process
grep "regenerate_node" server/logs/orchestrator.log | tail -10
```

---

### Scenario 2: Verify QuizSet Regeneration

**Objective:** Confirm regenerated node contains complete QuizSet with correct difficulty gradient

**Steps:**
1. Complete regeneration from Scenario 1
2. Start the regenerated topic's quiz
3. Observe quiz count and difficulty labels

**Expected Results:**
- Quiz count matches original quiz_count (e.g., 3 quizzes regenerated, not 1)
- Difficulty gradient preserved: Easy → Medium → Hard
- All quizzes have valid options with explanations
- Quiz IDs are new (different from pre-regeneration)

**Verification:**
```bash
# Query regenerated QuizSet
sqlite3 server/data/agui.db "
  SELECT json_extract(quiz, '$.quizzes') as quizzes,
         json_extract(quiz, '$.current_index') as current_index
  FROM concept_nodes
  WHERE id = '<node_id>';
"

# Check quiz count and difficulty
python -c "
import sqlite3, json
conn = sqlite3.connect('server/data/agui.db')
cursor = conn.cursor()
cursor.execute('SELECT quiz FROM concept_nodes WHERE id = ?', ('<node_id>',))
quiz_data = cursor.fetchone()[0]
if quiz_data:
    quizzes = json.loads(quiz_data)['quizzes']
    print(f'Quiz count: {len(quizzes)}')
    for i, q in enumerate(quizzes):
        print(f'  Quiz {i+1}: {q[\"difficulty\"]}')
"
```

---

### Scenario 3: Node Status Transition

**Objective:** Verify node status correctly transitions after regeneration

**Steps:**
1. Start with node in ERROR status
2. Complete regeneration
3. Check node status in database and UI

**Expected Results:**
- First topic (index 0): ERROR → VIEWING_EXPLANATION
- Other topics: ERROR → LOCKED (if previous topic not completed)
- Other topics: ERROR → VIEWING_EXPLANATION (if previous topic completed)
- UI reflects new status immediately

**Verification:**
```bash
# Check status transition
sqlite3 server/data/agui.db "
  SELECT sequence_index, title, status, updated_at
  FROM concept_nodes
  WHERE learning_session_id = '<session_id>'
  ORDER BY sequence_index;
"
```

---

### Scenario 4: Regeneration with Adjacent Node Context

**Objective:** Verify regeneration uses correct prev_summary and next_summary

**Steps:**
1. Regenerate a middle topic (not first or last)
2. Review generated content for contextual references

**Expected Results:**
- Content references previous topic (bridge from prior knowledge)
- Content foreshadows next topic (create anticipation)
- Narrative flow maintained across learning path

**Manual Verification:**
- Read regenerated content
- Confirm mentions of adjacent topics exist
- Verify context makes pedagogical sense

---

## Success Criteria

All criteria must be met to mark this phase complete:

- [ ] Human tester successfully triggers regeneration on multi-quiz node
- [ ] Regenerated node contains full QuizSet matching original quiz_count
- [ ] Quiz difficulty gradient preserved in regenerated QuizSet
- [ ] Node status correctly transitions from ERROR to appropriate state
- [ ] Adjacent node context properly injected during regeneration
- [ ] No console errors during regeneration flow
- [ ] Backend logs show successful QuizSet regeneration

---

## Test Execution Checklist

### Pre-Test Setup
- [ ] Backend running on `http://localhost:8000`
- [ ] Frontend running on `http://localhost:5173`
- [ ] Existing learning session with multi-quiz topics
- [ ] Database backup created (regeneration modifies data)

### Test Execution
- [ ] Scenario 1: Trigger Multi-Quiz Regeneration — **PASS/FAIL**
- [ ] Scenario 2: Verify QuizSet Regeneration — **PASS/FAIL**
- [ ] Scenario 3: Node Status Transition — **PASS/FAIL**
- [ ] Scenario 4: Adjacent Node Context — **PASS/FAIL**

### Post-Test Verification
- [ ] QuizSet count verified (matches original quiz_count)
- [ ] Difficulty gradient verified (Easy → Medium → Hard)
- [ ] Node status transition verified
- [ ] No errors in backend logs
- [ ] No errors in browser console
- [ ] Screenshots captured for documentation

---

## Edge Cases to Test

### Edge Case 1: Regenerate First Topic
- No previous topic context
- Should use "Start" as prev_summary
- Status should transition to VIEWING_EXPLANATION

### Edge Case 2: Regenerate Last Topic
- No next topic context
- Should use "End" as next_summary
- Should synthesize learning journey

### Edge Case 3: Regenerate Completed Topic
- Previous topics all COMPLETED
- Should transition to VIEWING_EXPLANATION (not LOCKED)

### Edge Case 4: Regenerate with quiz_count = 1
- Single quiz should regenerate (not QuizSet)
- Difficulty should be "medium" (default for single quiz)

---

## Documentation Output

Upon completion, create:

1. **22-01-PLAN.md** — Detailed test execution plan with screenshots
2. **VERIFICATION.md** — Test results and any issues discovered
3. **GIT_NOTES.md** — Summary for git notes attachment

---

## Related Files

- **Audit Source:** `.planning/v1.2-MILESTONE-AUDIT.md`
- **Backend Logic:** `server/services/course_orchestrator.py` (regenerate_node method)
- **Frontend Components:** `client/src/features/learning/ConceptCard.tsx`
- **API Endpoints:** `server/routers/learning.py` (`POST /learning/sessions/{id}/nodes/{node_id}/regenerate`)

---

## Notes

- This is a **human verification phase** — automated tests already pass
- Regeneration requires node to have `retry_available=True`
- QuizSet regeneration uses same difficulty gradient logic as initial generation
- If issues found, create follow-up bug-fix plans before marking complete

---

**Next Step:** Execute test scenarios and document results in `22-01-PLAN.md`
