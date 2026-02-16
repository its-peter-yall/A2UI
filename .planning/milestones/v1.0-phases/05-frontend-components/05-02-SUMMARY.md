# Summary 05-02: Concept Card Component

## Objectives
- Create a visual card component for concept nodes.
- Handle different states: LOCKED, VIEWING_EXPLANATION, IN_QUIZ, SHOWING_FEEDBACK, COMPLETED, ERROR.
- Implement Markdown rendering for explanations.
- Provide a skeleton loader for generating states.

## Components Created/Modified

### ConceptCard.tsx
- Uses `<article>` for semantic structure.
- State-based rendering logic:
  - `LOCKED`: Shows locked message.
  - `VIEWING_EXPLANATION`: Renders markdown content and "Proceed to Quiz" button.
  - `IN_QUIZ`: Displays quiz question and options with radio buttons.
  - `SHOWING_FEEDBACK`: Placeholder for quiz feedback (Plan 05-03).
  - `COMPLETED`: Shows success message and collapsible review section.
  - `ERROR`: Shows error message and retry button.
- Props: `node`, `isActive`, `onProceedToQuiz`, `onQuizSubmit`, `onRetryQuiz`, `onRegenerate`.

### MarkdownRenderer.tsx
- Uses `react-markdown` for rendering.
- Applied Tailwind Typography (`prose`) classes with custom overrides for consistent styling.

### SkeletonCard.tsx
- Provides animated placeholders using `animate-pulse`.
- Includes `aria-busy="true"` and visually hidden "Loading content..." text for accessibility.
- `SkeletonPath` helper for rendering multiple skeletons.

### index.ts
- Exported new components.

## Testing
- `ConceptCard.test.tsx` covers:
  - Rendering of all 6 status states.
  - Callback triggering for "Proceed to Quiz", "Submit Answer", and "Retry Generation".
  - Proper content visibility based on state.

## Verification Results
- All tests passed.
- Build checked (clean of new errors).

## Commit
- feat(05-05-02): Concept Card Component
