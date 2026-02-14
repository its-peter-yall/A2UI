<objective>
Create a comprehensive implementation plan for converting the vertical learning path list into a horizontal slide-like carousel UI.

Purpose: Improve user focus by showing one concept at a time with clear navigation.
Input: Current codebase (LearningPathContainer.tsx, ConceptCard.tsx) and web research on best practices.
Output: learning-carousel-plan.md with actionable phases/steps.
</objective>

<context>
Current Implementation:
- `LearningPathContainer.tsx`: Orchestrates the list of `ConceptCard` components.
- `ConceptCard.tsx`: The individual card component.
- Stack: React, Framer Motion, Tailwind CSS.

Goal:
- Replace vertical list with horizontal carousel.
- "Previous" and "Next" navigation buttons.
- Progress bar clicks should jump to slides.
- Keyboard navigation (Arrow keys).
- Animated transitions (slide in/out).
</context>

<planning_requirements>
1. **Research First**: 
   - Perform web searches for "React Framer Motion carousel accessible", "React carousel keyboard navigation best practices".
   - Incorporate findings into the plan (especially regarding accessibility and focus management).
   
2. **Architecture**:
   - detailed state management (current slide, direction).
   - Component structure (should we create a dedicated `Carousel` wrapper?).
   - Animation strategy (variants for enter/exit).

3. **Phases**:
   - Break down into small, verifiable steps.
   - Phase 1: Structure & State (No animation initially, just logic).
   - Phase 2: Animation & Polish (Framer Motion integration).
   - Phase 3: Accessibility & Cleanup (Keyboard nav, focus, progress bar sync).
</planning_requirements>

<output_structure>
Save to: `.prompts/001-learning-carousel-plan/learning-carousel-plan.md`

Structure the plan using this XML format:

```xml
<plan>
  <summary>
    {One paragraph overview of the approach, highlighting key library choices and UX decisions}
  </summary>

  <research_findings>
    <!-- Summarize key takeaways from the web search here -->
    <finding topic="Accessibility">{Best practice for keyboard nav}</finding>
    <finding topic="Animation">{Recommended motion patterns}</finding>
  </research_findings>

  <phases>
    <phase number="1" name="{phase-name}">
      <objective>{What this phase accomplishes}</objective>
      <tasks>
        <task priority="high">{Specific actionable task}</task>
        <task priority="medium">{Another task}</task>
      </tasks>
      <deliverables>
        <deliverable>{What's produced}</deliverable>
      </deliverables>
    </phase>
    <!-- Additional phases -->
  </phases>

  <metadata>
    <confidence level="{high|medium|low}">
      {Why this confidence level}
    </confidence>
    <dependencies>
      {External dependencies needed (e.g. framer-motion version)}
    </dependencies>
    <open_questions>
      {Uncertainties that may affect execution}
    </open_questions>
    <assumptions>
      {What was assumed in creating this plan}
    </assumptions>
  </metadata>
</plan>
```
</output_structure>

<summary_requirements>
Create `.prompts/001-learning-carousel-plan/SUMMARY.md`

Load template: [summary-template.md](summary-template.md)

Emphasize the accessibility strategy and animation approach in the summary.
</summary_requirements>

<success_criteria>
- Plan incorporates web research findings.
- Phases allow for incremental testing (e.g., verifying logic before adding complex animations).
- Accessibility (keyboard nav, focus) is a core part of the plan, not an afterthought.
- Output XML is valid and complete.
</success_criteria>
