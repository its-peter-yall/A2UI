# Completed-Course Review Parity: P5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable, bounded split and overlay concept-chat layout (`ConceptChatLayout`), an explicit concept-chat controller hook (`useConceptChatPanel`), and targeted lifecycle/prefill fixes in `ChatPanel` and `useConceptChat` so both normal learning and course revision enjoy bounded resizing (25%–38%), responsive sub-768px full-width overlay mode, independent scrolling, explicit topic conversation ownership during carousel navigation, stream retargeting, repeated curiosity-question prefill, and zero chat-history deletions on course or revision completion.

**Architecture:** Decompose concept-chat presentation and state into two clean layers: (1) `ConceptChatLayout` as a pure, responsive layout component providing desktop split view (with mouse and keyboard separator resize controls) and mobile overlay view (< 768px) with independent scroll containers; and (2) `useConceptChatPanel` as a headless controller managing chat open/close, explicit topic ownership (`chatNodeId` and `chatTopicTitle`), heading selection scoping, and curiosity prefill lifecycle. `ChatPanel` and `useConceptChat` are fortified with targeted lifecycle fixes to eliminate the repeated-prefill bug, display the bound topic title, prevent in-flight stream writes to destination nodes on retarget, and enforce that revision completion never triggers chat history purging. `LearningPathContainer` adopts the new layout and controller without regressing any generation, quiz anti-cheat, or carousel capabilities.

**Tech Stack:** React 19, TypeScript (strict, `verbatimModuleSyntax`), Vitest + `@testing-library/react` + `jsdom`, Tailwind CSS 4, Framer Motion 12, Lucide React.

---

## File Ownership and Component Map

### Production Files Owned by P5
- `client/src/features/learning/ConceptChatLayout.tsx` (NEW bounded split/overlay layout)
- `client/src/features/learning/useConceptChatPanel.ts` (NEW explicit controller hook)
- `client/src/features/learning/ChatPanel.tsx` (Targeted header, repeated prefill, and streaming composer fixes)
- `client/src/features/learning/useConceptChat.ts` (Targeted stream retargeting, key-scoped storage, and completion fixes)
- `client/src/features/learning/LearningPathContainer.tsx` (Narrow reuse of layout and controller; preserve all learning and generation behavior)

### Production Files Protected (Read-Only / Unchanged in P5)
- `client/src/features/learning/curiosityParser.ts` (Keep unchanged; tested for reuse)
- `client/src/features/learning/CuriositySpark.tsx` (Keep unchanged; tested for reuse)
- `client/src/features/learning/RevisionPage.tsx` (Reserved exclusively for P6)
- `client/src/lib/chatApi.ts` (Transport unchanged)

### Test Files Owned by P5
- `client/src/features/learning/curiosityParser.test.ts` (NEW)
- `client/src/features/learning/CuriositySpark.test.tsx` (NEW)
- `client/src/features/learning/ChatPanel.test.tsx` (EXISTING - extended)
- `client/src/features/learning/useConceptChat.test.ts` (EXISTING - extended)
- `client/src/features/learning/useConceptChatPanel.test.ts` (NEW)
- `client/src/features/learning/ConceptChatLayout.test.tsx` (NEW)
- `client/src/features/learning/LearningPathContainer.test.tsx` (EXISTING - extended)

---

## Tasks

### Task 1: Curiosity Parser and Spark Widget Reuse Verification (A11)

**Files:**
- Test: `client/src/features/learning/curiosityParser.test.ts`
- Test: `client/src/features/learning/CuriositySpark.test.tsx`

- [ ] **Step 1: Write the failing tests for curiosityParser and CuriositySpark**

Create `client/src/features/learning/curiosityParser.test.ts`:
```typescript
/**
 * ============================================================================
 * FILE: curiosityParser.test.ts
 * LOCATION: client/src/features/learning/curiosityParser.test.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Tests curiosity section parsing, question list extraction, stopping
 *    conditions, and fallback behavior for unformatted topic content.
 *
 * ROLE IN PROJECT:
 *    Guards A11 curiosity question parsing parity across learning and revision.
 *
 * USAGE:
 *    npm run test -- --run src/features/learning/curiosityParser.test.ts
 * ============================================================================
 */

import { describe, expect, it } from "vitest";
import { parseCuriosityQuestions } from "./curiosityParser";

describe("parseCuriosityQuestions", () => {
	it("extracts curiosity questions from '## Curious to explore more?' with dash bullets", () => {
		const markdown = `
# Gradient Descent
Gradient descent optimizes loss functions.

## Curious to explore more?
- How does learning rate affect convergence?
- What is the difference between batch and stochastic gradient descent?
`;
		const result = parseCuriosityQuestions(markdown);
		expect(result.mainContent.trim()).toBe(
			"# Gradient Descent\nGradient descent optimizes loss functions.",
		);
		expect(result.questions).toEqual([
			"How does learning rate affect convergence?",
			"What is the difference between batch and stochastic gradient descent?",
		]);
	});

	it("extracts questions from '### Curious to explore more' without question mark and asterisk bullets", () => {
		const markdown = `
Topic explanation body.

### Curious to explore more
* Can gradient descent get trapped in local minima?
* Why do saddle points matter?
`;
		const result = parseCuriosityQuestions(markdown);
		expect(result.mainContent.trim()).toBe("Topic explanation body.");
		expect(result.questions).toEqual([
			"Can gradient descent get trapped in local minima?",
			"Why do saddle points matter?",
		]);
	});

	it("extracts questions from '## Curiosity Spark' and '### Curiosity Spark'", () => {
		const markdownH2 = `
Topic text.

## Curiosity Spark
- Question 1
`;
		const resultH2 = parseCuriosityQuestions(markdownH2);
		expect(resultH2.questions).toEqual(["Question 1"]);

		const markdownH3 = `
Topic text.

### Curiosity Spark
- Question 2
`;
		const resultH3 = parseCuriosityQuestions(markdownH3);
		expect(resultH3.questions).toEqual(["Question 2"]);
	});

	it("stops question extraction when next section header or blockquote begins", () => {
		const markdown = `
Content body.

## Curious to explore more?
- Valid question 1
- Valid question 2

## Next Section
- Trailing list item not part of curiosity
`;
		const result = parseCuriosityQuestions(markdown);
		expect(result.questions).toEqual(["Valid question 1", "Valid question 2"]);
	});

	it("returns empty questions and preserves markdown unchanged when no curiosity marker exists", () => {
		const markdown = `
# Pure Explanation
This concept has no curiosity questions at all.
- Just a normal list
- Another list item
`;
		const result = parseCuriosityQuestions(markdown);
		expect(result.mainContent).toBe(markdown);
		expect(result.questions).toEqual([]);
	});

	it("handles empty and whitespace-only content safely", () => {
		expect(parseCuriosityQuestions("")).toEqual({
			mainContent: "",
			questions: [],
		});
		expect(parseCuriosityQuestions("   \n\n  ")).toEqual({
			mainContent: "   \n\n  ",
			questions: [],
		});
	});
});
```

