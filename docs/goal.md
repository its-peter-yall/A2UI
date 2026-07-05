# Goal: Table of Contents & Progress Bar Refactoring

## Objective
Implement a "Table of Contents" feature (like in books) that allows users to view all topics, their metadata, and navigate directly to unlocked topics. Replace the existing navigation progress bar with a single glowing green progress bar.

## Requirements

### Table of Contents (TOC)
- **Access**: Accessible via a meticulous "Table of Contents" button on any "Topic" (non-quiz) node/screen.
- **Window/Modal Layout**:
  - Displays as a beautiful modal or popup.
  - Showcases a table with columns:
    1. Topic-number/order (`#1`, `#2`, etc.)
    2. Topic-name (clickable link/button to navigate to the topic, if unlocked)
    3. number-of-quizzes (number of quizzes in the topic)
    4. difficulty-level (the difficulty/complexity of the topic: Basic, Intermediate, Advanced)
    5. Status (Mastered / In Progress / Locked)
  - Displays exactly 10 topics at once; any additional topics are scrolled to view.
  - Contains legends/color key explaining the status indications (Mastered, In Progress, Locked) moved from the progress bar.
- **Interactivity**: Clicking on an unlocked topic in the list navigates the carousel/course directly to that topic.

### Progress Bar Refactoring
- **Removal**: Remove the old step-by-step navigation bar (`o---o---o`) and its pagination controls.
- **Replacement**: Replace it with a single glowing green bar that fills according to the overall percentage completed (`completedCount / nodes.length * 100`).
- **Legends**: The status legends must be removed from the progress bar area and placed inside the Table of Contents window.

## Files to Modify
- `client/src/features/learning/ProgressBar.tsx`: Refactor to display only the single glowing green progress bar. Remove pagination and step nodes.
- `client/src/features/learning/LearningPathContainer.tsx`: Add Table of Contents button, modal/dialog window, state handling for TOC open/close, navigation triggers, and update imports.
- `client/src/features/learning/ConceptCard.tsx` (optional, if any button or prop is passed): Coordinate.
