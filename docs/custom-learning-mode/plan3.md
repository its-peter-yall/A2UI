# P3: Custom Settings and API Payload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Custom learning mode frontend UI in `TopicInput.tsx` with a responsive settings row (1-30 concept count field and shared research switch), strict form validation, and exact API request payload forwarding in `learningApi.ts`.

**Architecture:** Extend `TopicInput.tsx` with a fourth dropdown mode ('custom') that conditionally reveals an accessible, compact settings row below the search input. A single React boolean state `webSearchEnabled` is shared between the search input globe icon and the Custom research switch, with graceful disabled-state guidance when search capabilities are unconfigured. The concept count is strictly validated on submission (required whole number 1-30), retained across mode changes, and transmitted in the `GenerateCourseRequest` payload only for custom mode. `generateCourse` in `learningApi.ts` carries `custom_topic_count` in the POST request body.

**Tech Stack:** React 19, TypeScript strict mode, Tailwind CSS 4.x, Lucide icons (`Globe2`, `ChevronDown`), TanStack Query v5 (`useMutation`, `useQueryClient`), Vitest, React Testing Library.

---

## Scope, References, and Shared-Checkout Rules

Approved behavior comes from `docs/custom-learning-mode/goal.md`.
Technical research and UI state architecture come from `docs/custom-learning-mode/research.md`, sections 1, 4, and 6.
Ownership and exit gate come from `docs/custom-learning-mode/state.md`, P3.
Committed contracts come from `docs/custom-learning-mode/plan1.md` and commit `0f780e8` (`client/src/types/learning.ts`).
Conventions follow `docs/CONVENTIONS.md` and `docs/TESTING.md`.

This plan implements **P3 only**. It does not modify server code, planner agents, graph state, or database schemas.
All commands run in PowerShell from `D:/Peter/A2UI` or `D:/Peter/A2UI/client`. Use forward slashes in all paths.

### Ownership Map

| File | P3 Responsibility |
| --- | --- |
| `client/src/lib/learningApi.ts` | Carry `custom_topic_count` in the `POST /learning/generate` payload |
| `client/src/lib/learningApi.test.ts` | Unit tests asserting exact POST payload structure |
| `client/src/features/learning/TopicInput.tsx` | Mode dropdown with Custom; settings row with count and research; validation, retention, and submission |
| `client/src/features/learning/TopicInput.test.tsx` | Unit and interaction tests for dropdown, settings row, shared research, validation, and submission |

### Shared-Checkout Preservation Rules

- The working tree contains ~283 pre-existing modified files (user work, mostly header simplifications).
- Specifically, `client/src/features/learning/TopicInput.tsx`, `client/src/features/learning/TopicInput.test.tsx`, `client/src/lib/learningApi.ts`, and `client/src/lib/learningApi.test.ts` already have a 7-line header block deletion.
- **NEVER** run `git checkout .`, `git restore .`, or revert those header edits.
- **NEVER** run `git add .` or broad directory staging.
- Stage only exact owned paths using `git add -p` or specific file staging, inspect `git diff --cached` before every commit, and ensure no baseline hunks are inadvertently included.

---

## Task 1: API Client Request Payload Transport

**Files:**
- Modify: `client/src/lib/learningApi.ts`
- Test: `client/src/lib/learningApi.test.ts`

- [ ] **Step 1: Write the failing tests for API request payload transport.**

In `client/src/lib/learningApi.test.ts`, append the following test suite inside the file before the final closing line:

