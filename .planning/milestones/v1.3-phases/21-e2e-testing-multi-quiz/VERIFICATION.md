# Phase 21: E2E Testing — Multi-Quiz Course Generation

**Status:** `pending`  
**Milestone:** v1.3 Human Verification & E2E Testing  
**Depends on:** Phase 19 (Orchestrator Integration — complete)  
**Audit Source:** v1.2-MILESTONE-AUDIT.md — Tech Debt Item #1

---

## Purpose

This phase addresses the human E2E testing recommended in the v1.2 audit. While all automated tests pass and code is verified, real-world human testing ensures the multi-quiz flow works correctly end-to-end with actual user interaction.

---

## Gap Source

From `v1.2-MILESTONE-AUDIT.md`:

```yaml
tech_debt:
  - phase: 19-orchestrator-integration
    items:
      - "Human E2E testing recommended: Generate course with quiz_count > 1 and complete quizzes in order"
```

---

## Test Scenarios

### Scenario 1: Generate Multi-Quiz Course

**Objective:** Verify course generation produces topics with quiz_count > 1

**Steps:**
1. Navigate to `/learn` page
2. Enter complex topic query (e.g., "Quantum Mechanics", "Machine Learning Fundamentals")
3. Click "Generate Learning Path"
4. Wait for course generation to complete

**Expected Results:**
- Course generates successfully with 5-7 topics
- At least 2-3 topics have `quiz_count > 1` (Intermediate/Advanced topics)
- Topic cards display complexity badges (Basic/Intermediate/Advanced)
- No errors in browser console or backend logs

**Verification:**
```bash
# Check backend logs for quiz_count distribution
grep "quiz_count" server/logs/orchestrator.log | tail -20

# Check database for generated quiz counts
sqlite3 server/data/agui.db "SELECT title, complexity, quiz_count FROM concept_nodes WHERE learning_session_id = '<latest_session>';"
```

---

### Scenario 2: Complete Multi-Quiz Chain Sequentially

**Objective:** Verify mastery gate and sequential enforcement work correctly

**Steps:**
1. Select a topic with quiz_count = 3 (or higher)
2. Start the first quiz
3. Pass quiz 1 (score >= 100%)
4. Click "Next Quiz" button
5. Pass quiz 2
6. Click "Next Quiz" button
7. Pass quiz 3 (final quiz)

**Expected Results:**
- "Quiz 1 of 3" progress indicator displays correctly
- After passing quiz 1, "Next Quiz" button appears
- Quiz 2 is accessible only after passing quiz 1
- After passing final quiz, topic marks as COMPLETED
- Next topic unlocks (status changes from LOCKED to VIEWING_EXPLANATION)

**Verification:**
```bash
# Check session progression in database
sqlite3 server/data/agui.db "SELECT sequence_index, title, status FROM concept_nodes WHERE learning_session_id = '<session_id>' ORDER BY sequence_index;"
```

---

### Scenario 3: Mastery Gate Enforcement

**Objective:** Verify user cannot skip quizzes or advance without passing

**Steps:**
1. Start a multi-quiz topic (quiz_count = 3)
2. Fail quiz 1 (score < 100%)
3. Attempt to navigate to next topic without retrying
4. Click "Retry Quiz" and pass
5. Attempt to skip quiz 2 by manipulating URL

**Expected Results:**
- Failed quiz shows "Retry Quiz" button (not "Next Quiz")
- Next topic remains LOCKED until all quizzes passed
- Direct URL navigation to locked topic is blocked
- Backend returns 403/400 for invalid progression attempts

**Verification:**
```bash
# Test API enforcement
curl -X POST http://localhost:8000/learning/sessions/<session_id>/nodes/<locked_node_id>/quiz \
  -H "Content-Type: application/json" \
  -d '{"answers": [...]}'

# Expected: 400 Bad Request with error message about locked status
```

---

## Success Criteria

All criteria must be met to mark this phase complete:

- [ ] Human tester successfully generates course with quiz_count > 1
- [ ] Human tester completes all quizzes in chain sequentially without errors
- [ ] Mastery gate correctly prevents topic advancement until all quizzes passed
- [ ] Sequential enforcement works: quiz N+1 inaccessible until quiz N passed
- [ ] No console errors during multi-quiz flow
- [ ] Backend logs show successful QuizSet generation and persistence

---

## Test Execution Checklist

### Pre-Test Setup
- [ ] Backend running on `http://localhost:8000`
- [ ] Frontend running on `http://localhost:5173`
- [ ] Database cleared or using test instance
- [ ] Browser DevTools open for console monitoring

### Test Execution
- [ ] Scenario 1: Generate Multi-Quiz Course — **PASS/FAIL**
- [ ] Scenario 2: Complete Multi-Quiz Chain — **PASS/FAIL**
- [ ] Scenario 3: Mastery Gate Enforcement — **PASS/FAIL**

### Post-Test Verification
- [ ] Database state verified (all statuses correct)
- [ ] No errors in backend logs
- [ ] No errors in browser console
- [ ] Screenshots captured for documentation

---

## Documentation Output

Upon completion, create:

1. **21-01-PLAN.md** — Detailed test execution plan with screenshots
2. **VERIFICATION.md** — Test results and any issues discovered
3. **GIT_NOTES.md** — Summary for git notes attachment

---

## Related Files

- **Audit Source:** `.planning/v1.2-MILESTONE-AUDIT.md`
- **Backend Logic:** `server/services/course_orchestrator.py`
- **Frontend Components:** `client/src/features/learning/`
- **API Endpoints:** `server/routers/learning.py`

---

## Notes

- This is a **human verification phase** — automated tests already pass
- Focus on real-world user experience and edge cases
- Document any UX friction points for future improvement
- If issues found, create follow-up bug-fix plans before marking complete

---

**Next Step:** Execute test scenarios and document results in `21-01-PLAN.md`