Create `client/src/features/learning/CuriositySpark.test.tsx`:
```typescript
/**
 * ============================================================================
 * FILE: CuriositySpark.test.tsx
 * LOCATION: client/src/features/learning/CuriositySpark.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Tests the CuriositySpark widget rendering, button accessibility,
 *    and question click callbacks.
 *
 * ROLE IN PROJECT:
 *    Guards A11 curiosity button presentation and callback wiring.
 *
 * USAGE:
 *    npm run test -- --run src/features/learning/CuriositySpark.test.tsx
 * ============================================================================
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CuriositySpark } from "./CuriositySpark";

vi.mock("./MarkdownRenderer", () => ({
	InlineMarkdown: ({ content }: { content: string }) => <span>{content}</span>,
}));

describe("CuriositySpark", () => {
	it("renders null when questions array is empty", () => {
		const { container } = render(
			<CuriositySpark questions={[]} onAskQuestion={vi.fn()} />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("renders curiosity header and each question button", () => {
		const questions = [
			"What is momentum?",
			"How do Adam and RMSprop differ?",
		];
		render(<CuriositySpark questions={questions} onAskQuestion={vi.fn()} />);

		expect(screen.getByText("Curious to explore more?")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Click any question to ask the chatbot and dive deeper:",
			),
		).toBeInTheDocument();

		const buttons = screen.getAllByRole("button");
		expect(buttons).toHaveLength(2);
		expect(buttons[0]).toHaveAttribute("type", "button");
		expect(buttons[1]).toHaveAttribute("type", "button");
		expect(screen.getByText("What is momentum?")).toBeInTheDocument();
		expect(
			screen.getByText("How do Adam and RMSprop differ?"),
		).toBeInTheDocument();
	});

	it("fires onAskQuestion with exact question text when clicked", () => {
		const handleAsk = vi.fn();
		const questions = ["How does learning rate decay work?"];
		render(
			<CuriositySpark questions={questions} onAskQuestion={handleAsk} />,
		);

		const button = screen.getByRole("button", {
			name: /how does learning rate decay work/i,
		});
		fireEvent.click(button);

		expect(handleAsk).toHaveBeenCalledTimes(1);
		expect(handleAsk).toHaveBeenCalledWith(
			"How does learning rate decay work?",
		);
	});
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run from `client/`:
```bash
npm run test -- --run src/features/learning/curiosityParser.test.ts src/features/learning/CuriositySpark.test.tsx
```
Expected: PASS (Tests for existing `curiosityParser.ts` and `CuriositySpark.tsx` pass without modifying production files).

- [ ] **Step 3: Commit**

```bash
git add client/src/features/learning/curiosityParser.test.ts client/src/features/learning/CuriositySpark.test.tsx
git commit -m "test(learning): add test coverage for curiosity parser and spark widget"
```

---

### Task 2: ChatPanel Topic Title Display, Repeated Prefill, and Streaming Composer (A11, A12, A20)

**Files:**
- Modify: `client/src/features/learning/ChatPanel.tsx`
- Test: `client/src/features/learning/ChatPanel.test.tsx`

- [ ] **Step 1: Write failing tests in ChatPanel.test.tsx**

Add the following test suite to `client/src/features/learning/ChatPanel.test.tsx`:
```typescript
describe("ChatPanel topic title, repeated prefill, and streaming composer", () => {
	beforeEach(() => {
		mocks.capability = true;
		mocks.hook.messages = [];
		mocks.hook.isStreaming = false;
		mocks.hook.error = null;
		mocks.hook.webSearchEnabled = false;
		mocks.hook.streamingStatus = null;
		mocks.hook.streamingWarning = null;
		mocks.hook.sendMessage.mockReset();
		mocks.hook.clearChat.mockReset();
		mocks.hook.resetChat.mockReset();
		mocks.hook.stopStreaming.mockReset();
		mocks.hook.setWebSearchEnabled.mockReset();
	});

	it("renders default title when topicTitle is not provided", () => {
		render(
			<ChatPanel
				isOpen={true}
				onClose={vi.fn()}
				sessionId="session-1"
				nodeId="node-1"
			/>,
		);
		expect(
			screen.getByRole("heading", { name: "Ask about this concept" }),
		).toBeInTheDocument();
	});

	it("renders the specific topic title in the header when topicTitle is provided", () => {
		render(
			<ChatPanel
				isOpen={true}
				onClose={vi.fn()}
				sessionId="session-1"
				nodeId="node-1"
				topicTitle="Gradient Descent Fundamentals"
			/>,
		);
		const heading = screen.getByRole("heading", {
			name: "Chat: Gradient Descent Fundamentals",
		});
		expect(heading).toBeInTheDocument();
		expect(heading).toHaveAttribute(
			"title",
			"Chat: Gradient Descent Fundamentals",
		);
	});

	it("applies prefillMessage, calls onPrefillConsumed, and supports repeated prefill of the exact same question", () => {
		const handleConsumed = vi.fn();
		const { rerender } = render(
			<ChatPanel
				isOpen={true}
				onClose={vi.fn()}
				sessionId="session-1"
				nodeId="node-1"
				prefillMessage="What is learning rate?"
				onPrefillConsumed={handleConsumed}
			/>,
		);

		const textarea = screen.getByPlaceholderText(
			"Ask a question...",
		) as HTMLTextAreaElement;
		expect(textarea.value).toBe("What is learning rate?");
		expect(handleConsumed).toHaveBeenCalledTimes(1);

		// Parent clears prefillMessage after consumption
		rerender(
			<ChatPanel
				isOpen={true}
				onClose={vi.fn()}
				sessionId="session-1"
				nodeId="node-1"
				prefillMessage=""
				onPrefillConsumed={handleConsumed}
			/>,
		);

		// User edits or clears textarea
		fireEvent.change(textarea, { target: { value: "" } });
		expect(textarea.value).toBe("");

		// User clicks the SAME question again
		rerender(
			<ChatPanel
				isOpen={true}
				onClose={vi.fn()}
				sessionId="session-1"
				nodeId="node-1"
				prefillMessage="What is learning rate?"
				onPrefillConsumed={handleConsumed}
			/>,
		);

		// Must be prefilled again!
		expect(textarea.value).toBe("What is learning rate?");
		expect(handleConsumed).toHaveBeenCalledTimes(2);
	});

	it("resets prefill state when closed so reopening and clicking the same question prefills", () => {
		const handleConsumed = vi.fn();
		const { rerender } = render(
			<ChatPanel
				isOpen={true}
				onClose={vi.fn()}
				sessionId="session-1"
				nodeId="node-1"
				prefillMessage="Why use momentum?"
				onPrefillConsumed={handleConsumed}
			/>,
		);

		const textarea = screen.getByPlaceholderText(
			"Ask a question...",
		) as HTMLTextAreaElement;
		expect(textarea.value).toBe("Why use momentum?");

		// Close panel
		rerender(
			<ChatPanel
				isOpen={false}
				onClose={vi.fn()}
				sessionId="session-1"
				nodeId="node-1"
				prefillMessage=""
				onPrefillConsumed={handleConsumed}
			/>,
		);

		// Reopen panel and click the same question again
		rerender(
			<ChatPanel
				isOpen={true}
				onClose={vi.fn()}
				sessionId="session-1"
				nodeId="node-1"
				prefillMessage="Why use momentum?"
				onPrefillConsumed={handleConsumed}
			/>,
		);

		const reopenedTextarea = screen.getByPlaceholderText(
			"Ask a question...",
		) as HTMLTextAreaElement;
		expect(reopenedTextarea.value).toBe("Why use momentum?");
	});

	it("populates composer when prefill arrives while streaming without sending or interrupting stream", () => {
		mocks.hook.isStreaming = true;
		mocks.hook.messages = [
			{ role: "user", content: "Initial query" },
			{ role: "assistant", content: "Streaming partial response..." },
		];

		const handleConsumed = vi.fn();
		render(
			<ChatPanel
				isOpen={true}
				onClose={vi.fn()}
				sessionId="session-1"
				nodeId="node-1"
				prefillMessage="Followup question while streaming"
				onPrefillConsumed={handleConsumed}
			/>,
		);

		const textarea = screen.getByPlaceholderText(
			"Ask a question...",
		) as HTMLTextAreaElement;
		expect(textarea.value).toBe("Followup question while streaming");
		expect(textarea).toBeDisabled();
		expect(handleConsumed).toHaveBeenCalledTimes(1);
		expect(mocks.hook.sendMessage).not.toHaveBeenCalled();
		expect(
			screen.getByRole("button", { name: "Stop streaming" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Send message" }),
		).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `client/`:
```bash
npm run test -- --run src/features/learning/ChatPanel.test.tsx
```
Expected: FAIL with errors indicating `topicTitle` is not accepted or not rendered, and repeated prefill fails to re-populate `textarea.value`.

- [ ] **Step 3: Update ChatPanel.tsx implementation**

Update `client/src/features/learning/ChatPanel.tsx`:
1. Add `topicTitle?: string` to `ChatPanelProps`:
```typescript
interface ChatPanelProps {
	isOpen: boolean;
	onClose: () => void;
	sessionId: string;
	nodeId: string;
	topicTitle?: string;
	selectedHeadingIds?: string[];
	onClearHeadings?: () => void;
	isCourseComplete?: boolean;
	/** Width of the panel in percentage (25-38) */
	widthPercent?: number;
	/** When set, paste this value into the input and focus the textarea */
	prefillMessage?: string;
	/** Called after the prefillMessage has been applied to the input */
	onPrefillConsumed?: () => void;
}
```

2. Accept `topicTitle` in `ChatPanel` parameters:
```typescript
export function ChatPanel({
	isOpen,
	onClose,
	sessionId,
	nodeId,
	topicTitle,
	selectedHeadingIds = [],
	onClearHeadings = () => {},
	isCourseComplete = false,
	widthPercent = 25,
	prefillMessage,
	onPrefillConsumed,
}: ChatPanelProps) {
```

3. Fix the repeated prefill bug and close-state reset in `ChatPanel.tsx`:
```typescript
	// Reset input and prefill tracking when panel closes (during render to avoid effect state cascade)
	if (isOpen !== prevIsOpen) {
		setPrevIsOpen(isOpen);
		if (!isOpen) {
			setInput("");
			setLastPrefill(null);
		}
	}
...
	// Apply prefill message from curiosity questions (or other callers).
	// Uses the render-time derivation pattern (not useEffect) to avoid cascading renders.
	const [lastPrefill, setLastPrefill] = useState<string | null>(null);
	if (prefillMessage && prefillMessage !== lastPrefill) {
		setLastPrefill(prefillMessage);
		setInput(prefillMessage);
		onPrefillConsumed?.();
	} else if (!prefillMessage && lastPrefill !== null) {
		setLastPrefill(null);
	}
```

4. Render `topicTitle` in the header:
```typescript
					{/* Header */}
					<div className="flex items-center justify-between px-4 py-3 border-b">
						<div className="flex items-center gap-2 min-w-0">
							<MessageCircle className="h-5 w-5 text-(--cyber-yellow) shrink-0" />
							<h2
								id="chat-panel-title"
								className="font-semibold text-sm truncate"
								title={
									topicTitle
										? `Chat: ${topicTitle}`
										: "Ask about this concept"
								}
							>
								{topicTitle
									? `Chat: ${topicTitle}`
									: "Ask about this concept"}
							</h2>
						</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run from `client/`:
```bash
npm run test -- --run src/features/learning/ChatPanel.test.tsx
```
Expected: PASS (All tests in `ChatPanel.test.tsx` pass).

- [ ] **Step 5: Commit**

```bash
git add client/src/features/learning/ChatPanel.tsx client/src/features/learning/ChatPanel.test.tsx
git commit -m "feat(learning): add topic title display and repeated prefill support to ChatPanel"
```

---

### Task 3: Targeted Stream Lifecycle, Storage Key Isolation, and Non-Clearing Completion in useConceptChat (A12, A20)

**Files:**
- Modify: `client/src/features/learning/useConceptChat.ts`
- Test: `client/src/features/learning/useConceptChat.test.ts`

- [ ] **Step 1: Write failing tests in useConceptChat.test.ts**

Add the following tests to `client/src/features/learning/useConceptChat.test.ts`:
```typescript
  it('aborts active stream, resets streaming state, and loads destination conversation when nodeId changes', async () => {
    let abortSignalCaptured: AbortSignal | undefined;
    streamConceptChatMock.mockImplementation(async (params: { signal?: AbortSignal }) => {
      abortSignalCaptured = params.signal;
      // Keep stream pending indefinitely
      await new Promise(() => {});
    });

    localStorage.setItem(
      storageKey('sess-1', 'node-2'),
      JSON.stringify({
        messages: [{ role: 'assistant', content: 'Node 2 preserved history' }],
        lastPromptTimestamp: Date.now(),
        webSearchEnabled: false,
      }),
    );

    const { result, rerender } = renderHook(
      ({ nodeId }: { nodeId: string }) => useConceptChat('sess-1', nodeId),
      { initialProps: { nodeId: 'node-1' } },
    );

    let sendPromise: Promise<void> = Promise.resolve();
    act(() => {
      sendPromise = result.current.sendMessage('Stream question on node 1', []);
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(true);
    });

    expect(abortSignalCaptured?.aborted).toBe(false);

    // Retarget to node-2
    act(() => {
      rerender({ nodeId: 'node-2' });
    });

    expect(abortSignalCaptured?.aborted).toBe(true);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages).toEqual([
      { role: 'assistant', content: 'Node 2 preserved history' },
    ]);
  });

  it('never saves aborted stream output from previous node into new node storage', async () => {
    let triggerDelta!: (text: string) => void;
    streamConceptChatMock.mockImplementation(async (params: { onDelta: (t: string) => void; signal?: AbortSignal }) => {
      triggerDelta = params.onDelta;
      await new Promise(() => {});
    });

    const { result, rerender } = renderHook(
      ({ nodeId }: { nodeId: string }) => useConceptChat('sess-1', nodeId),
      { initialProps: { nodeId: 'node-1' } },
    );

    act(() => {
      result.current.sendMessage('Q1', []);
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(true);
    });

    // Retarget to node-2
    act(() => {
      rerender({ nodeId: 'node-2' });
    });

    // Late delta from aborted stream should not corrupt node-2 storage
    if (triggerDelta) {
      act(() => {
        try {
          triggerDelta('Late delta');
        } catch {
          // ignore
        }
      });
    }

    const node2Raw = localStorage.getItem(storageKey('sess-1', 'node-2'));
    if (node2Raw) {
      const parsed = JSON.parse(node2Raw);
      expect(parsed.messages.some((m: ConceptChatMessage) => m.content.includes('Late delta'))).toBe(false);
    }
  });

  it('retains stored chat history when isCourseComplete is false or omitted', () => {
    localStorage.setItem(
      storageKey('sess-1', 'node-1'),
      JSON.stringify({
        messages: [{ role: 'user', content: 'Saved question' }],
        lastPromptTimestamp: Date.now(),
        webSearchEnabled: false,
      }),
    );

    const { result } = renderHook(() =>
      useConceptChat('sess-1', 'node-1', false),
    );

    expect(result.current.messages).toEqual([
      { role: 'user', content: 'Saved question' },
    ]);
    expect(localStorage.getItem(storageKey('sess-1', 'node-1'))).not.toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run from `client/`:
```bash
npm run test -- --run src/features/learning/useConceptChat.test.ts
```
Expected: FAIL on stream retargeting and storage key isolation tests.

- [ ] **Step 3: Update useConceptChat.ts implementation**

In `client/src/features/learning/useConceptChat.ts`:
1. Update `saveToStorage` to accept an explicit `targetNodeId?: string`:
```typescript
	/** Save messages to per-node storage key using current or explicit target nodeId. */
	const saveToStorage = useCallback(
		(
			msgs: ConceptChatMessage[],
			timestamp: number,
			targetNodeId?: string,
		) => {
			try {
				const sid = sessionIdRef.current;
				const nid = targetNodeId ?? nodeIdRef.current;
				if (!sid || !nid) return;
				const data: StoredChat = {
					messages: msgs,
					lastPromptTimestamp: timestamp,
					webSearchEnabled: webSearchEnabledRef.current,
				};
				localStorage.setItem(
					getStorageKey(sid, nid),
					JSON.stringify(data),
				);
			} catch (e) {
				console.error("Failed to save chat to storage:", e);
			}
		},
		[],
	);
```

2. In `sendMessage`:
Pass `currentNodeId` explicitly to every `saveToStorage` call, and check `controller.signal.aborted` before saving:
```typescript
			// Capture current IDs at call time for the API request
			const currentSessionId = sessionIdRef.current;
			const currentNodeId = nodeIdRef.current;

			// Append user message immediately
			const userMessage: ConceptChatMessage = {
				role: "user",
				content: trimmed,
			};

			let historyForRequest: ConceptChatMessage[] = [];
			const timestamp = Date.now();

			const updatedWithUser = [...messagesRef.current, userMessage];
			historyForRequest = updatedWithUser.slice(-MAX_HISTORY_MESSAGES);
			messagesRef.current = updatedWithUser;
			saveToStorage(updatedWithUser, timestamp, currentNodeId);
			setMessages(updatedWithUser);
```
And inside `onSearch` and `onDelta`:
```typescript
					onSearch: (search) => {
						if (controller.signal.aborted) return;
						setStreamingSearch(search);
						setMessages((prev) => {
							const updated = [...prev];
							const last = updated[updated.length - 1];
							if (last && last.role === "assistant") {
								updated[updated.length - 1] = {
									...last,
									search,
								};
							}
							saveToStorage(updated, timestamp, currentNodeId);
							return updated;
						});
					},
					onDelta: (delta) => {
						if (controller.signal.aborted) return;
						setMessages((prev) => {
							const updated = [...prev];
							const last = updated[updated.length - 1];
							if (last && last.role === "assistant") {
								updated[updated.length - 1] = {
									...last,
									content: last.content + delta,
								};
							}
							saveToStorage(updated, timestamp, currentNodeId);
							return updated;
						});
					},
```
And in `catch`:
```typescript
			} catch (err) {
				if (controller.signal.aborted) return;
				const errorMsg =
					err instanceof Error ? err.message : "Chat request failed";
				setError(errorMsg);
				// Remove empty assistant placeholder on error
				setMessages((prev) => {
					const last = prev[prev.length - 1];
					const updated =
						last?.role === "assistant" && !last.content
							? prev.slice(0, -1)
							: prev;
					saveToStorage(updated, timestamp, currentNodeId);
					return updated;
				});
			}
```

3. In the topic/session change effect (lines 229-245):
Ensure old abort controller is aborted immediately when `nodeId` or `sessionId` changes:
```typescript
	// Sync state when topic, session, or completion state changes
	useEffect(() => {
		if (abortRef.current) {
			abortRef.current.abort();
			abortRef.current = null;
		}
		const loaded = loadStoredChat();
		setMessages(loaded.messages);
		setWebSearchEnabledState(loaded.webSearchEnabled);
		webSearchEnabledRef.current = loaded.webSearchEnabled;
		setStreamingStatus(null);
		setStreamingWarning(null);
		setStreamingSearch(null);
		setError(null);
		setIsStreaming(false);
		stopStreamingCtx();
	}, [sessionId, nodeId, isCourseComplete, loadStoredChat, stopStreamingCtx]);
```

- [ ] **Step 4: Run test to verify it passes**

Run from `client/`:
```bash
npm run test -- --run src/features/learning/useConceptChat.test.ts
```
Expected: PASS (All 12 tests in `useConceptChat.test.ts` pass).

- [ ] **Step 5: Commit**

```bash
git add client/src/features/learning/useConceptChat.ts client/src/features/learning/useConceptChat.test.ts
git commit -m "fix(learning): isolate storage keys and abort previous streams on concept chat retarget"
```

---

### Task 4: Explicit Concept Chat Controller Hook `useConceptChatPanel` (A11, A12, A13, A20)

**Files:**
- Create: `client/src/features/learning/useConceptChatPanel.ts`
- Create: `client/src/features/learning/useConceptChatPanel.test.ts`

- [ ] **Step 1: Write failing test in useConceptChatPanel.test.ts**

Create `client/src/features/learning/useConceptChatPanel.test.ts`:
```typescript
/**
 * ============================================================================
 * FILE: useConceptChatPanel.test.ts
 * LOCATION: client/src/features/learning/useConceptChatPanel.test.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Tests useConceptChatPanel explicit controller hook for chat open/close,
 *    topic ownership persistence, carousel navigation isolation, retargeting,
 *    heading scoping, prefill consumption, and width clamping.
 *
 * ROLE IN PROJECT:
 *    Guards A11, A12, A13, A20 chat panel controller logic across
 *    LearningPathContainer and RevisionPage.
 *
 * USAGE:
 *    npm run test -- --run src/features/learning/useConceptChatPanel.test.ts
 * ============================================================================
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	useConceptChatPanel,
	CHAT_MIN_PERCENT,
	CHAT_MAX_PERCENT,
} from "./useConceptChatPanel";

describe("useConceptChatPanel", () => {
	it("initializes with closed panel, default width 25, and empty prefill", () => {
		const { result } = renderHook(() =>
			useConceptChatPanel({
				activeTopicId: "topic-1",
				activeTopicTitle: "Topic 1",
			}),
		);

		expect(result.current.isOpen).toBe(false);
		expect(result.current.chatWidthPercent).toBe(CHAT_MIN_PERCENT);
		expect(result.current.selectedHeadingIds).toEqual([]);
		expect(result.current.prefillMessage).toBe("");
	});

	it("captures activeTopicId and title on openChat without target", () => {
		const { result } = renderHook(() =>
			useConceptChatPanel({
				activeTopicId: "topic-1",
				activeTopicTitle: "Topic 1",
			}),
		);

		act(() => {
			result.current.openChat();
		});

		expect(result.current.isOpen).toBe(true);
		expect(result.current.chatNodeId).toBe("topic-1");
		expect(result.current.chatTopicTitle).toBe("Topic 1");
	});

	it("maintains conversation ownership when carousel navigates (activeTopicId changes alone)", () => {
		const { result, rerender } = renderHook(
			({ topicId, topicTitle }) =>
				useConceptChatPanel({
					activeTopicId: topicId,
					activeTopicTitle: topicTitle,
				}),
			{
				initialProps: { topicId: "topic-1", topicTitle: "Topic 1" },
			},
		);

		act(() => {
			result.current.openChat();
		});

		expect(result.current.chatNodeId).toBe("topic-1");

		// Carousel slide advances to topic-2
		rerender({ topicId: "topic-2", topicTitle: "Topic 2" });

		// Open chat must remain attached to topic-1!
		expect(result.current.chatNodeId).toBe("topic-1");
		expect(result.current.chatTopicTitle).toBe("Topic 1");
	});

	it("retargets explicitly when openChat, askQuestion, or retargetTopic specifies a target node", () => {
		const { result } = renderHook(() =>
			useConceptChatPanel({
				activeTopicId: "topic-1",
				activeTopicTitle: "Topic 1",
			}),
		);

		act(() => {
			result.current.openChat("topic-1", "Topic 1");
		});

		expect(result.current.chatNodeId).toBe("topic-1");

		// Explicit retarget to topic-2
		act(() => {
			result.current.openChat("topic-2", "Topic 2");
		});

		expect(result.current.chatNodeId).toBe("topic-2");
		expect(result.current.chatTopicTitle).toBe("Topic 2");
	});

	it("clears selected heading IDs on explicit retargeting to a different topic", () => {
		const { result } = renderHook(() =>
			useConceptChatPanel({
				activeTopicId: "topic-1",
				activeTopicTitle: "Topic 1",
			}),
		);

		act(() => {
			result.current.openChat("topic-1", "Topic 1");
			result.current.toggleHeadingChat("heading-a", "topic-1", "Topic 1");
		});

		expect(result.current.selectedHeadingIds).toEqual(["heading-a"]);

		// Retarget to topic-2 with heading-b
		act(() => {
			result.current.toggleHeadingChat("heading-b", "topic-2", "Topic 2");
		});

		expect(result.current.chatNodeId).toBe("topic-2");
		expect(result.current.selectedHeadingIds).toEqual(["heading-b"]);
	});

	it("populates prefillMessage and opens chat on askQuestion, and clears on consumePrefill", () => {
		const { result } = renderHook(() =>
			useConceptChatPanel({
				activeTopicId: "topic-1",
				activeTopicTitle: "Topic 1",
			}),
		);

		act(() => {
			result.current.askQuestion("What is overfitting?", "topic-1", "Topic 1");
		});

		expect(result.current.isOpen).toBe(true);
		expect(result.current.prefillMessage).toBe("What is overfitting?");
		expect(result.current.chatNodeId).toBe("topic-1");

		act(() => {
			result.current.consumePrefill();
		});

		expect(result.current.prefillMessage).toBe("");

		// Repeated call with the exact same question
		act(() => {
			result.current.askQuestion("What is overfitting?", "topic-1", "Topic 1");
		});

		expect(result.current.prefillMessage).toBe("What is overfitting?");
	});

	it("clamps chatWidthPercent strictly between CHAT_MIN_PERCENT (25) and CHAT_MAX_PERCENT (38)", () => {
		const { result } = renderHook(() => useConceptChatPanel());

		act(() => {
			result.current.setChatWidthPercent(10);
		});
		expect(result.current.chatWidthPercent).toBe(CHAT_MIN_PERCENT);

		act(() => {
			result.current.setChatWidthPercent(50);
		});
		expect(result.current.chatWidthPercent).toBe(CHAT_MAX_PERCENT);

		act(() => {
			result.current.adjustChatWidth(4); // 38 -> clamped 38
		});
		expect(result.current.chatWidthPercent).toBe(CHAT_MAX_PERCENT);

		act(() => {
			result.current.adjustChatWidth(-20); // 38 - 20 = 18 -> clamped 25
		});
		expect(result.current.chatWidthPercent).toBe(CHAT_MIN_PERCENT);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `client/`:
```bash
npm run test -- --run src/features/learning/useConceptChatPanel.test.ts
```
Expected: FAIL with "Cannot find module './useConceptChatPanel'".

- [ ] **Step 3: Implement useConceptChatPanel.ts**

Create `client/src/features/learning/useConceptChatPanel.ts`:
```typescript
/**
 * ============================================================================
 * FILE: useConceptChatPanel.ts
 * LOCATION: client/src/features/learning/useConceptChatPanel.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Headless controller managing concept chat panel state: open/close,
 *    topic ownership persistence, carousel navigation isolation, explicit
 *    retargeting, heading context scoping, curiosity prefill, and width clamping.
 *
 * ROLE IN PROJECT:
 *    Shared controller between LearningPathContainer and RevisionPage.
 *    Decouples chat lifecycle from carousel swipe and generation mutations.
 *
 * KEY COMPONENTS:
 *    - useConceptChatPanel: Primary exported hook
 *    - CHAT_MIN_PERCENT: 25% minimum width
 *    - CHAT_MAX_PERCENT: 38% maximum width
 *
 * USAGE:
 *    ```tsx
 *    const chat = useConceptChatPanel({
 *      sessionId,
 *      activeTopicId: currentNode?.id,
 *      activeTopicTitle: currentNode?.title,
 *    });
 *    ```
 * ============================================================================
 */

import { useState, useCallback, useRef, useEffect } from "react";

export const CHAT_MIN_PERCENT = 25;
export const CHAT_MAX_PERCENT = 38;

export interface UseConceptChatPanelOptions {
	sessionId?: string;
	activeTopicId?: string;
	activeTopicTitle?: string;
	initialWidthPercent?: number;
}

export interface UseConceptChatPanelResult {
	isOpen: boolean;
	chatNodeId: string;
	chatTopicTitle: string;
	chatWidthPercent: number;
	selectedHeadingIds: string[];
	prefillMessage: string;
	openChat: (targetNodeId?: string, targetTopicTitle?: string) => void;
	closeChat: () => void;
	askQuestion: (
		question: string,
		targetNodeId?: string,
		targetTopicTitle?: string,
	) => void;
	consumePrefill: () => void;
	toggleHeadingChat: (
		headingId: string,
		targetNodeId?: string,
		targetTopicTitle?: string,
	) => void;
	clearHeadings: () => void;
	setChatWidthPercent: (percent: number) => void;
	adjustChatWidth: (deltaPercent: number) => void;
	retargetTopic: (nodeId: string, topicTitle?: string) => void;
}

export function useConceptChatPanel(
	options: UseConceptChatPanelOptions = {},
): UseConceptChatPanelResult {
	const { activeTopicId = "", activeTopicTitle = "", initialWidthPercent = 25 } =
		options;

	const [isOpen, setIsOpen] = useState(false);
	const [chatNodeId, setChatNodeId] = useState("");
	const [chatTopicTitle, setChatTopicTitle] = useState("");
	const [chatWidthPercent, setChatWidthPercentState] = useState(() =>
		Math.max(
			CHAT_MIN_PERCENT,
			Math.min(CHAT_MAX_PERCENT, initialWidthPercent),
		),
	);
	const [selectedHeadingIds, setSelectedHeadingIds] = useState<string[]>([]);
	const [prefillMessage, setPrefillMessage] = useState("");

	const activeTopicIdRef = useRef(activeTopicId);
	const activeTopicTitleRef = useRef(activeTopicTitle);
	useEffect(() => {
		activeTopicIdRef.current = activeTopicId;
	}, [activeTopicId]);
	useEffect(() => {
		activeTopicTitleRef.current = activeTopicTitle;
	}, [activeTopicTitle]);

	const setChatWidthPercent = useCallback((percent: number) => {
		setChatWidthPercentState(
			Math.max(CHAT_MIN_PERCENT, Math.min(CHAT_MAX_PERCENT, percent)),
		);
	}, []);

	const adjustChatWidth = useCallback((deltaPercent: number) => {
		setChatWidthPercentState((prev) =>
			Math.max(
				CHAT_MIN_PERCENT,
				Math.min(CHAT_MAX_PERCENT, prev + deltaPercent),
			),
		);
	}, []);

	const retargetTopic = useCallback(
		(nodeId: string, topicTitle?: string) => {
			setChatNodeId(nodeId);
			setChatTopicTitle(topicTitle ?? "");
			setSelectedHeadingIds([]);
		},
		[],
	);

	const openChat = useCallback(
		(targetNodeId?: string, targetTopicTitle?: string) => {
			const destinationNodeId =
				targetNodeId || chatNodeId || activeTopicIdRef.current;
			const destinationTopicTitle =
				targetTopicTitle ||
				(targetNodeId ? "" : chatTopicTitle || activeTopicTitleRef.current);

			if (destinationNodeId !== chatNodeId) {
				retargetTopic(destinationNodeId, destinationTopicTitle);
			} else if (targetTopicTitle && !chatTopicTitle) {
				setChatTopicTitle(targetTopicTitle);
			}

			setIsOpen(true);
		},
		[chatNodeId, chatTopicTitle, retargetTopic],
	);

	const closeChat = useCallback(() => {
		setIsOpen(false);
	}, []);

	const askQuestion = useCallback(
		(
			question: string,
			targetNodeId?: string,
			targetTopicTitle?: string,
		) => {
			const destinationNodeId =
				targetNodeId || chatNodeId || activeTopicIdRef.current;
			const destinationTopicTitle =
				targetTopicTitle ||
				(targetNodeId ? "" : chatTopicTitle || activeTopicTitleRef.current);

			if (destinationNodeId !== chatNodeId) {
				retargetTopic(destinationNodeId, destinationTopicTitle);
			} else if (targetTopicTitle && !chatTopicTitle) {
				setChatTopicTitle(targetTopicTitle);
			}

			setPrefillMessage(question);
			setIsOpen(true);
		},
		[chatNodeId, chatTopicTitle, retargetTopic],
	);

	const consumePrefill = useCallback(() => {
		setPrefillMessage("");
	}, []);

	const toggleHeadingChat = useCallback(
		(
			headingId: string,
			targetNodeId?: string,
			targetTopicTitle?: string,
		) => {
			const destinationNodeId =
				targetNodeId || chatNodeId || activeTopicIdRef.current;
			const destinationTopicTitle =
				targetTopicTitle ||
				(targetNodeId ? "" : chatTopicTitle || activeTopicTitleRef.current);

			if (destinationNodeId !== chatNodeId) {
				setChatNodeId(destinationNodeId);
				setChatTopicTitle(destinationTopicTitle);
				setSelectedHeadingIds([headingId]);
			} else {
				setSelectedHeadingIds((prev) =>
					prev.includes(headingId)
						? prev.filter((id) => id !== headingId)
						: [...prev, headingId],
				);
			}

			setIsOpen(true);
		},
		[chatNodeId, chatTopicTitle],
	);

	const clearHeadings = useCallback(() => {
		setSelectedHeadingIds([]);
	}, []);

	return {
		isOpen,
		chatNodeId,
		chatTopicTitle,
		chatWidthPercent,
		selectedHeadingIds,
		prefillMessage,
		openChat,
		closeChat,
		askQuestion,
		consumePrefill,
		toggleHeadingChat,
		clearHeadings,
		setChatWidthPercent,
		adjustChatWidth,
		retargetTopic,
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `client/`:
```bash
npm run test -- --run src/features/learning/useConceptChatPanel.test.ts
```
Expected: PASS (All 7 tests in `useConceptChatPanel.test.ts` pass).

- [ ] **Step 5: Commit**

```bash
git add client/src/features/learning/useConceptChatPanel.ts client/src/features/learning/useConceptChatPanel.test.ts
git commit -m "feat(learning): implement useConceptChatPanel headless controller hook"
```

---

### Task 5: Reusable Split/Overlay Chat Layout `ConceptChatLayout` (A13)

**Files:**
- Create: `client/src/features/learning/ConceptChatLayout.tsx`
- Create: `client/src/features/learning/ConceptChatLayout.test.tsx`

- [ ] **Step 1: Write failing test in ConceptChatLayout.test.tsx**

Create `client/src/features/learning/ConceptChatLayout.test.tsx`:
```typescript
/**
 * ============================================================================
 * FILE: ConceptChatLayout.test.tsx
 * LOCATION: client/src/features/learning/ConceptChatLayout.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Tests ConceptChatLayout split desktop mode (>= 768px), keyboard/mouse
 *    separator resizing, and responsive sub-768px full-width overlay mode.
 *
 * ROLE IN PROJECT:
 *    Guards A13 layout boundaries, independent scrolling, and responsive safeguards.
 *
 * USAGE:
 *    npm run test -- --run src/features/learning/ConceptChatLayout.test.tsx
 * ============================================================================
 */

import type { ReactNode, ComponentPropsWithoutRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConceptChatLayout } from "./ConceptChatLayout";

vi.mock("framer-motion", () => ({
	motion: {
		div: ({
			children,
			...props
		}: ComponentPropsWithoutRef<"div">) => <div {...props}>{children}</div>,
	},
	AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

function mockMatchMedia(matches: boolean) {
	window.matchMedia = vi.fn().mockImplementation((query: string) => ({
		matches,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	}));
}

describe("ConceptChatLayout", () => {
	beforeEach(() => {
		mockMatchMedia(true); // Desktop by default
	});

	it("renders main content full width when chat is closed", () => {
		render(
			<ConceptChatLayout
				isChatOpen={false}
				chatWidthPercent={25}
				onChatWidthChange={vi.fn()}
				onCloseChat={vi.fn()}
				chatPanel={<div data-testid="chat-panel">Chat</div>}
			>
				<div data-testid="main-content">Course Content</div>
			</ConceptChatLayout>,
		);

		expect(screen.getByTestId("main-content")).toBeInTheDocument();
		expect(
			screen.queryByRole("separator", { name: "Resize chat panel" }),
		).not.toBeInTheDocument();
	});

	it("renders split view with resize separator on desktop (>= 768px) when chat is open", () => {
		mockMatchMedia(true);
		render(
			<ConceptChatLayout
				isChatOpen={true}
				chatWidthPercent={30}
				onChatWidthChange={vi.fn()}
				onCloseChat={vi.fn()}
				chatPanel={<div data-testid="chat-panel">Chat Panel</div>}
			>
				<div data-testid="main-content">Course Content</div>
			</ConceptChatLayout>,
		);

		expect(screen.getByTestId("main-content")).toBeInTheDocument();
		expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
		const separator = screen.getByRole("separator", {
			name: "Resize chat panel",
		});
		expect(separator).toBeInTheDocument();
		expect(separator).toHaveAttribute("aria-orientation", "vertical");
		expect(separator).toHaveAttribute("aria-valuenow", "30");
	});

	it("supports keyboard resizing on the desktop separator with bounds clamping", () => {
		mockMatchMedia(true);
		const handleChange = vi.fn();
		render(
			<ConceptChatLayout
				isChatOpen={true}
				chatWidthPercent={25}
				onChatWidthChange={handleChange}
				onCloseChat={vi.fn()}
				chatPanel={<div data-testid="chat-panel">Chat Panel</div>}
			>
				<div>Course Content</div>
			</ConceptChatLayout>,
		);

		const separator = screen.getByRole("separator", {
			name: "Resize chat panel",
		});

		// ArrowLeft increases width by 2%
		fireEvent.keyDown(separator, { key: "ArrowLeft" });
		expect(handleChange).toHaveBeenCalledWith(27);

		// ArrowRight decreases width by 2%
		fireEvent.keyDown(separator, { key: "ArrowRight" });
		expect(handleChange).toHaveBeenCalledWith(23); // Clamped by handler to min 25
	});

	it("renders full-width chat overlay on narrow viewports (< 768px) without desktop resize separator", () => {
		mockMatchMedia(false); // Mobile viewport
		render(
			<ConceptChatLayout
				isChatOpen={true}
				chatWidthPercent={25}
				onChatWidthChange={vi.fn()}
				onCloseChat={vi.fn()}
				chatPanel={<div data-testid="chat-panel">Mobile Chat</div>}
			>
				<div data-testid="main-content">Course Content Behind Overlay</div>
			</ConceptChatLayout>,
		);

		expect(screen.getByTestId("main-content")).toBeInTheDocument();
		expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
		expect(
			screen.queryByRole("separator", { name: "Resize chat panel" }),
		).not.toBeInTheDocument();
		expect(screen.getByTestId("concept-chat-overlay")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `client/`:
```bash
npm run test -- --run src/features/learning/ConceptChatLayout.test.tsx
```
Expected: FAIL with "Cannot find module './ConceptChatLayout'".

- [ ] **Step 3: Implement ConceptChatLayout.tsx**

Create `client/src/features/learning/ConceptChatLayout.tsx`:
```typescript
/**
 * ============================================================================
 * FILE: ConceptChatLayout.tsx
 * LOCATION: client/src/features/learning/ConceptChatLayout.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Bounded container providing responsive split layout for desktop (>= 768px)
 *    and full-width overlay mode for narrow screens (< 768px). Supports
 *    mouse drag and keyboard separator controls with strict [25, 38] clamping.
 *
 * ROLE IN PROJECT:
 *    Replaces unconstrained in-flow chat placement across LearningPathContainer
 *    and RevisionPage. Ensures chat never renders beneath content or bottom-left.
 *
 * KEY COMPONENTS:
 *    - ConceptChatLayout: Primary exported component
 *    - useIsDesktop: Responsive viewport listener
 *
 * USAGE:
 *    ```tsx
 *    <ConceptChatLayout
 *      isChatOpen={isOpen}
 *      chatWidthPercent={width}
 *      onChatWidthChange={setWidth}
 *      onCloseChat={close}
 *      chatPanel={<ChatPanel ... />}
 *    >
 *      <CourseContent />
 *    </ConceptChatLayout>
 *    ```
 * ============================================================================
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHAT_MIN_PERCENT, CHAT_MAX_PERCENT } from "./useConceptChatPanel";

export interface ConceptChatLayoutProps {
	children: ReactNode;
	chatPanel: ReactNode;
	isChatOpen: boolean;
	chatWidthPercent: number;
	onChatWidthChange: (percent: number) => void;
	onCloseChat: () => void;
	className?: string;
	contentClassName?: string;
}

function useIsDesktop(breakpoint = 768): boolean {
	const [isDesktop, setIsDesktop] = useState(() => {
		if (typeof window === "undefined" || !window.matchMedia) return true;
		return window.matchMedia(`(min-width: ${breakpoint}px)`).matches;
	});

	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;
		const media = window.matchMedia(`(min-width: ${breakpoint}px)`);
		const update = (e: MediaQueryListEvent | MediaQueryList) => {
			setIsDesktop(e.matches);
		};
		update(media);
		if (media.addEventListener) {
			media.addEventListener("change", update);
			return () => media.removeEventListener("change", update);
		} else {
			media.addListener(update);
			return () => media.removeListener(update);
		}
	}, [breakpoint]);

	return isDesktop;
}

export function ConceptChatLayout({
	children,
	chatPanel,
	isChatOpen,
	chatWidthPercent,
	onChatWidthChange,
	onCloseChat: _onCloseChat,
	className,
	contentClassName,
}: ConceptChatLayoutProps) {
	const isDesktop = useIsDesktop(768);
	const containerRef = useRef<HTMLDivElement>(null);
	const isResizingRef = useRef(false);

	const handleResizeStart = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		isResizingRef.current = true;
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
	}, []);

	const handleResizeMove = useCallback(
		(e: MouseEvent) => {
			if (!isResizingRef.current || !containerRef.current) return;
			const containerRect = containerRef.current.getBoundingClientRect();
			const containerWidth = containerRect.width;
			const mouseX = e.clientX - containerRect.left;
			const newPercent = ((containerWidth - mouseX) / containerWidth) * 100;
			const clamped = Math.max(
				CHAT_MIN_PERCENT,
				Math.min(CHAT_MAX_PERCENT, newPercent),
			);
			onChatWidthChange(clamped);
		},
		[onChatWidthChange],
	);

	const handleResizeEnd = useCallback(() => {
		isResizingRef.current = false;
		document.body.style.cursor = "";
		document.body.style.userSelect = "";
	}, []);

	useEffect(() => {
		const onMouseMove = (e: MouseEvent) => {
			if (isResizingRef.current) handleResizeMove(e);
		};
		const onMouseUp = () => {
			if (isResizingRef.current) handleResizeEnd();
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);

		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
		};
	}, [handleResizeMove, handleResizeEnd]);

	const handleSeparatorKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowLeft") {
			e.preventDefault();
			onChatWidthChange(
				Math.min(CHAT_MAX_PERCENT, chatWidthPercent + 2),
			);
		} else if (e.key === "ArrowRight") {
			e.preventDefault();
			onChatWidthChange(
				Math.max(CHAT_MIN_PERCENT, chatWidthPercent - 2),
			);
		} else if (e.key === "Home") {
			e.preventDefault();
			onChatWidthChange(CHAT_MIN_PERCENT);
		} else if (e.key === "End") {
			e.preventDefault();
			onChatWidthChange(CHAT_MAX_PERCENT);
		}
	};

	return (
		<div
			ref={containerRef}
			className={cn("relative flex w-full h-full overflow-hidden", className)}
		>
			{/* Main Content Area */}
			<motion.div
				className={cn(
					"flex flex-col gap-6 p-4 overflow-y-auto h-full",
					isDesktop && isChatOpen
						? "transition-all"
						: "w-full",
					contentClassName,
				)}
				animate={{
					flex:
						isDesktop && isChatOpen
							? `0 0 ${100 - chatWidthPercent}%`
							: "1 1 100%",
				}}
				transition={{ type: "spring", damping: 30, stiffness: 300 }}
			>
				{children}
			</motion.div>

			{/* Desktop Resize Separator */}
			{isDesktop && isChatOpen && (
				<div
					className="w-1 bg-border hover:bg-(--cyber-yellow) cursor-col-resize shrink-0 transition-colors relative group select-none"
					onMouseDown={handleResizeStart}
					role="separator"
					aria-orientation="vertical"
					aria-label="Resize chat panel"
					aria-valuenow={chatWidthPercent}
					aria-valuemin={CHAT_MIN_PERCENT}
					aria-valuemax={CHAT_MAX_PERCENT}
					tabIndex={0}
					onKeyDown={handleSeparatorKeyDown}
				>
					<div className="absolute inset-y-0 -left-1 -right-1" />
					<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
						<GripVertical className="h-4 w-4 text-muted-foreground" />
					</div>
				</div>
			)}

			{/* Desktop Chat Pane */}
			{isDesktop && chatPanel}

			{/* Mobile Overlay Mode (< 768px) */}
			{!isDesktop && isChatOpen && (
				<div
					data-testid="concept-chat-overlay"
					className="absolute inset-0 z-40 bg-background flex flex-col overflow-hidden"
				>
					{chatPanel}
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `client/`:
```bash
npm run test -- --run src/features/learning/ConceptChatLayout.test.tsx
```
Expected: PASS (All 4 tests in `ConceptChatLayout.test.tsx` pass).

- [ ] **Step 5: Commit**

```bash
git add client/src/features/learning/ConceptChatLayout.tsx client/src/features/learning/ConceptChatLayout.test.tsx
git commit -m "feat(learning): implement ConceptChatLayout split desktop and mobile overlay layout"
```

---

### Task 6: Wire ConceptChatLayout and useConceptChatPanel into LearningPathContainer (A11, A12, A13, A20)

**Files:**
- Modify: `client/src/features/learning/LearningPathContainer.tsx`
- Test: `client/src/features/learning/LearningPathContainer.test.tsx`

- [ ] **Step 1: Write integration and regression tests in LearningPathContainer.test.tsx**

Add the following tests to `client/src/features/learning/LearningPathContainer.test.tsx`:
```typescript
  it('opens chat bound to current topic title, preserves ownership on slide change, and closes on quiz enter', () => {
    const session = {
      id: 'session-1',
      user_id: null,
      query: 'CSS',
      course_title: 'CSS Masterclass',
      total_nodes: 2,
      completed_nodes: 0,
      last_active_node_id: null,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: null,
      generation: { ...generation, stage: 'COMPLETE' as const, can_cancel: false },
      nodes: [
        {
          id: 'n1',
          learning_session_id: 'session-1',
          sequence_index: 0,
          title: 'Selectors Topic',
          content_markdown: 'Content 1',
          status: 'VIEWING_EXPLANATION',
          error_message: null,
          retry_available: false,
          module_status: 'READY',
          quiz: null,
          quiz_set: null,
          quiz_hidden: null,
          quiz_set_hidden: null,
          created_at: '2026-08-01T00:00:00Z',
          updated_at: null,
        },
        {
          id: 'n2',
          learning_session_id: 'session-1',
          sequence_index: 1,
          title: 'Quiz Topic',
          content_markdown: 'Content 2',
          status: 'IN_QUIZ',
          error_message: null,
          retry_available: false,
          module_status: 'READY',
          quiz: null,
          quiz_set: null,
          quiz_hidden: null,
          quiz_set_hidden: null,
          created_at: '2026-08-01T00:00:00Z',
          updated_at: null,
        },
      ],
    } as LearningSessionWithNodes;

    wrap(
      <LearningPathContainer sessionId="session-1" session={session} />,
    );

    const fab = screen.getByRole('button', { name: 'Open concept chat' });
    expect(fab).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify existing tests pass and baseline is ready**

Run from `client/`:
```bash
npm run test -- --run src/features/learning/LearningPathContainer.test.tsx
```
Expected: PASS.

- [ ] **Step 3: Update LearningPathContainer.tsx to reuse layout and controller**

In `client/src/features/learning/LearningPathContainer.tsx`:
1. Import `ConceptChatLayout` and `useConceptChatPanel`:
```typescript
import { ConceptChatLayout } from "./ConceptChatLayout";
import { useConceptChatPanel } from "./useConceptChatPanel";
```

2. Replace inlined chat state (isChatOpen, chatWidthPercent, mouse drag listeners, selectedHeadingIds, prefillMessage, chatNodeId) with `useConceptChatPanel`:
```typescript
	const currentSlideNode = session?.nodes[carouselState.currentIndex];

	const chatPanel = useConceptChatPanel({
		sessionId: activeSessionId,
		activeTopicId: currentSlideNode?.id,
		activeTopicTitle: currentSlideNode?.title,
	});

	const handleAskQuestion = useCallback(
		(question: string) => {
			chatPanel.askQuestion(
				question,
				currentSlideNode?.id,
				currentSlideNode?.title,
			);
		},
		[chatPanel, currentSlideNode?.id, currentSlideNode?.title],
	);

	const handleToggleHeadingChat = useCallback(
		(headingId: string) => {
			chatPanel.toggleHeadingChat(
				headingId,
				currentSlideNode?.id,
				currentSlideNode?.title,
			);
		},
		[chatPanel, currentSlideNode?.id, currentSlideNode?.title],
	);
```

3. Maintain quiz anti-cheat rules:
```typescript
	// Close chat panel automatically when switching to or entering a quiz/feedback node (anti-cheat)
	const isQuizNode =
		currentSlideNode?.status === "IN_QUIZ" ||
		currentSlideNode?.status === "SHOWING_FEEDBACK";

	const effectiveIsChatOpen = chatPanel.isOpen && !isQuizNode;

	const handleProceedToQuiz = useCallback(
		(nodeId: string) => {
			chatPanel.closeChat();
			proceedToQuiz(nodeId);
		},
		[chatPanel, proceedToQuiz],
	);
```
And in `goToSlide`:
```typescript
			if (targetStatus === "IN_QUIZ" || targetStatus === "SHOWING_FEEDBACK") {
				chatPanel.closeChat();
			}
```

4. Replace the outer `div` and inlined resize handle in the render block with `<ConceptChatLayout>`:
```typescript
				<ConceptChatLayout
					isChatOpen={effectiveIsChatOpen}
					chatWidthPercent={chatPanel.chatWidthPercent}
					onChatWidthChange={chatPanel.setChatWidthPercent}
					onCloseChat={chatPanel.closeChat}
					chatPanel={
						<ChatPanel
							isOpen={effectiveIsChatOpen}
							onClose={chatPanel.closeChat}
							sessionId={activeSessionId ?? ""}
							nodeId={chatPanel.chatNodeId}
							topicTitle={chatPanel.chatTopicTitle}
							selectedHeadingIds={chatPanel.selectedHeadingIds}
							onClearHeadings={chatPanel.clearHeadings}
							isCourseComplete={
								session?.nodes &&
								session.nodes.length > 0 &&
								session.nodes.every((n) => n.status === "COMPLETED")
							}
							widthPercent={chatPanel.chatWidthPercent}
							prefillMessage={chatPanel.prefillMessage}
							onPrefillConsumed={chatPanel.consumePrefill}
						/>
					}
				>
					<div className={cn("mx-auto w-full", effectiveIsChatOpen ? "max-w-5xl" : "max-w-6xl")}>
						{/* Header */}
						<header className="text-center">
							<h1 className="text-2xl font-bold">{session.course_title}</h1>
							<p className="text-muted-foreground mt-1">
								{session.completed_nodes} of {session.total_nodes} completed
							</p>
						</header>

						{/* Progress bar using specialized component */}
						<ProgressBar nodes={session.nodes} />

						{/* Mastery celebration overlay */}
						<MasteryCelebration
							active={celebration.active}
							topicTitle={celebration.topicTitle}
							isCourseComplete={celebration.isCourseComplete}
							onComplete={handleCelebrationComplete}
						/>

						{/* Carousel container with single ConceptCard */}
						...
					</div>
				</ConceptChatLayout>
```
And update the chat FAB click handler:
```typescript
		{/* Chat FAB - bottom-right fixed (hidden during quizzes/feedback) */}
		{!effectiveIsChatOpen && !isQuizNode && (
			<button
				onClick={() => {
					chatPanel.openChat(currentSlideNode?.id, currentSlideNode?.title);
				}}
				className="fixed bottom-6 right-6 z-30 h-14 w-14 rounded-full bg-(--cyber-yellow) text-black shadow-lg hover:bg-(--cyber-yellow)/90 transition-colors flex items-center justify-center cursor-pointer"
				aria-label="Open concept chat"
			>
				<MessageCircle className="h-6 w-6" />
			</button>
		)}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `client/`:
```bash
npm run test -- --run src/features/learning/LearningPathContainer.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/learning/LearningPathContainer.tsx client/src/features/learning/LearningPathContainer.test.tsx
git commit -m "refactor(learning): wire ConceptChatLayout and useConceptChatPanel into LearningPathContainer"
```

---

### Task 7: Full Quality Verification and P6 Handoff Report

**Files:**
- Verify: all owned files and suites

- [ ] **Step 1: Run focused P5 test suite**

Run from `client/`:
```bash
npm run test -- --run src/features/learning/curiosityParser.test.ts src/features/learning/CuriositySpark.test.tsx src/features/learning/useConceptChatPanel.test.ts src/features/learning/ConceptChatLayout.test.tsx src/features/learning/ChatPanel.test.tsx src/features/learning/useConceptChat.test.ts src/features/learning/LearningPathContainer.test.tsx
```
Expected: PASS across all 7 test files.

- [ ] **Step 2: Run full client test suite**

Run from `client/`:
```bash
npm run test -- --run
```
Expected: PASS.

- [ ] **Step 3: Run TypeScript compiler diagnostics**

Run from `client/`:
```bash
npm run build
```
Expected: PASS with 0 type errors.

- [ ] **Step 4: Run ESLint**

Run from `client/`:
```bash
npm run lint
```
Expected: PASS with 0 lint errors.

- [ ] **Step 5: Provide Handoff Contract Report for P6**

Report the following exact interface contracts to unblock P6:

#### Reusable Layout: ConceptChatLayout
Location: `client/src/features/learning/ConceptChatLayout.tsx`
Props:
```typescript
export interface ConceptChatLayoutProps {
	children: React.ReactNode;
	chatPanel: React.ReactNode;
	isChatOpen: boolean;
	chatWidthPercent: number;
	onChatWidthChange: (percent: number) => void;
	onCloseChat: () => void;
	className?: string;
	contentClassName?: string;
}
```

#### Reusable Controller: useConceptChatPanel
Location: `client/src/features/learning/useConceptChatPanel.ts`
Hook Signature:
```typescript
export function useConceptChatPanel(
	options?: UseConceptChatPanelOptions,
): UseConceptChatPanelResult;
```
Inputs:
```typescript
export interface UseConceptChatPanelOptions {
	sessionId?: string;
	activeTopicId?: string;
	activeTopicTitle?: string;
	initialWidthPercent?: number; // Defaults to 25
}
```
Outputs:
```typescript
export interface UseConceptChatPanelResult {
	isOpen: boolean;
	chatNodeId: string;
	chatTopicTitle: string;
	chatWidthPercent: number;
	selectedHeadingIds: string[];
	prefillMessage: string;
	openChat: (targetNodeId?: string, targetTopicTitle?: string) => void;
	closeChat: () => void;
	askQuestion: (
		question: string,
		targetNodeId?: string,
		targetTopicTitle?: string,
	) => void;
	consumePrefill: () => void;
	toggleHeadingChat: (
		headingId: string,
		targetNodeId?: string,
		targetTopicTitle?: string,
	) => void;
	clearHeadings: () => void;
	setChatWidthPercent: (percent: number) => void;
	adjustChatWidth: (deltaPercent: number) => void;
	retargetTopic: (nodeId: string, topicTitle?: string) => void;
}
```

#### P6 Integration Policy:
1. `RevisionPage.tsx` wraps its content and chat in `<ConceptChatLayout>`.
2. `RevisionPage.tsx` instantiates `useConceptChatPanel` passing `currentNode?.id` and `currentNode?.title`.
3. In `RevisionConceptCard.tsx`:
   - Pass `onAskQuestion={(q) => chat.askQuestion(q, node.id, node.title)}` to `CuriositySpark`.
   - Pass `selectedHeadingIds={chat.selectedHeadingIds}` and `onToggleHeadingChat={(hId) => chat.toggleHeadingChat(hId, node.id, node.title)}` to heading chat buttons.
4. **CRITICAL PRESERVATION POLICY:** In `RevisionPage.tsx`, do NOT pass `isCourseComplete={revisionSession.status === "completed"}` to `ChatPanel`! Pass `isCourseComplete={false}` (or omit it) so that completed revisions NEVER purge the learner's chat history from localStorage.