```typescript
describe('learningApi request payload', () => {
  beforeEach(() => {
    mocks.resetLast();
    mocks.instance.post.mockClear();
  });

  it('generateCourse forwards custom_topic_count in request body for custom mode', async () => {
    await generateCourse({
      query: 'Quantum Computing',
      mode: 'custom',
      custom_topic_count: 5,
    });

    expect(mocks.instance.post).toHaveBeenCalledWith(
      '/learning/generate',
      expect.objectContaining({
        query: 'Quantum Computing',
        mode: 'custom',
        custom_topic_count: 5,
      }),
      expect.any(Object),
    );
  });

  it('generateCourse omits custom_topic_count in request body for non-custom modes', async () => {
    await generateCourse({
      query: 'Classical Mechanics',
      mode: 'auto',
    });

    const callArgs = mocks.instance.post.mock.calls[0];
    const payload = callArgs[1] as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({
        query: 'Classical Mechanics',
        mode: 'auto',
      }),
    );
    expect(payload.custom_topic_count).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run:
```powershell
npx vitest run src/lib/learningApi.test.ts
```
Expected: Tests fail or need payload normalization in `generateCourse` if `custom_topic_count` is not explicitly forwarded or if type mismatches occur.

- [ ] **Step 3: Write minimal implementation in `learningApi.ts`.**

In `client/src/lib/learningApi.ts`, update `generateCourse` (lines 86-101) to construct and transmit the exact payload including optional `custom_topic_count`:

```typescript
export const generateCourse = async (
  data: GenerateCourseRequest,
  options: GenerateCourseOptions = {},
): Promise<GenerateCourseAcceptedResponse> => {
  const webSearchEnabled = options.webSearchEnabled ?? false;
  const headers = {
    ...buildLlmHeaders(),
    ...buildWebSearchHeaders(webSearchEnabled, getWebSearchSettings()),
  };
  const payload: GenerateCourseRequest = {
    query: data.query,
    ...(data.user_id !== undefined ? { user_id: data.user_id } : {}),
    ...(data.mode !== undefined ? { mode: data.mode } : {}),
    ...(data.custom_topic_count !== undefined
      ? { custom_topic_count: data.custom_topic_count }
      : {}),
  };
  const response = await api.post<GenerateCourseAcceptedResponse>(
    '/learning/generate',
    payload,
    { headers },
  );
  return response.data;
};
```

- [ ] **Step 4: Run test to verify it passes.**

Run:
```powershell
npx vitest run src/lib/learningApi.test.ts
```
Expected: All tests pass (including 6 existing secret-scope tests and the 2 new payload tests).

- [ ] **Step 5: Selectively stage and commit.**

```powershell
git add -p -- client/src/lib/learningApi.ts client/src/lib/learningApi.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(learning): carry custom topic count in generate course api payload"
```

---

## Task 2: Mode Dropdown Custom Option & Visibility of Settings Row

**Files:**
- Modify: `client/src/features/learning/TopicInput.tsx`
- Test: `client/src/features/learning/TopicInput.test.tsx`

- [ ] **Step 1: Write the failing tests for Custom dropdown option and settings row visibility.**

In `client/src/features/learning/TopicInput.test.tsx`, add the following tests inside the existing `describe('TopicInput web search', ...)` block or a new `describe('TopicInput custom mode', ...)` block:

```typescript
describe('TopicInput custom mode controls', () => {
  beforeEach(() => {
    mocks.generateCourse.mockReset();
    mocks.navigate.mockReset();
    mocks.capability = true;
    mocks.agentsReady = true;
  });

  it('renders four depth mode options in the listbox: Auto, Lite, Full, and Custom', () => {
    renderInput();
    const dropdownButton = screen.getByRole('button', {
      name: /learning depth mode/i,
    });
    fireEvent.click(dropdownButton);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(4);
    expect(options.map((opt) => opt.textContent)).toEqual([
      'Auto',
      'Lite',
      'Full',
      'Custom',
    ]);
  });

  it('shows custom settings row only when Custom mode is selected', () => {
    renderInput();
    expect(screen.queryByLabelText(/number of concepts/i)).not.toBeInTheDocument();

    const dropdownButton = screen.getByRole('button', {
      name: /learning depth mode/i,
    });
    fireEvent.click(dropdownButton);
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));

    expect(screen.getByLabelText(/number of concepts/i)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /research/i })).toBeInTheDocument();

    // Switching back to Auto hides the settings row
    fireEvent.click(dropdownButton);
    fireEvent.click(screen.getByRole('option', { name: 'Auto' }));
    expect(screen.queryByLabelText(/number of concepts/i)).not.toBeInTheDocument();
  });

  it('initializes the concept count field as empty', () => {
    renderInput();
    const dropdownButton = screen.getByRole('button', {
      name: /learning depth mode/i,
    });
    fireEvent.click(dropdownButton);
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));

    const countInput = screen.getByLabelText(/number of concepts/i) as HTMLInputElement;
    expect(countInput.value).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run:
```powershell
npx vitest run src/features/learning/TopicInput.test.tsx
```
Expected: FAIL with "expected 3 to be 4" (Custom option missing) and "unable to find label /number of concepts/i".

