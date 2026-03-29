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