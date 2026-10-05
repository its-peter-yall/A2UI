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
