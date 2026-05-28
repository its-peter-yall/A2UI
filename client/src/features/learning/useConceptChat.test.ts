/**
 * ============================================================================
 * FILE: useConceptChat.test.ts
 * LOCATION: client/src/features/learning/useConceptChat.test.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the useConceptChat hook. Verifies message state management,
 *    history capping, streaming behavior, and error handling.
 *
 * ROLE IN PROJECT:
 *    Test coverage for useConceptChat.ts hook.
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react
 *    - Internal: @/features/learning/useConceptChat
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConceptChat } from "./useConceptChat";

// Mock chatApi
const mockStreamConceptChat = vi.fn();
vi.mock("@/lib/chatApi", () => ({
	streamConceptChat: (...args: unknown[]) => mockStreamConceptChat(...args),
}));

// Mock providerSettings
vi.mock("@/lib/providerSettings", () => ({
	getProviderSettings: () => ({
		activeProvider: "openrouter",
		providers: {
			openrouter: { apiKey: "key", model: "model", modelTitle: "Model" },
			generalcompute: { apiKey: "", model: "", modelTitle: "" },
		},
	}),
}));

describe("useConceptChat", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("starts with empty messages", () => {
		const { result } = renderHook(() => useConceptChat("s", "n"));
		expect(result.current.messages).toEqual([]);
		expect(result.current.isStreaming).toBe(false);
		expect(result.current.error).toBeNull();
	});

	it("appends user message immediately on sendMessage", async () => {
		mockStreamConceptChat.mockResolvedValue(undefined);

		const { result } = renderHook(() => useConceptChat("s", "n"));

		await act(async () => {
			await result.current.sendMessage("hello", []);
		});

		expect(result.current.messages[0]).toEqual({
			role: "user",
			content: "hello",
		});
	});

	it("caps history to 10 messages in API call", async () => {
		// Make streamConceptChat resolve immediately
		mockStreamConceptChat.mockResolvedValue(undefined);

		const { result } = renderHook(() => useConceptChat("s", "n"));

		// Send 12 messages to exceed the 10-message cap
		for (let i = 0; i < 12; i++) {
			await act(async () => {
				await result.current.sendMessage(`msg-${i}`, []);
			});
		}

		// The hook should have 24 messages (12 user + 12 assistant)
		// but the last API call should have had history capped to 10
		const lastCall =
			mockStreamConceptChat.mock.calls[
				mockStreamConceptChat.mock.calls.length - 1
			][0];
		// history passed = all messages except the current user message
		// After 12 rounds, there are 22 messages before the last (11 user + 11 assistant)
		// Cap is 10, so last 10 of the 22 = 10
		expect(lastCall.history.length).toBeLessThanOrEqual(10);
	});

	it("resets chat state on resetChat", async () => {
		mockStreamConceptChat.mockResolvedValue(undefined);

		const { result } = renderHook(() => useConceptChat("s", "n"));

		await act(async () => {
			await result.current.sendMessage("hello", []);
		});

		expect(result.current.messages.length).toBeGreaterThan(0);

		act(() => {
			result.current.resetChat();
		});

		expect(result.current.messages).toEqual([]);
		expect(result.current.isStreaming).toBe(false);
		expect(result.current.error).toBeNull();
	});

	it("sets error on stream failure", async () => {
		mockStreamConceptChat.mockRejectedValue(new Error("Network fail"));

		const { result } = renderHook(() => useConceptChat("s", "n"));

		await act(async () => {
			await result.current.sendMessage("hello", []);
		});

		expect(result.current.error).toBe("Network fail");
		// Empty assistant placeholder should be removed
		const assistantMsgs = result.current.messages.filter(
			(m) => m.role === "assistant",
		);
		expect(assistantMsgs).toHaveLength(0);
	});

	it("sets isStreaming to false after successful completion", async () => {
		mockStreamConceptChat.mockResolvedValue(undefined);

		const { result } = renderHook(() => useConceptChat("s", "n"));

		await act(async () => {
			await result.current.sendMessage("hello", []);
		});

		expect(result.current.isStreaming).toBe(false);
	});

	it("sets isStreaming to false after thrown API error", async () => {
		mockStreamConceptChat.mockRejectedValue(new Error("Network fail"));

		const { result } = renderHook(() => useConceptChat("s", "n"));

		await act(async () => {
			await result.current.sendMessage("hello", []);
		});

		expect(result.current.isStreaming).toBe(false);
		expect(result.current.error).toBe("Network fail");
	});

	it("does not send empty messages", async () => {
		const { result } = renderHook(() => useConceptChat("s", "n"));

		await act(async () => {
			await result.current.sendMessage("   ", []);
		});

		expect(result.current.messages).toEqual([]);
		expect(mockStreamConceptChat).not.toHaveBeenCalled();
	});
});
