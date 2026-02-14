<plan>
  <summary>
    We will convert the current vertical list of learning nodes into a horizontal, slide-based carousel to improve user focus and engagement. The implementation will use **Framer Motion** for smooth, direction-aware transitions (sliding in from right/left based on navigation). Key UX features include "Previous/Next" buttons, keyboard navigation (Arrow keys), and integration with the existing top-bar progress indicator. Accessibility is a priority, ensuring proper focus management and ARIA roles.
  </summary>

  <research_findings>
    <finding topic="Accessibility">
      Crucial to support keyboard navigation (Arrow keys). The container should use `role="region"` and `aria-roledescription="carousel"`. Focus management is key: when changing slides, focus should not get lost. Respect `prefers-reduced-motion`.
    </finding>
    <finding topic="Animation">
      Use Framer Motion's `custom` prop to pass "direction" (+1 for next, -1 for prev) to variants. This allows the 'enter' animation to come from the correct side. `AnimatePresence` with `mode="wait"` or `initial={false}` is best for managing the exit/enter lifecycle.
    </finding>
  </research_findings>

  <phases>
    <phase number="1" name="State & Structure">
      <objective>Establish the carousel logic and basic layout without complex animations.</objective>
      <tasks>
        <task priority="high">Refactor `LearningPathContainer` to track `currentSlideIndex` and `direction`.</task>
        <task priority="high">Replace the `.map` rendering list with a single `ConceptCard` render based on the active index.</task>
        <task priority="high">Implement `goToNext` and `goToPrev` functions with boundary checks.</task>
        <task priority="medium">Update `ProgressBar` click handler to set the slide index instead of scrolling.</task>
      </tasks>
      <deliverables>
        <deliverable>Functional "click-through" carousel (instant transitions).</deliverable>
      </deliverables>
    </phase>

    <phase number="2" name="Motion & Animation">
      <objective>Add smooth, direction-aware sliding transitions.</objective>
      <tasks>
        <task priority="high">Define Framer Motion `variants` for Enter, Center, and Exit states.</task>
        <task priority="high">Wrap the active slide in `<AnimatePresence custom={direction}>` and `<motion.div>`.</task>
        <task priority="medium">Use the `custom` prop to dynamicallly set `x` values (e.g., +100% or -100%) based on direction.</task>
        <task priority="medium">Ensure `initial={false}` on first mount to avoid jarring entry animation.</task>
      </tasks>
      <deliverables>
        <deliverable>Visually polished carousel with sliding animations.</deliverable>
      </deliverables>
    </phase>

    <phase number="3" name="Refinement & Accessibility">
      <objective>Ensure the component is robust, accessible, and integrated with the wider app.</objective>
      <tasks>
        <task priority="high">Add `keydown` event listener for ArrowLeft/ArrowRight navigation.</task>
        <task priority="medium">Add "Previous" and "Next" buttons below the card with proper disabled states.</task>
        <task priority="medium">Auto-advance slide index when a topic is completed (via `onContinueToNext` callback).</task>
        <task priority="low">Verify `prefers-reduced-motion` behavior (disable slide effect).</task>
      </tasks>
      <deliverables>
        <deliverable>Production-ready, accessible learning carousel.</deliverable>
      </deliverables>
    </phase>
  </phases>

  <metadata>
    <confidence level="high">
      Standard pattern for React apps. Existing dependencies (Framer Motion) are sufficient.
    </confidence>
    <dependencies>
      framer-motion, lucide-react (for icons)
    </dependencies>
    <open_questions>
      None.
    </open_questions>
    <assumptions>
      The `ConceptCard` component can handle being unmounted/remounted without losing internal temporary state (like selected quiz option), or we accept that state clears on slide change (which is actually desirable).
    </assumptions>
  </metadata>
</plan>