- [ ] **Step 3: Write minimal implementation in `TopicInput.tsx`.**

In `client/src/features/learning/TopicInput.tsx`:
1. Add `'custom'` option to `DEPTH_MODE_OPTIONS`:
```typescript
const DEPTH_MODE_OPTIONS: Array<{
  value: LearningDepthMode;
  label: string;
}> = [
  { value: 'auto', label: 'Auto' },
  { value: 'lite', label: 'Lite' },
  { value: 'full', label: 'Full' },
  { value: 'custom', label: 'Custom' },
];
```

2. Add state and IDs inside `TopicInput` component:
```typescript
  const [customTopicCount, setCustomTopicCount] = useState('');
  const countInputId = useId();
  const researchSwitchId = useId();
  const countHintId = useId();
```

3. Render the compact Custom settings row directly below the search input bar within the `<form>`:
```tsx
      <form onSubmit={handleSubmit} className="flex flex-col gap-2" role="search">
        <div className="relative">
          <label htmlFor={inputId} className="sr-only">
            Enter a topic to learn
          </label>
          <input
            id={inputId}
            type="search"
            role="searchbox"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus={autoFocus}
            placeholder={placeholder}
            disabled={isLoading || !canStart}
            aria-describedby={error ? `${inputId}-error` : undefined}
            aria-invalid={error ? 'true' : undefined}
            className={cn(
              'w-full px-4 py-3 pr-56 text-lg rounded-lg border',
              'bg-background text-foreground',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-colors duration-200',
              error && 'border-destructive focus:ring-destructive',
            )}
          />
          {/* Absolute input buttons remain unchanged */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 sm:gap-2">
            {/* Globe, mode dropdown, submit button */}
          </div>
        </div>

        {mode === 'custom' && (
          <div
            data-testid="custom-settings-row"
            className={cn(
              'px-3 py-2.5 rounded-lg border border-border bg-card/60 backdrop-blur-xs',
              'flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm',
              isLoading && 'opacity-60 pointer-events-none',
            )}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <label
                  htmlFor={countInputId}
                  className="text-xs sm:text-sm font-medium text-foreground whitespace-nowrap"
                >
                  Number of concepts
                </label>
                <input
                  id={countInputId}
                  type="number"
                  min={1}
                  max={30}
                  step={1}
                  placeholder="1-30"
                  value={customTopicCount}
                  onChange={(e) => setCustomTopicCount(e.target.value)}
                  disabled={isLoading || !canStart}
                  aria-describedby={countHintId}
                  className={cn(
                    'w-20 px-2.5 py-1 text-sm rounded-md border bg-background text-foreground border-border',
                    'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                    'disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
                  )}
                />
                <span id={countHintId} className="text-xs text-muted-foreground">
                  (1–30)
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:items-end gap-1">
              <div className="flex items-center gap-2">
                <label
                  htmlFor={researchSwitchId}
                  className={cn(
                    'text-xs sm:text-sm font-medium',
                    !canUseWebSearch ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  Research
                </label>
                <button
                  id={researchSwitchId}
                  type="button"
                  role="switch"
                  aria-checked={webSearchEnabled}
                  aria-label="Research"
                  disabled={isLoading || !canStart || !canUseWebSearch}
                  onClick={() => {
                    if (canUseWebSearch) {
                      setWebSearchEnabled((prev) => !prev);
                    }
                  }}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                    'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    webSearchEnabled && canUseWebSearch
                      ? 'bg-[#ffb74d]'
                      : 'bg-muted-foreground/30',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out',
                      webSearchEnabled && canUseWebSearch
                        ? 'translate-x-4'
                        : 'translate-x-0',
                    )}
                    aria-hidden="true"
                  />
                </button>
              </div>
              {!canUseWebSearch && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Configure web search provider in Settings to enable research.
                </p>
              )}
            </div>
          </div>
        )}
      </form>
```

- [ ] **Step 4: Run test to verify it passes.**

