/**
 * ============================================================================
 * FILE: useConceptChat.ts
 * LOCATION: client/src/features/learning/useConceptChat.ts
 * ============================================================================
 *
 * PURPOSE:
 *    React hook managing ephemeral concept chat state: messages, streaming
 *    status, errors, and conversation actions. Consumes streamConceptChat
 *    from chatApi.ts and maintains client-side history capped at 10 messages.
 *
 * ROLE IN PROJECT:
 *    State management layer between ChatPanel UI and the SSE chat API.
 *    Provides sendMessage, resetChat, and stopStreaming to the component
 *    tree without exposing streaming internals.
 *
 * KEY COMPONENTS:
 *    - useConceptChat(): Named export hook returning chat state and actions
 *
 * DEPENDENCIES:
 *    - External: react
 *    - Internal: @/types/learning, @/lib/chatApi, @/lib/providerSettings
 *
 * USAGE:
 *    ```tsx
 *    const { messages, isStreaming, error, sendMessage, resetChat } =
 *      useConceptChat(sessionId, nodeId);
 *    ```
 * ============================================================================
 */

import { useState, useRef, useCallback, useEffect } from "react";
import type { ConceptChatMessage } from "@/types/learning";
import { streamConceptChat } from "@/lib/chatApi";

const MAX_HISTORY_MESSAGES = 10;

interface StoredChat {
	sessionId: string;
	nodeId: string;
	messages: ConceptChatMessage[];
	lastPromptTimestamp: number;
}

/**
 * Hook for ephemeral concept chat with SSE streaming.
 * Supports localStorage persistence across page refreshes.
 *
 * @param sessionId - Active learning session ID
 * @param nodeId - Active concept node ID
 * @param isCourseComplete - True if all course nodes are completed
 * @returns Chat state and actions
 */
