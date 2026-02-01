# Known Issues - Retrieval-Based Learning System

This document tracked issues identified during codebase scrutiny and design review. **All issues have been resolved and incorporated into the roadmap.**

---

## Issue #1: No Quiz Retry with Mastery Requirement

**Severity:** Medium  
**Status:** ✅ **RESOLVED - Implemented in Phase 03a & Phase 06**

**Description:**
The system needs a mastery-based quiz flow where users must achieve **full score (100%)** to proceed to the next topic.

**Resolution:**
- **Phase 03a**: Added `quiz_attempts` table, `check_mastery()` logic, new `NodeStatus` states
- **Phase 06**: Implements the retry loop UI and mastery gate

**Implemented Flow:**
```
Take Quiz → If score < 100%:
    ↓
Show correct answers + explanations
    ↓
User can retry quiz
    ↓
Repeat until 100% achieved
    ↓
Only then: Status = COMPLETED → Unlock next topic
```

---

## Issue #2: Quiz Integrity Not Enforced

**Severity:** Medium  
**Status:** ✅ **RESOLVED - Implemented in Phase 03a & Phase 06**

**Description:**
The system allowed users to "cheat" on quizzes by viewing explanation content while taking the quiz.

**Resolution:**
- **Phase 03a**: Added `VIEWING_EXPLANATION` and `IN_QUIZ` states to `NodeStatus` enum
- **Phase 06**: UI enforces explanation hidden during `IN_QUIZ` state

**New States:**
```python
class NodeStatus(str, Enum):
    LOCKED = "locked"
    VIEWING_EXPLANATION = "viewing_exp"  # Added
    IN_QUIZ = "in_quiz"                  # Added
    SHOWING_FEEDBACK = "feedback"        # Added
    COMPLETED = "completed"
    ERROR = "error"                      # Added
```

---

## Issue #3: User Flow Mismatch - Sequential View Required

**Severity:** Medium  
**Status:** ✅ **RESOLVED - Decision: Option A (Sequential Flow)**

**Decision:**
Implement the **sequential flow** where explanation view and quiz view are separate UI states.

**Approved Flow:**
```
┌─────────────────────────────────────────────────────────┐
│ STEP 1: VIEW_EXPLANATION                                │
│ [Full explanation content displayed]                    │
│ [✓ I understand, proceed to quiz]                       │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ STEP 2: IN_QUIZ (Explanation hidden)                    │
│ [NO explanation visible - pure retrieval practice]      │
│ • Question and options                                  │
│ [Submit Answer]                                         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ STEP 3: SHOWING_FEEDBACK                                │
│ Result: X/Y correct                                     │
│ ✓ Correct options with explanations                     │
│ ✗ Incorrect options with explanations                   │
│ [Retry Quiz] [Next Topic →] (if 100%)                   │
└─────────────────────────────────────────────────────────┘
```

**Implementation:**
- **Phase 03a**: Backend schema and state machine
- **Phase 05**: UI components for each state
- **Phase 06**: State transitions and retry logic

---

## Issue #4: Node Status State Machine Too Simple

**Severity:** Low  
**Status:** ✅ **RESOLVED - Implemented in Phase 03a**

**Description:**
The original `NodeStatus` enum only supported 3 states with linear progression.

**Resolution:**
Extended to 6 granular states for the sequential flow:
- `LOCKED` → `VIEWING_EXPLANATION` → `IN_QUIZ` → `SHOWING_FEEDBACK` → `COMPLETED`
- Plus `ERROR` state for failed generations

---

## Summary

All identified issues have been addressed in the updated roadmap:

| Issue | Roadmap Phase | Status |
|-------|--------------|--------|
| #1: Quiz retry with mastery | Phase 03a (schema), Phase 06 (UI) | ✅ Resolved |
| #2: Quiz integrity | Phase 03a (IN_QUIZ state), Phase 06 (UI enforcement) | ✅ Resolved |
| #3: Sequential flow | Phase 03a-06 (full implementation) | ✅ Resolved |
| #4: Granular states | Phase 03a (extended NodeStatus) | ✅ Resolved |

---

## Archive Note

This document serves as a **design record** for the decisions made. For implementation details, see:
- Roadmap: `.planning/ROADMAP.md`
- Phase 03a plans: `.planning/phases/03a-schema-fixes/`
- Phase 04-06 plans: `.planning/phases/`
