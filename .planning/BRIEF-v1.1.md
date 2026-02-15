# Project Brief: Course Persistence, Progress Dashboard & Revision System (v1.1)

## Vision Statement

Extend AgUI's retrieval-based learning system with **persistent course management**
and **revision capabilities**, transforming it from a single-session learning tool into
a full **personal learning dashboard** where users can track, pause, resume, and
revisit their learning journeys over time.

## Core Problems Solved

### Problem 1: Courses Are Ephemeral
Currently, when a user generates a course and navigates away, they lose access
to it unless they manually remember the session URL. There is no way to:
- See a list of past courses
- Resume a partially completed course
- Track progress across multiple courses

### Problem 2: No Revision or Re-attendance
Once a course is completed (100%), the content is locked in a terminal state.
Users cannot:
- Re-read explanations for revision
- Re-take quizzes to test knowledge retention
- Track how their understanding improves over time

## Solution Architecture

### Feature 1: Course Persistence & Progress Dashboard

**User Flow:**
1. User generates Course A → starts learning → reaches 60% completion
2. User navigates to home page → sees Course A at "60% completed"
3. User generates Course B → completes it to 100%
4. User returns to home page → sees:
   - Course B: "100% Completed" (most recent)
   - Course A: "60% — Resume" (with resume button)
5. User clicks "Resume" on Course A → returns to where they left off

**Technical Approach:**
- Extend `learning_sessions` table with status tracking and progress metadata
- Add `GET /learning/sessions` endpoint with filtering and pagination
- Build `CourseCard` component showing progress bar and status badge
- Integrate dashboard into `LearningHome` with recent courses section
- Track last-active node for seamless resume experience

### Feature 2: Course Revision & Quiz Re-attendance

**User Flow (Full Review):**
1. User sees completed course → clicks "Revise Course"
2. System creates a revision session linked to the original
3. User walks through all explanations and quizzes again
4. Revision progress tracked separately (original 100% unaffected)
5. After revision, user sees comparison: "Original: 100%, Revision: 85%"

**User Flow (Quiz Only):**
1. User sees completed course → clicks "Practice Quizzes"
2. System presents only the quiz cards (no explanations)
3. User answers all quizzes → sees score
4. Can retry incorrect quizzes immediately
5. Performance tracked for spaced repetition scheduling

**Technical Approach:**
- Create `revision_sessions` table for independent revision tracking
- Add revision-specific API endpoints (create, progress, complete)
- Build revision mode UI with toggle between full review and quiz-only
- Extend `quiz_attempts` with `revision_session_id` for separate tracking
- Optional: SM-2 algorithm for suggesting optimal review timing

## Success Criteria

1. User can see all their courses on the home page with progress percentages
2. User can resume any in-progress course from the exact node they left off
3. User can start a new course without losing progress on existing courses
4. User can revise a completed course in full-review mode
5. User can practice quizzes from a completed course in quiz-only mode
6. Revision attempts are tracked independently from original completion
7. All data persists across browser sessions (server-side storage)
8. Home page loads in <2 seconds with up to 50 courses
9. Progress updates are reflected in real-time (optimistic UI)

## Constraints

- Must integrate with existing FastAPI/React/SQLite codebase
- Extend existing tables, don't replace them
- Original course completion data must never be corrupted by revision
- Maintain backward compatibility with existing session URLs
- Follow existing TDD workflow and quality gates

## Out of Scope (v1.1)

- User authentication (user_id is still optional/anonymous)
- Cross-device sync (SQLite is local)
- Automated spaced repetition notifications (just suggested timing)
- Social features (sharing courses, leaderboards)
- Course editing (modifying generated content)

## Reference Documents

- `.planning/BRIEF.md` — Original v1.0 brief
- `.planning/ROADMAP.md` — Original v1.0 roadmap (phases 01-08)
- `conductor/product.md` — Product vision
- `conductor/product-guidelines.md` — UI/UX standards (Cyber Yellow #FFD400)
- `conductor/workflow.md` — TDD workflow and quality gates
