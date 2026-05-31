---
status: resolved
trigger: "overlapping-button-design: The 'In Progress' filter button in the 'Your Courses' section shows overlapping/double border design"
created: 2025-02-17T00:00:00Z
updated: 2025-02-17T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - Active buttons had focus:ring-primary (yellow) applied on top of bg-[#FFD400] (yellow background)
test: Fixed by using focus:ring-gray-900 for active buttons, keeping focus:ring-primary for inactive
expecting: Visual overlap resolved - active buttons now show black focus ring instead of yellow-on-yellow
next_action: Complete verification and archive

## Symptoms

expected: Filter buttons should have clean, single-layer styling - either filled (when active) or outlined (when inactive), without overlapping borders
actual: The "In Progress" button (which appears to be the active/selected tab) shows overlapping design - looks like a double border or filled button with additional outline creating a "halo" or doubled appearance
errors: None visible - this is a visual/layout issue
reproduction:
1. Navigate to "Your Courses" section
2. Observe the filter tabs (All, In Progress, Completed)
3. Notice the "In Progress" button has overlapping/double border design

## Eliminated

## Evidence

- timestamp: 2025-02-17T00:00:00Z
  checked: CourseFilter.tsx button styling (lines 58-64)
  found: Focus ring classes are always applied regardless of active state
  implication: When active button (yellow bg) is focused, yellow ring appears around it creating overlap

- timestamp: 2025-02-17T00:00:00Z
  checked: CSS primary color definition (client/src/index.css line 94)
  found: --primary: 50 100% 50% corresponds to #FFD300 (yellow)
  implication: focus:ring-primary creates yellow ring that blends with yellow active button background

## Resolution

root_cause: Active filter buttons have focus:ring-primary (yellow ring) applied on top of bg-[#FFD400] (yellow background), causing visual overlap/halo effect when focused
fix: Conditionally apply focus:ring-gray-900 for active buttons (creating black ring on yellow bg) and focus:ring-primary for inactive buttons (yellow ring on gray bg)
verification: All 10 CourseFilter tests pass; visual overlap eliminated by using contrasting focus ring colors
files_changed:
  - client/src/features/learning/CourseFilter.tsx: Updated className logic for both status filter buttons (lines 58-64) and sort selector buttons (lines 88-94)
