/**
 * ============================================================================
 * FILE: useConceptChatPanel.test.ts
 * LOCATION: client/src/features/learning/useConceptChatPanel.test.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Tests useConceptChatPanel explicit controller hook for chat open/close,
 *    topic ownership persistence, carousel navigation isolation, retargeting,
 *    heading scoping, prefill consumption, width clamping, and the public
 *    fallback/title-fill paths of openChat, askQuestion, toggleHeadingChat,
 *    and retargetTopic.
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

	it("reuses the existing conversation when openChat is called again without a target", () => {
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
			result.current.openChat("topic-1", "Topic 1");
		});
		act(() => {
			result.current.closeChat();
		});

		// Carousel navigates elsewhere while the panel is closed
		rerender({ topicId: "topic-2", topicTitle: "Topic 2" });

		act(() => {
			result.current.openChat();
		});

		expect(result.current.isOpen).toBe(true);
		expect(result.current.chatNodeId).toBe("topic-1");
		expect(result.current.chatTopicTitle).toBe("Topic 1");
	});

	it("clears the chat title when openChat retargets to a node without a title", () => {
		const { result } = renderHook(() =>
			useConceptChatPanel({
				activeTopicId: "topic-1",
				activeTopicTitle: "Topic 1",
			}),
		);

		act(() => {
			result.current.openChat("topic-1", "Topic 1");
		});
		act(() => {
			result.current.openChat("topic-2");
		});

		expect(result.current.isOpen).toBe(true);
		expect(result.current.chatNodeId).toBe("topic-2");
		expect(result.current.chatTopicTitle).toBe("");
	});

	it("fills a missing chat title when openChat targets the already-owned node and keeps an existing title", () => {
		const { result } = renderHook(() =>
			useConceptChatPanel({
				activeTopicId: "topic-1",
				activeTopicTitle: "Topic 1",
			}),
		);

		// Own the node without a title; the public API stores "" in that case
		act(() => {
			result.current.openChat("topic-1");
		});
		expect(result.current.chatNodeId).toBe("topic-1");
		expect(result.current.chatTopicTitle).toBe("");

		// Same-node open with a title fills the missing title
		act(() => {
			result.current.openChat("topic-1", "Gradient Descent");
		});

		expect(result.current.isOpen).toBe(true);
		expect(result.current.chatNodeId).toBe("topic-1");
		expect(result.current.chatTopicTitle).toBe("Gradient Descent");

		// Same-node open with a title never overwrites an existing title
		act(() => {
			result.current.openChat("topic-1", "Overwrite Attempt");
		});
		expect(result.current.chatTopicTitle).toBe("Gradient Descent");
	});

	it("asks on the existing conversation when askQuestion has no explicit target", () => {
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
			result.current.openChat("topic-1", "Topic 1");
		});

		// Carousel moved; the open conversation must keep ownership
		rerender({ topicId: "topic-2", topicTitle: "Topic 2" });

		act(() => {
			result.current.askQuestion("Follow-up on the open conversation");
		});

		expect(result.current.isOpen).toBe(true);
		expect(result.current.chatNodeId).toBe("topic-1");
		expect(result.current.chatTopicTitle).toBe("Topic 1");
		expect(result.current.prefillMessage).toBe(
			"Follow-up on the open conversation",
		);
	});

	it("asks on the active topic when askQuestion is called before any conversation is open", () => {
		const { result } = renderHook(() =>
			useConceptChatPanel({
				activeTopicId: "topic-1",
				activeTopicTitle: "Topic 1",
			}),
		);

		act(() => {
			result.current.askQuestion("What is overfitting?");
		});

		expect(result.current.isOpen).toBe(true);
		expect(result.current.chatNodeId).toBe("topic-1");
		expect(result.current.chatTopicTitle).toBe("Topic 1");
		expect(result.current.prefillMessage).toBe("What is overfitting?");
	});

	it("clears the chat title when askQuestion retargets to a node without a title", () => {
		const { result } = renderHook(() =>
			useConceptChatPanel({
				activeTopicId: "topic-1",
				activeTopicTitle: "Topic 1",
			}),
		);

		act(() => {
			result.current.openChat("topic-1", "Topic 1");
		});
		act(() => {
			result.current.askQuestion("Question on the new topic", "topic-2");
		});

		expect(result.current.isOpen).toBe(true);
		expect(result.current.chatNodeId).toBe("topic-2");
		expect(result.current.chatTopicTitle).toBe("");
		expect(result.current.prefillMessage).toBe("Question on the new topic");
	});

	it("fills a missing chat title when askQuestion targets the already-owned node", () => {
		const { result } = renderHook(() =>
			useConceptChatPanel({
				activeTopicId: "topic-1",
				activeTopicTitle: "Topic 1",
			}),
		);

		act(() => {
			result.current.askQuestion("First question", "topic-1");
		});
		expect(result.current.chatNodeId).toBe("topic-1");
		expect(result.current.chatTopicTitle).toBe("");

		// Same-node ask with a title fills the missing title
		act(() => {
			result.current.askQuestion(
				"Second question",
				"topic-1",
				"Gradient Descent",
			);
		});

		expect(result.current.isOpen).toBe(true);
		expect(result.current.chatNodeId).toBe("topic-1");
		expect(result.current.chatTopicTitle).toBe("Gradient Descent");
		expect(result.current.prefillMessage).toBe("Second question");
	});

	it("toggles headings on the existing conversation when toggleHeadingChat has no target", () => {
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
			result.current.openChat("topic-1", "Topic 1");
		});

		// Carousel moved; headings stay scoped to the open conversation
		rerender({ topicId: "topic-2", topicTitle: "Topic 2" });

		act(() => {
			result.current.toggleHeadingChat("heading-a");
		});

		expect(result.current.isOpen).toBe(true);
		expect(result.current.chatNodeId).toBe("topic-1");
		expect(result.current.chatTopicTitle).toBe("Topic 1");
		expect(result.current.selectedHeadingIds).toEqual(["heading-a"]);

		// Deselecting the same heading removes it again
		act(() => {
			result.current.toggleHeadingChat("heading-a");
		});
		expect(result.current.selectedHeadingIds).toEqual([]);
	});

	it("targets the active topic when toggleHeadingChat is called before any conversation is open", () => {
		const { result } = renderHook(() =>
			useConceptChatPanel({
				activeTopicId: "topic-1",
				activeTopicTitle: "Topic 1",
			}),
		);

		act(() => {
			result.current.toggleHeadingChat("heading-c");
		});

		expect(result.current.isOpen).toBe(true);
		expect(result.current.chatNodeId).toBe("topic-1");
		expect(result.current.chatTopicTitle).toBe("Topic 1");
		expect(result.current.selectedHeadingIds).toEqual(["heading-c"]);
	});

	it("clears the chat title when toggleHeadingChat retargets to a node without a title", () => {
		const { result } = renderHook(() =>
			useConceptChatPanel({
				activeTopicId: "topic-1",
				activeTopicTitle: "Topic 1",
			}),
		);

		act(() => {
			result.current.openChat("topic-1", "Topic 1");
		});
		act(() => {
			result.current.toggleHeadingChat("heading-b", "topic-2");
		});

		expect(result.current.isOpen).toBe(true);
		expect(result.current.chatNodeId).toBe("topic-2");
		expect(result.current.chatTopicTitle).toBe("");
		expect(result.current.selectedHeadingIds).toEqual(["heading-b"]);
	});

	it("clears the chat title and headings when retargetTopic is called without a topic title", () => {
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
		expect(result.current.chatTopicTitle).toBe("Topic 1");
		expect(result.current.selectedHeadingIds).toEqual(["heading-a"]);

		act(() => {
			result.current.retargetTopic("topic-2");
		});

		expect(result.current.chatNodeId).toBe("topic-2");
		expect(result.current.chatTopicTitle).toBe("");
		expect(result.current.selectedHeadingIds).toEqual([]);
	});
});