Run:
```powershell
npx vitest run src/features/learning/TopicInput.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Selectively stage and commit.**

```powershell
git add -p -- client/src/features/learning/TopicInput.tsx client/src/features/learning/TopicInput.test.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(learning): add custom mode option and settings row"
```

---

## Task 3: Shared Research State & Disabled Capability Guidance

**Files:**
- Modify: `client/src/features/learning/TopicInput.tsx`
- Test: `client/src/features/learning/TopicInput.test.tsx`

- [ ] **Step 1: Write the failing tests for shared research state and disabled guidance.**

In `client/src/features/learning/TopicInput.test.tsx`, append inside `describe('TopicInput custom mode controls', ...)`:

```typescript
  it('synchronizes research state between the globe icon and the Custom research switch', () => {
    renderInput();
    const dropdownButton = screen.getByRole('button', {
      name: /learning depth mode/i,
    });
    fireEvent.click(dropdownButton);
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));

    const globeButton = screen.getByRole('button', {
      name: /use web search for this course/i,
    });
    const researchSwitch = screen.getByRole('switch', { name: /research/i });

    expect(globeButton).toHaveAttribute('aria-pressed', 'false');
    expect(researchSwitch).toHaveAttribute('aria-checked', 'false');

    // Toggle switch ON -> globe updates to true
    fireEvent.click(researchSwitch);
    expect(researchSwitch).toHaveAttribute('aria-checked', 'true');
    expect(globeButton).toHaveAttribute('aria-pressed', 'true');

    // Toggle globe OFF -> switch updates to false
    fireEvent.click(globeButton);
    expect(globeButton).toHaveAttribute('aria-pressed', 'false');
    expect(researchSwitch).toHaveAttribute('aria-checked', 'false');
  });

  it('keeps research switch visible but disabled with guidance when search capability is unavailable', () => {
    mocks.capability = false;
    renderInput();

    const dropdownButton = screen.getByRole('button', {
      name: /learning depth mode/i,
    });
    fireEvent.click(dropdownButton);
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));

    // Globe button is hidden from input bar
    expect(
      screen.queryByRole('button', { name: /use web search/i }),
    ).not.toBeInTheDocument();

    // Research switch remains VISIBLE but DISABLED
    const researchSwitch = screen.getByRole('switch', { name: /research/i });
    expect(researchSwitch).toBeInTheDocument();
    expect(researchSwitch).toBeDisabled();

    // Guidance text is shown
    expect(
      screen.getByText(/configure web search provider in settings/i),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it passes or fails.**

Run:
```powershell
npx vitest run src/features/learning/TopicInput.test.tsx
```
Expected: If Task 2's implementation wired `webSearchEnabled` and `canUseWebSearch`, this should pass cleanly; if any aria attributes or disabled guards were missing, it fails.

- [ ] **Step 3: Ensure complete minimal implementation in `TopicInput.tsx`.**

Verify in `TopicInput.tsx`:
- Both globe button and research switch read and modify the identical `webSearchEnabled` state.
- Research switch has `disabled={isLoading || !canStart || !canUseWebSearch}`.
- When `!canUseWebSearch`, assistive copy "Configure web search provider in Settings to enable research." is rendered below the switch.

- [ ] **Step 4: Run test to verify it passes.**

Run:
```powershell
npx vitest run src/features/learning/TopicInput.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Selectively stage and commit.**

```powershell
git add -p -- client/src/features/learning/TopicInput.tsx client/src/features/learning/TopicInput.test.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(learning): sync custom research switch with shared web search state"
```

---

## Task 4: Concept Count Validation, Retention Across Mode Switches & Submission Blocking

**Files:**
- Modify: `client/src/features/learning/TopicInput.tsx`
- Test: `client/src/features/learning/TopicInput.test.tsx`

- [ ] **Step 1: Write the failing tests for retention, validation, and submission blocking.**

In `client/src/features/learning/TopicInput.test.tsx`, append inside `describe('TopicInput custom mode controls', ...)`:

```typescript
  it('retains entered concept count when switching between modes during form lifetime', () => {
    renderInput();
    const dropdownButton = screen.getByRole('button', {
      name: /learning depth mode/i,
    });
    fireEvent.click(dropdownButton);
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));

    const countInput = screen.getByLabelText(/number of concepts/i);
    fireEvent.change(countInput, { target: { value: '12' } });
    expect((countInput as HTMLInputElement).value).toBe('12');

    // Switch to Lite
    fireEvent.click(dropdownButton);
    fireEvent.click(screen.getByRole('option', { name: 'Lite' }));
    expect(screen.queryByLabelText(/number of concepts/i)).not.toBeInTheDocument();

    // Switch back to Custom -> retained
    fireEvent.click(dropdownButton);
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));
    const restoredInput = screen.getByLabelText(/number of concepts/i);
    expect((restoredInput as HTMLInputElement).value).toBe('12');
  });

  it('blocks submission and displays accessible validation feedback when count is empty in Custom mode', () => {
    renderInput();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Distributed Systems' },
    });

    const dropdownButton = screen.getByRole('button', {
      name: /learning depth mode/i,
    });
    fireEvent.click(dropdownButton);
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));

    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));

    expect(mocks.generateCourse).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/between 1 and 30/i);
    expect(screen.getByLabelText(/number of concepts/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it.each([
    ['0', '0'],
    ['-5', '-5'],
    ['31', '31'],
    ['100', '100'],
    ['2.5', '2.5'],
    ['abc', 'abc'],
  ])(
    'blocks submission and shows accessible validation feedback for invalid count %s (%s)',
    (_label, invalidValue) => {
      renderInput();
      fireEvent.change(screen.getByRole('searchbox'), {
        target: { value: 'Distributed Systems' },
      });

      const dropdownButton = screen.getByRole('button', {
        name: /learning depth mode/i,
      });
      fireEvent.click(dropdownButton);
      fireEvent.click(screen.getByRole('option', { name: 'Custom' }));

      const countInput = screen.getByLabelText(/number of concepts/i);
      fireEvent.change(countInput, { target: { value: invalidValue } });

      fireEvent.click(screen.getByRole('button', { name: /start learning/i }));

      expect(mocks.generateCourse).not.toHaveBeenCalled();
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/between 1 and 30/i);
      expect(countInput).toHaveAttribute('aria-invalid', 'true');
    },
  );

  it('clears validation error when user types a new count value', () => {
    renderInput();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Distributed Systems' },
    });

    const dropdownButton = screen.getByRole('button', {
      name: /learning depth mode/i,
    });
    fireEvent.click(dropdownButton);
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));

    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    const countInput = screen.getByLabelText(/number of concepts/i);
    fireEvent.change(countInput, { target: { value: '5' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails.**

Run:
```powershell
npx vitest run src/features/learning/TopicInput.test.tsx
```
Expected: FAIL on validation checks because `handleSubmit` does not validate concept count and does not set validation alerts.

- [ ] **Step 3: Write minimal implementation in `TopicInput.tsx`.**

In `client/src/features/learning/TopicInput.tsx`:
1. Add `countError` state and `countErrorId`:
```typescript
  const [countError, setCountError] = useState<string | null>(null);
  const countErrorId = useId();
```

2. In `handleSubmit`, add validation before `generateMutation.mutate`:
```typescript
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim() || generateMutation.isPending || !canStart) {
      return;
    }

    let parsedCount: number | undefined;
    if (mode === 'custom') {
      const trimmed = customTopicCount.trim();
      const num = Number(trimmed);
      if (
        !trimmed ||
        !/^\d+$/.test(trimmed) ||
        !Number.isInteger(num) ||
        num < 1 ||
        num > 30
      ) {
        setCountError('Please enter a whole number between 1 and 30 concepts.');
        return;
      }
      parsedCount = num;
      setCountError(null);
    }

    generateMutation.mutate({
      query: query.trim(),
      user_id: userId,
      mode,
      ...(parsedCount !== undefined ? { custom_topic_count: parsedCount } : {}),
    });
  };
```

3. Clear `countError` in the input's `onChange`:
```tsx
  <input
    id={countInputId}
    type="number"
    min={1}
    max={30}
    step={1}
    placeholder="1-30"
    value={customTopicCount}
    onChange={(e) => {
      setCustomTopicCount(e.target.value);
      if (countError) setCountError(null);
    }}
    disabled={isLoading || !canStart}
    aria-invalid={countError ? 'true' : undefined}
    aria-describedby={countError ? countErrorId : countHintId}
    className={cn(
      'w-20 px-2.5 py-1 text-sm rounded-md border bg-background text-foreground',
      'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
      'disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
      countError
        ? 'border-destructive focus:ring-destructive'
        : 'border-border',
    )}
  />
```

4. Render the accessible error message when `countError` is present:
```tsx
  {countError && (
    <p
      id={countErrorId}
      role="alert"
      className="text-xs text-destructive font-medium"
    >
      {countError}
    </p>
  )}
```

- [ ] **Step 4: Run test to verify it passes.**

Run:
```powershell
npx vitest run src/features/learning/TopicInput.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Selectively stage and commit.**

```powershell
git add -p -- client/src/features/learning/TopicInput.tsx client/src/features/learning/TopicInput.test.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(learning): validate custom concept count and retain during mode switches"
```

---

## Task 5: End-to-End Submission Payload & Cache Seeding

**Files:**
- Modify: `client/src/features/learning/TopicInput.tsx`
- Test: `client/src/features/learning/TopicInput.test.tsx`

- [ ] **Step 1: Write the failing tests for exact submission payload and cache seeding.**

In `client/src/features/learning/TopicInput.test.tsx`, append inside `describe('TopicInput custom mode controls', ...)`:

```typescript
  it('submits exact request payload with custom_topic_count and seeds session cache for Custom mode', async () => {
    mocks.generateCourse.mockResolvedValue({
      session: {
        id: 'session-custom-1',
        query: 'Compilers',
        course_title: 'Compilers',
        mode: 'custom',
        resolved_mode: 'custom',
        custom_topic_count: 7,
        total_nodes: 0,
        nodes: [],
      },
      generation: { id: 'job-custom-1', stage: 'INITIALIZING', last_event_id: 1 },
    });

    const client = renderInput();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Compilers' },
    });

    const dropdownButton = screen.getByRole('button', {
      name: /learning depth mode/i,
    });
    fireEvent.click(dropdownButton);
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));

    const countInput = screen.getByLabelText(/number of concepts/i);
    fireEvent.change(countInput, { target: { value: '7' } });

    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));

    await waitFor(() => {
      expect(mocks.generateCourse).toHaveBeenCalledWith(
        {
          query: 'Compilers',
          user_id: undefined,
          mode: 'custom',
          custom_topic_count: 7,
        },
        { webSearchEnabled: false },
      );
    });

    expect(client.getQueryData(['learningSession', 'session-custom-1'])).toMatchObject({
      id: 'session-custom-1',
      mode: 'custom',
      resolved_mode: 'custom',
      custom_topic_count: 7,
    });
    expect(mocks.navigate).toHaveBeenCalledWith('/learn/session-custom-1');
  });

  it('submits request payload without custom_topic_count for Auto mode even if count was previously entered', async () => {
    mocks.generateCourse.mockResolvedValue({
      session: {
        id: 'session-auto-1',
        query: 'Compilers',
        course_title: 'Compilers',
        mode: 'auto',
        total_nodes: 0,
        nodes: [],
      },
      generation: { id: 'job-auto-1', stage: 'INITIALIZING', last_event_id: 1 },
    });

    renderInput();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Compilers' },
    });

    const dropdownButton = screen.getByRole('button', {
      name: /learning depth mode/i,
    });
    // Select Custom and enter count 15
    fireEvent.click(dropdownButton);
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText(/number of concepts/i), {
      target: { value: '15' },
    });

    // Switch back to Auto
    fireEvent.click(dropdownButton);
    fireEvent.click(screen.getByRole('option', { name: 'Auto' }));

    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));

    await waitFor(() => {
      expect(mocks.generateCourse).toHaveBeenCalledWith(
        {
          query: 'Compilers',
          user_id: undefined,
          mode: 'auto',
        },
        { webSearchEnabled: false },
      );
    });
  });

  it('disables Custom settings controls while course generation is pending', () => {
    mocks.generateCourse.mockReturnValue(new Promise(() => {}));

    renderInput();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Distributed Systems' },
    });

    const dropdownButton = screen.getByRole('button', {
      name: /learning depth mode/i,
    });
    fireEvent.click(dropdownButton);
    fireEvent.click(screen.getByRole('option', { name: 'Custom' }));

    const countInput = screen.getByLabelText(/number of concepts/i);
    fireEvent.change(countInput, { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: /start learning/i }));

    expect(countInput).toBeDisabled();
    expect(screen.getByRole('switch', { name: /research/i })).toBeDisabled();
  });
