# Product Guidelines

## 1. Visual Identity & Aesthetic
- **Inherited Design:** `A2UI` strictly follows the design language of `AURA-CHAT`.
- **Primary Colors:**
    - **Cyber Yellow (`#FFD400`):** Used for primary actions, accents, and brand elements.
    - **Dark Backgrounds:** Deep grays and blacks for the main UI to reduce eye strain during long research sessions.
- **Typography:**
    - **Inter:** The primary sans-serif font for UI elements and prose.
    - **JetBrains Mono:** Used for code blocks and technical identifiers.
- **Components:**
    - **Glassmorphism:** Light usage of blurred backgrounds and subtle borders for cards and panels.
    - **Rounded Corners:** Consistent 8px to 12px rounding for UI elements (buttons, inputs, bubbles).

## 2. User Experience (UX) Principles
- **Minimalism:** Remove any UI element that does not contribute directly to chat or session management.
- **Persistence:** Ensure that session switching is instantaneous and that draft content is preserved where possible.
- **Clarity:** Use distinct visual cues for different model states (e.g., thinking, generating, error).
- **Responsiveness:** The layout must adapt gracefully to different screen sizes, specifically ensuring the `SessionSidebar` is easily togglable on smaller viewports.

## 3. Communication Style (Tone & Voice)
- **Direct & Professional:** Avoid unnecessary fluff or conversational fillers.
- **Academic Focus:** Assume a knowledgeable user who appreciates structured, well-formatted information.
- **Error Handling:** Communicate technical issues clearly but concisely, avoiding jargon where simple explanations suffice.

## 4. Component Standards
- **Message Bubbles:**
    - User messages: Distinct background, right-aligned.
    - AI messages: Subtle background, left-aligned, supports Markdown.
- **Input Area:**
    - Auto-expanding textarea.
    - Prominent send button (Cyber Yellow).
    - Clear access to model toggles and mode selectors.
- **Session Sidebar:**
    - Clean list view with "Active" state indicators.
    - Simple "New Session" button at the top.
    - Contextual menus for rename/delete actions.

## 5. Accessibility (WCAG 2.1 Level AA)

### Target Compliance
- **WCAG Level:** AA (targeting Level AA for all new features)
- **Section 508:** Compliant
- **ADA:** Compliant

### Key Requirements

#### Keyboard Navigation
- All interactive elements must be keyboard accessible
- Tab order must be logical and intuitive
- Focus indicators must be visible (minimum 3:1 contrast ratio)
- Skip-to-content link on all pages
- Focus trapping in modals and dialogs
- Arrow key navigation in lists and menus

#### Screen Reader Support
- All images have meaningful alt text or aria-hidden="true" for decorative
- Form inputs have associated labels (visible or sr-only)
- Dynamic content uses aria-live regions
- ARIA roles and properties for custom components
- Proper heading hierarchy (h1 > h2 > h3)
- Landmark regions (header, main, nav, footer)

#### Motion and Animation
- Respect prefers-reduced-motion media query
- No content flashes more than 3 times per second
- Animations can be disabled via CSS and Framer Motion config

#### Color and Contrast
- Minimum 4.5:1 contrast ratio for normal text
- Minimum 3:1 contrast ratio for large text and UI components
- Color is not the sole means of conveying information
- Theme-aware color tokens for light/dark mode

#### Forms and Inputs
- All form controls have labels
- Error messages are associated with inputs
- Required fields are indicated programmatically
- Input purposes identified for autocomplete

### Testing Protocol
1. **Automated Testing:** Run axe-core or Lighthouse accessibility audits
2. **Manual Testing:** Keyboard-only navigation testing
3. **Screen Reader Testing:** Test with NVDA, JAWS, and VoiceOver
4. **Color Contrast:** Verify with WebAIM contrast checker
5. **Motion:** Test with reduced motion OS setting enabled

### Component-Specific Guidelines

#### Modals and Dialogs
- Must trap focus within the dialog
- Escape key must close the dialog
- Focus returns to trigger element on close
- Use role="dialog" and aria-modal="true"
- Provide aria-labelledby and aria-describedby

#### Forms
- Labels must be programmatically associated with inputs
- Use htmlFor/id pattern or wrap input in label
- Placeholder text is not a substitute for labels
- Error messages use aria-describedby

#### Tables and Lists
- Use semantic HTML (table, ul, ol)
- Provide column headers for data tables
- Use aria-describedby for complex tables

#### Carousels
- Use role="region" with aria-roledescription="carousel"
- Announce slide changes with aria-live
- Provide slide navigation controls
- Keyboard navigation for slide controls