export function useConceptChat(
	sessionId: string,
	nodeId: string,
	isCourseComplete = false,
) {
	const abortRef = useRef<AbortController | null>(null);

	const loadStoredChat = useCallback((): ConceptChatMessage[] => {
		if (isCourseComplete) {
			try {
				localStorage.removeItem("active_concept_chat");
			} catch (e) {
				console.error("Failed to clear chat on course completion:", e);
			}
			return [];
		}

		try {
			const storedRaw = localStorage.getItem("active_concept_chat");
			if (!storedRaw) return [];
			const stored: StoredChat = JSON.parse(storedRaw);

			// If sessionId or nodeId is not yet resolved, do not clear the saved chat, just return empty
			if (!sessionId || !nodeId) {
				return [];
			}

			// Validate sessionId and nodeId
			if (stored.sessionId !== sessionId || stored.nodeId !== nodeId) {
				// Changed topic or session -> clear
				localStorage.removeItem("active_concept_chat");
				return [];
			}

			// Validate 1-hour expiration
			const ONE_HOUR = 60 * 60 * 1000;
			if (Date.now() - stored.lastPromptTimestamp > ONE_HOUR) {
				// Expired -> clear
				localStorage.removeItem("active_concept_chat");
				return [];
			}

			return stored.messages;
		} catch (err) {
			console.error("Failed to parse stored concept chat:", err);
			return [];
		}
	}, [sessionId, nodeId, isCourseComplete]);

	const [messages, setMessages] = useState<ConceptChatMessage[]>(() =>
		loadStoredChat(),
	);
	const [isStreaming, setIsStreaming] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Sync state when topic, session, or completion state changes
	useEffect(() => {
		const loaded = loadStoredChat();
		setMessages(loaded);
		setError(null);
		setIsStreaming(false);
		if (abortRef.current) {
			abortRef.current.abort();
			abortRef.current = null;
		}
	}, [sessionId, nodeId, isCourseComplete, loadStoredChat]);

	const clearChat = useCallback(() => {
		if (abortRef.current) {
			abortRef.current.abort();
			abortRef.current = null;
		}
		setMessages([]);
		setIsStreaming(false);
		setError(null);
		try {
			localStorage.removeItem("active_concept_chat");
		} catch (e) {
			console.error("Failed to delete stored chat:", e);
		}
	}, []);

	// Periodic checker for 1-hour expiration
	useEffect(() => {
		const checkExpiration = () => {
			try {
				const storedRaw = localStorage.getItem("active_concept_chat");
				if (storedRaw) {
					const stored: StoredChat = JSON.parse(storedRaw);
					const ONE_HOUR = 60 * 60 * 1000;
					if (Date.now() - stored.lastPromptTimestamp > ONE_HOUR) {
						clearChat();
					}
				}
			} catch (e) {
				console.error("Expiration check failed:", e);
			}
		};

		checkExpiration();

		const interval = setInterval(checkExpiration, 10000);
		return () => clearInterval(interval);
	}, [clearChat]);

	const sendMessage = useCallback(
		async (message: string, selectedHeadingIds: string[]) => {
			const trimmed = message.trim();
			if (!trimmed) return;

			// Append user message immediately
			const userMessage: ConceptChatMessage = {
				role: "user",
				content: trimmed,
			};

			const historyForRequest = [...messages, userMessage].slice(
				-MAX_HISTORY_MESSAGES,
			);

			const updatedWithUser = [...messages, userMessage];
			setMessages(updatedWithUser);
			setIsStreaming(true);
			setError(null);

			const timestamp = Date.now();
			try {
				const data: StoredChat = {
					sessionId,
					nodeId,
					messages: updatedWithUser,
					lastPromptTimestamp: timestamp,
				};
				localStorage.setItem("active_concept_chat", JSON.stringify(data));
			} catch (e) {
				console.error("Failed to save user message to storage:", e);
			}

			// Prepare assistant placeholder
			const assistantMessage: ConceptChatMessage = {
				role: "assistant",
				content: "",
			};

			setMessages((prev) => [...prev, assistantMessage]);

			const controller = new AbortController();
			abortRef.current = controller;

			try {
				await streamConceptChat({
					sessionId,
					nodeId,
					message: trimmed,
					history: historyForRequest.slice(0, -1), // exclude current user msg
					selectedHeadingIds,
					onDelta: (delta) => {
						setMessages((prev) => {
							const updated = [...prev];
							const last = updated[updated.length - 1];
							if (last && last.role === "assistant") {
								updated[updated.length - 1] = {
									...last,
									content: last.content + delta,
								};
							}
							try {
								const data: StoredChat = {
									sessionId,
									nodeId,
									messages: updated,
									lastPromptTimestamp: timestamp,
								};
								localStorage.setItem("active_concept_chat", JSON.stringify(data));
							} catch (e) {
								console.error("Failed to save streaming delta:", e);
							}
							return updated;
						});
					},
					signal: controller.signal,
				});
			} catch (err) {
				if (controller.signal.aborted) return;
				const errorMsg =
					err instanceof Error ? err.message : "Chat request failed";
				setError(errorMsg);
				// Remove empty assistant placeholder on error
				setMessages((prev) => {
					const last = prev[prev.length - 1];
					let updated = prev;
					if (last?.role === "assistant" && !last.content) {
						updated = prev.slice(0, -1);
					}
					try {
						const data: StoredChat = {
							sessionId,
							nodeId,
							messages: updated,
							lastPromptTimestamp: timestamp,
						};
						localStorage.setItem("active_concept_chat", JSON.stringify(data));
					} catch (e) {
						console.error("Failed to clean up storage after error:", e);
					}
					return updated;
				});
			} finally {
				if (abortRef.current === controller) {
					abortRef.current = null;
				}
				setIsStreaming(false);
			}
		},
		[messages, sessionId, nodeId],
	);

	const stopStreaming = useCallback(() => {
		if (abortRef.current) {
			abortRef.current.abort();
			abortRef.current = null;
		}
	}, []);

	return {
		messages,
		isStreaming,
		error,
		sendMessage,
		resetChat: clearChat,
		clearChat,
		stopStreaming,
	};
}