```

- [ ] **Step 2: Run test to verify it fails or passes.**

Run:
```powershell
npx vitest run src/features/learning/TopicInput.test.tsx
```
Expected: Fails if cache seeding does not populate `mode`, `resolved_mode`, or `custom_topic_count`.

- [ ] **Step 3: Write minimal implementation in `TopicInput.tsx`.**

In `client/src/features/learning/TopicInput.tsx`, update `generateMutation.onSuccess` (lines 99-134) to populate the extended session fields:

```typescript
    onSuccess: (accepted) => {
      const shell = accepted.session;
      const session: LearningSessionWithNodes = {
        id: String(shell.id),
        user_id:
          typeof shell.user_id === 'string' || shell.user_id === null
            ? (shell.user_id as string | null)
            : null,
        query: String(shell.query ?? ''),
        course_title: String(shell.course_title ?? shell.query ?? ''),
        total_nodes:
          typeof shell.total_nodes === 'number' ? shell.total_nodes : 0,
        completed_nodes:
          typeof shell.completed_nodes === 'number'
            ? shell.completed_nodes
            : 0,
        last_active_node_id: null,
        mode: (shell.mode as LearningDepthMode | null | undefined) ?? mode,
        resolved_mode:
          (shell.resolved_mode as ResolvedDepthMode | null | undefined) ?? null,
        custom_topic_count:
          typeof shell.custom_topic_count === 'number'
            ? shell.custom_topic_count
            : (mode === 'custom' && Number(customTopicCount)
                ? Number(customTopicCount)
                : null),
        title_finalized:
          typeof shell.title_finalized === 'boolean'
            ? shell.title_finalized
            : false,
        created_at:
          typeof shell.created_at === 'string'
            ? shell.created_at
            : new Date().toISOString(),
        updated_at: null,
        nodes: Array.isArray(shell.nodes)
          ? (shell.nodes as LearningSessionWithNodes['nodes'])
          : [],
        generation: accepted.generation,
      };
      queryClient.setQueryData(['learningSession', session.id], session);
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      navigate(`/learn/${session.id}`);
    },
