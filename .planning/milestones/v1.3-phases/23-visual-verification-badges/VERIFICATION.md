# Phase 23: Visual Verification — Complexity & Difficulty Badges

**Status:** `pending`  
**Milestone:** v1.3 Human Verification & E2E Testing  
**Depends on:** Phase 20 (Frontend Verification — complete), Phase 21 (recommended)  
**Audit Source:** v1.2-MILESTONE-AUDIT.md — Human Verification Items

---

## Purpose

This phase addresses the visual verification recommended in the v1.2 audit. While all frontend components are implemented and automated tests pass, human visual verification ensures the UI polish meets design standards and works correctly across themes.

---

## Gap Source

From `v1.2-MILESTONE-AUDIT.md`:

```yaml
human_verification:
  - phase: 20-frontend-verification
    items:
      - "Visual verification: Complexity badge display on topic cards"
      - "Visual verification: Multi-quiz progress indicator styling"
      - "Visual verification: Difficulty gradient badges across quiz chain"
```

---

## Visual Verification Scenarios

### Scenario 1: Complexity Badge Display

**Objective:** Verify complexity badges render correctly on topic cards

**UI Component:** `ConceptCard.tsx` — Complexity badge element

**Steps:**
1. Navigate to `/learn` page
2. Generate a learning session with varied complexity topics
3. Observe topic cards for complexity badges

**Visual Checklist:**
- [ ] **Badge Visibility:** Badge clearly visible on each topic card
- [ ] **Color Coding:**
  - [ ] Basic: Green or blue (calm, foundational)
  - [ ] Intermediate: Yellow or orange (moderate challenge)
  - [ ] Advanced: Red or purple (high complexity)
- [ ] **Typography:** Text readable at all screen sizes
- [ ] **Positioning:** Badge positioned consistently (top-right or top-left)
- [ ] **Dark Mode:** Badge colors visible and appropriate in dark theme
- [ ] **Light Mode:** Badge colors visible and appropriate in light theme
- [ ] **Mobile:** Badge scales appropriately on small screens

**Design Tokens (per `conductor/product-guidelines.md`):**
```css
/* Complexity Badge Colors */
--complexity-basic: #10B981;        /* Emerald green */
--complexity-intermediate: #F59E0B; /* Amber yellow */
--complexity-advanced: #EF4444;     /* Red */

/* Or use Cyber Yellow accent for Intermediate */
--complexity-intermediate: #FFD400; /* Cyber Yellow */
```

**Screenshot Requirements:**
- Desktop view (1920x1080)
- Tablet view (768x1024)
- Mobile view (375x667)
- Dark mode variant
- Light mode variant

---

### Scenario 2: Multi-Quiz Progress Indicator

**Objective:** Verify "Quiz X of Y" progress indicator styling

**UI Component:** `QuizContainer.tsx` — Progress indicator

**Steps:**
1. Navigate to a topic with quiz_count > 1
2. Start the quiz flow
3. Observe progress indicator

