# Known Issues - Retrieval-Based Learning System

This document tracks issues identified during codebase scrutiny and design review.

## Issue #1: No Quiz Retry with Mastery Requirement

**Severity:** Medium
**Status:** Design Gap

**Description:**
The system needs a mastery-based quiz flow where users must achieve **full score (100%)** to proceed to the next topic. This is not currently implemented.

**Required Flow:**
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

**Key Requirements:**
1. **Mandatory Full Score**: User cannot proceed until 100% correct
2. **Show Explanations After Failure**: Display which options were wrong and why
3. **Allow Immediate Retry**: User can retake same quiz right away
4. **Lock Progression**: Next topic stays LOCKED until current quiz is mastered

**Missing:**
- `quiz_attempts` table for tracking multiple attempts
- Score tracking per attempt (to detect < 100%)
- Logic to keep node UNLOCKED (not COMPLETED) until full score
- API endpoint for submitting retry attempts
- Logic to prevent advancing until mastery achieved

**Location:**
- Schema: `server/schemas/learning.py`
- Persistence: `server/database/learning_persistence.py`
- Router: Quiz submission endpoint needs retry logic

**Impact:**
- Users might miss key concepts and proceed anyway
- No enforcement of mastery before progression
- Undermines the learning effectiveness

---

## Issue #2: Quiz Integrity Not Enforced

**Severity:** Medium
**Status:** Design Gap

**Description:**
The system allows users to "cheat" on quizzes by:
1. Viewing the explanation content while taking the quiz
2. Navigating to previous cards to refresh memory
3. Seeing correct answers in the result feedback, then retaking (if retry existed)

**Current Behavior:**
- Both `content_markdown` and `quiz` are available on the same node
- No "quiz mode" that hides explanation
- Navigation not locked during quiz
- Status remains `UNLOCKED` during quiz (no `IN_QUIZ` state)

**Required States:**
```python
# Missing states:
IN_PROGRESS = "in_progress"    # Reading content
IN_QUIZ = "in_quiz"            # Taking quiz (locks content)
QUIZ_PEEKED = "quiz_peeked"    # Viewed content before completing quiz
```

**Location:**
- Schema: `server/schemas/learning.py` (NodeStatus enum)
- Persistence: `server/database/learning_persistence.py`

**Impact:**
- Undermines retrieval-based learning principles
- Active recall not properly tested
- Users may develop poor study habits

**Proposed Solutions:**
1. **Separate Views**: Explanation mode vs Quiz mode (no switching without submitting)
2. **Track Peeks**: Log if user viewed content before quiz submission
3. **Blind Quiz**: Show only question, force answer before revealing result
4. **Time Limit**: Enforce quick answers to prevent research

---

## Issue #3: User Flow Mismatch - Sequential View Required

**Severity:** Medium
**Status:** ✅ **DECISION MADE - Option A (Sequential Flow)**

**Decision:**
Implement the **sequential flow** where explanation view and quiz view are separate UI states.

**Required Flow:**
```
┌─────────────────────────────────────────────────────────┐
│ STEP 1: VIEW_EXPLANATION                                │
│ Newton's First Law - Inertia                            │
│ [Full explanation content displayed]                    │
│                                                         │
│ [✓ I understand, proceed to quiz]                       │
└─────────────────────────────────────────────────────────┘
                          ↓ Click
┌─────────────────────────────────────────────────────────┐
│ STEP 2: IN_QUIZ (Explanation hidden)                    │
│ [NO explanation visible - pure retrieval practice]      │
│                                                         │
│ Question: What is the property called when an object    │
│           resists changes to its motion?                │
│                                                         │
│ ○ Momentum                                              │
│ ○ Inertia                                               │
│ ○ Force                                                 │
│ ○ Acceleration                                          │
│                                                         │
│ [Submit Answer]                                         │
└─────────────────────────────────────────────────────────┘
                          ↓ Submit
┌─────────────────────────────────────────────────────────┐
│ STEP 3: SHOWING_FEEDBACK                                │
│ Result: 1/1 correct (100%)                              │
│                                                         │
│ ✓ Inertia - Correct!                                    │
│   Inertia is the resistance of any physical object      │
│   to any change in its velocity.                        │
│                                                         │
│ ✗ Momentum - Incorrect                                  │
│   Momentum is mass × velocity, not resistance to change │
│                                                         │
│ [Retry Quiz] [Next Topic →]                             │
└─────────────────────────────────────────────────────────┘
                          ↓ If 100% → Next topic unlocks
┌─────────────────────────────────────────────────────────┐
│ STEP 4: Next topic's VIEW_EXPLANATION                   │
│ Newton's Second Law                                     │
│ [New explanation displayed]                             │
└─────────────────────────────────────────────────────────┘
```

**Key Requirements:**
1. **Distinct UI States**: Explanation view and quiz view are completely separate screens/states
2. **Explanation Hidden During Quiz**: No way to peek at content while answering
3. **Progressive Disclosure**: Must click "I understand" to enter quiz mode
4. **Feedback Shows Explanations**: After submit, show why each option was right/wrong
5. **Retry Loop**: If not 100%, can retry same quiz (still no explanation visible)
6. **Mastery Gate**: Only proceed to next topic after 100% score

**Required Node States:**
```python
class NodeStatus(str, Enum):
    LOCKED = "locked"                    # Can't access yet
    VIEWING_EXPLANATION = "viewing_exp"  # Reading content, quiz hidden
    IN_QUIZ = "in_quiz"                  # Taking quiz, explanation hidden
    SHOWING_FEEDBACK = "feedback"        # Showing results, explanations visible
    COMPLETED = "completed"              # 100% achieved, can review
```

**Implementation Notes:**
- This replaces the combined card concept
- Each node has 3 distinct views: Explanation → Quiz → Feedback
- Backend tracks which view user is in
- Prevents cheating by design (no explanation access during quiz)
- Supports mastery-based progression (Issue #1)

**Files to Modify:**
- Schema: `server/schemas/learning.py` - Add new NodeStatus values
- Persistence: `server/database/learning_persistence.py` - Update state transitions
- Frontend: New UI components for each state

---

## Summary of Implementation Status

| Feature | Status | Priority |
|---------|--------|----------|
| GeneratorAgent | ✅ Implemented | Done |
| QuizzerAgent | ✅ Implemented | Done |
| Quiz retry | Not designed | Medium |
| Quiz integrity | Not designed | Medium |
| Granular states | Not designed | Low |
| Flow clarification | **Needs Decision** | Medium |

## Next Steps

1. **Clarify Flow Design**: Choose between sequential view or combined card with quiz mode
2. **Design Quiz System**: Based on flow decision, implement attempt tracking and integrity controls
3. **SRS Implementation**: Planned for future phase
4. **SkeletonCard**: Planned for Phase 03 orchestration