```

- [ ] **Step 4: Run test to verify it passes.**

Run:
```powershell
npx vitest run src/features/learning/TopicInput.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Selectively stage and commit.**

```powershell
git add -p -- client/src/features/learning/TopicInput.tsx client/src/features/learning/TopicInput.test.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(learning): submit custom topic count and seed session cache"
```

---

## Task 6: Verification, Responsive Layout Audit, TypeScript Build & Lint Gate

**Files:**
- Audit: `client/src/features/learning/TopicInput.tsx`
- Audit: `client/src/lib/learningApi.ts`
- Audit: `client/src/features/learning/TopicInput.test.tsx`
- Audit: `client/src/lib/learningApi.test.ts`

- [ ] **Step 1: Run all client tests for modified and contract files.**

Run:
```powershell
npx vitest run src/features/learning/TopicInput.test.tsx src/lib/learningApi.test.ts src/types/learning.test.ts
```
Expected: All test suites pass cleanly.

- [ ] **Step 2: Run full client build (TypeScript compile + Vite build).**

Run:
```powershell
npm --prefix client run build
```
Expected: `tsc -b && vite build` completes with exit code 0.

- [ ] **Step 3: Run ESLint on all touched files.**

Run:
```powershell
npx eslint src/features/learning/TopicInput.tsx src/lib/learningApi.ts src/features/learning/TopicInput.test.tsx src/lib/learningApi.test.ts
```
Expected: 0 errors and 0 warnings.

- [ ] **Step 4: Check for trailing whitespace and formatting diagnostics.**

Run:
```powershell
git diff --check -- client/src/features/learning/TopicInput.tsx client/src/lib/learningApi.ts client/src/features/learning/TopicInput.test.tsx client/src/lib/learningApi.test.ts
```
Expected: Clean output (exit code 0).

- [ ] **Step 5: Verify P3 exit gate checklist against test results.**

Verify the 8 acceptance gates:
1. [x] Four options render in the dropdown (`Auto`, `Lite`, `Full`, `Custom`).
2. [x] Settings row with concept count input appears only when Custom is selected.
3. [x] Exact request payload asserted (`custom_topic_count` present for custom, omitted for auto/lite/full).
4. [x] Invalid and empty counts block submission with accessible feedback (`role="alert"`).
5. [x] Shared research state between globe and switch; switch disabled with guidance when search is unavailable.
6. [x] Pending-generation controls are disabled.
7. [x] Narrow-viewport responsive styles (`flex-col sm:flex-row`, dark surfaces, Cyber Yellow accents).
8. [x] TypeScript build and ESLint pass without warnings or errors.