**Visual Checklist:**
- [ ] **Visibility:** Progress indicator clearly visible at top of quiz card
- [ ] **Format:** Text reads "Quiz 1 of 3", "Quiz 2 of 3", etc.
- [ ] **Accent Color:** Uses Cyber Yellow (#FFD400) for current quiz number
- [ ] **Typography:** Font size appropriate (14-16px recommended)
- [ ] **Positioning:** Centered or left-aligned consistently
- [ ] **Dark Mode:** Text color visible against dark background
- [ ] **Light Mode:** Text color visible against light background
- [ ] **Mobile:** Responsive on small screens

**Example Design:**
```
┌─────────────────────────────────┐
│  Quiz 2 of 4                    │  ← Cyber Yellow "2"
│  ▓▓▓▓▓▓▓▓░░░░░░░░░░░░  50%     │  ← Progress bar
└─────────────────────────────────┘
```

**Screenshot Requirements:**
- Quiz 1 of N (start)
- Quiz 2 of N (middle)
- Quiz N of N (final)
- Dark mode variant
- Light mode variant

---

### Scenario 3: Difficulty Gradient Badges

**Objective:** Verify difficulty labels display correctly on quiz cards

**UI Component:** `QuizCard.tsx` — Difficulty badge

**Steps:**
1. Navigate to a multi-quiz topic
2. Observe difficulty labels on each quiz

**Visual Checklist:**
- [ ] **Visibility:** Difficulty badge visible on each quiz card
- [ ] **Color Coding:**
  - [ ] Easy: Green (#10B981)
  - [ ] Medium: Yellow/Orange (#F59E0B or #FFD400)
  - [ ] Hard: Red (#EF4444)
- [ ] **Text Format:** Capitalized ("Easy", "Medium", "Hard")
- [ ] **Positioning:** Consistent placement (top-left or alongside question)
- [ ] **Dark Mode:** Colors visible and appropriate
- [ ] **Light Mode:** Colors visible and appropriate
- [ ] **Mobile:** Scales appropriately

**Design Tokens:**
```css
/* Difficulty Badge Colors */
--difficulty-easy: #10B981;       /* Green */
--difficulty-medium: #FFD400;     /* Cyber Yellow */
--difficulty-hard: #EF4444;       /* Red */
```

**Screenshot Requirements:**
- Easy quiz badge
- Medium quiz badge
- Hard quiz badge
- All three badges in single view (for comparison)
- Dark mode variant
- Light mode variant

---

### Scenario 4: Visual Hierarchy & Distinction

**Objective:** Verify complexity badge, progress indicator, and difficulty labels are visually distinct

**Steps:**
1. Navigate to a multi-quiz topic
2. Observe all badges simultaneously

**Visual Checklist:**
- [ ] **Distinction:** User can easily distinguish complexity vs. difficulty
- [ ] **Hierarchy:** Most important info most prominent
- [ ] **Consistency:** Similar elements use similar styles
- [ ] **Clutter:** UI doesn't feel overcrowded with badges
- [ ] **Spacing:** Adequate whitespace around badges
- [ ] **Color Harmony:** Colors work together without clashing

**Hierarchy Example:**
```
┌──────────────────────────────────────┐
│ [Complexity: Advanced]               │  ← Topic card
│                                      │
│ Topic Title: Newton's Laws           │
│                                      │
│ ┌────────────────────────────────┐   │
│ │ [Difficulty: Easy] Quiz 1 of 3 │   │  ← Quiz card
│ │ Question text...               │   │
│ └────────────────────────────────┘   │
└──────────────────────────────────────┘
```

---

## Success Criteria

All criteria must be met to mark this phase complete:

- [ ] Complexity badges display correctly on all topic cards
- [ ] Complexity badge colors appropriate in light and dark modes
- [ ] "Quiz X of Y" progress indicator styled with Cyber Yellow accent
- [ ] Difficulty labels visible and color-coded on all quizzes
- [ ] Visual hierarchy clear: badges don't overwhelm content
- [ ] Mobile responsive: badges scale appropriately
- [ ] No visual regressions in existing UI elements
- [ ] Screenshots captured for all scenarios

---

## Test Execution Checklist

### Pre-Test Setup
- [ ] Backend running on `http://localhost:8000`
- [ ] Frontend running on `http://localhost:5173`
- [ ] Learning session generated with varied complexity topics
- [ ] Browser DevTools open for inspecting elements

### Visual Verification
- [ ] Scenario 1: Complexity Badge Display — **PASS/FAIL**
- [ ] Scenario 2: Progress Indicator — **PASS/FAIL**
- [ ] Scenario 3: Difficulty Gradient Badges — **PASS/FAIL**
- [ ] Scenario 4: Visual Hierarchy — **PASS/FAIL**

### Theme Testing
- [ ] Light mode: All badges visible and appropriate
- [ ] Dark mode: All badges visible and appropriate
- [ ] Theme toggle: Badges update correctly on theme switch

### Responsive Testing
- [ ] Desktop (1920x1080): Badges properly positioned
- [ ] Tablet (768x1024): Badges scale appropriately
- [ ] Mobile (375x667): Badges readable and not cut off

---

## Styling Adjustments (If Needed)

If visual issues are found, create CSS fixes in:

**Location:** `client/src/features/learning/ConceptCard.tsx` (or relevant component)

**Example Fix:**
```tsx
// Complexity badge with proper color coding
<div className={cn(
  "px-2 py-1 rounded text-xs font-semibold",
  node.complexity === "Basic" && "bg-emerald-500 text-white",
  node.complexity === "Intermediate" && "bg-yellow-400 text-black",
  node.complexity === "Advanced" && "bg-red-500 text-white",
)}>
  {node.complexity}
</div>
```

---

## Documentation Output

Upon completion, create:

1. **23-01-PLAN.md** — Detailed visual verification plan with annotated screenshots
2. **VERIFICATION.md** — This file with completed checklists and results
3. **GIT_NOTES.md** — Summary for git notes attachment
4. **Screenshots/** — Directory with captured visual verification images

---

## Related Files

- **Audit Source:** `.planning/v1.2-MILESTONE-AUDIT.md`
- **Frontend Components:**
  - `client/src/features/learning/ConceptCard.tsx`
  - `client/src/features/learning/QuizContainer.tsx`
  - `client/src/features/learning/QuizCard.tsx`
- **Design System:** `conductor/product-guidelines.md`
- **Styling:** Tailwind CSS 4.x

---

## Notes

- This is a **visual verification phase** — functionality already works
- Focus on aesthetics, color harmony, and visual clarity
- Use Cyber Yellow (#FFD400) consistently for primary accents
- Document any CSS adjustments needed
- If major issues found, create follow-up fix plans before marking complete

---

**Next Step:** Execute visual verification scenarios and document results in `23-01-PLAN.md`
