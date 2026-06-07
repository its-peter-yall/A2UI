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
 *    - getStorageKey(): Per-node localStorage key builder
 *    - cleanupExpiredChats(): Removes stale chat entries on mount
 *
 * DEPENDENCIES:
 *    - External: react
 *    - Internal: @/types/learning, @/lib/chatApi
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
import { useChatStreaming } from "./useChatStreaming";

const MAX_HISTORY_MESSAGES = 10;
const ONE_HOUR = 60 * 60 * 1000;
const STORAGE_PREFIX = "concept_chat_";

interface StoredChat {
	messages: ConceptChatMessage[];
	lastPromptTimestamp: number;
}

/**
 * Build a per-node localStorage key.
 * Format: concept_chat_{sessionId}_{nodeId}
 */
function getStorageKey(sessionId: string, nodeId: string): string {
	return `${STORAGE_PREFIX}${sessionId}_${nodeId}`;
}

/**
 * Scan localStorage for expired concept_chat_* entries and remove them.
 * Called once on mount to prevent unbounded key accumulation.
 */
function cleanupExpiredChats(): void {
	try {
		const keysToRemove: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && key.startsWith(STORAGE_PREFIX)) {
				try {
					const raw = localStorage.getItem(key);
					if (raw) {
						const stored: StoredChat = JSON.parse(raw);
						if (Date.now() - stored.lastPromptTimestamp > ONE_HOUR) {
							keysToRemove.push(key);
						}
					}
				} catch {
					// Corrupt entry — remove it
					keysToRemove.push(key);
				}
			}
		}
		for (const key of keysToRemove) {
			localStorage.removeItem(key);
		}
	} catch (e) {
		console.error("Failed to cleanup expired chats:", e);
	}
}

/**
 * Hook for ephemeral concept chat with SSE streaming.
 * Supports localStorage persistence across page refreshes.
 * Each session+node pair gets its own storage key so carousel
 * navigation does not wipe chat history.
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

	// Keep refs in sync so streaming callbacks always use current IDs
	const sessionIdRef = useRef(sessionId);
	const nodeIdRef = useRef(nodeId);
	useEffect(() => {
		sessionIdRef.current = sessionId;
	}, [sessionId]);
	useEffect(() => {
		nodeIdRef.current = nodeId;
	}, [nodeId]);

	// Cleanup expired chats once on mount
	useEffect(() => {
		cleanupExpiredChats();
	}, []);

	// Migrate legacy single-key storage to per-node key (one-time)
	useEffect(() => {
		try {
			const legacyRaw = localStorage.getItem("active_concept_chat");
			if (legacyRaw) {
				const legacy = JSON.parse(legacyRaw) as {
					sessionId: string;
					nodeId: string;
					messages: ConceptChatMessage[];
					lastPromptTimestamp: number;
				};
				// Only migrate if not expired
				if (Date.now() - legacy.lastPromptTimestamp <= ONE_HOUR) {
					const key = getStorageKey(legacy.sessionId, legacy.nodeId);
					// Don't overwrite if per-node key already exists
					if (!localStorage.getItem(key)) {
						const migrated: StoredChat = {
							messages: legacy.messages,
							lastPromptTimestamp: legacy.lastPromptTimestamp,
						};
						localStorage.setItem(key, JSON.stringify(migrated));
					}
				}
				localStorage.removeItem("active_concept_chat");
			}
		} catch (e) {
			console.error("Failed to migrate legacy chat storage:", e);
			try {
				localStorage.removeItem("active_concept_chat");
			} catch { /* ignore */ }
		}
	}, []);

	const loadStoredChat = useCallback((): ConceptChatMessage[] => {
		// Course complete → clear this node's chat
		if (isCourseComplete) {
			try {
				if (sessionId && nodeId) {
					localStorage.removeItem(getStorageKey(sessionId, nodeId));
				}
			} catch (e) {
				console.error("Failed to clear chat on course completion:", e);
			}
			return [];
		}

		// IDs not yet resolved — return empty without clearing
		if (!sessionId || !nodeId) {
			return [];
		}

		try {
			const key = getStorageKey(sessionId, nodeId);
			const storedRaw = localStorage.getItem(key);
			if (!storedRaw) return [];
			const stored: StoredChat = JSON.parse(storedRaw);

			// Validate 1-hour expiration
			if (Date.now() - stored.lastPromptTimestamp > ONE_HOUR) {
				localStorage.removeItem(key);
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
	const { startStreaming, stopStreaming: stopStreamingCtx } = useChatStreaming();

	// Sync state when topic, session, or completion state changes
	useEffect(() => {
		const loaded = loadStoredChat();
		setMessages(loaded);
		setError(null);
		setIsStreaming(false);
		stopStreamingCtx();
		if (abortRef.current) {
			abortRef.current.abort();
			abortRef.current = null;
		}
	}, [sessionId, nodeId, isCourseComplete, loadStoredChat, stopStreamingCtx]);

	/** Save messages to per-node storage key using current ref values. */
	const saveToStorage = useCallback(
		(msgs: ConceptChatMessage[], timestamp: number) => {
			try {
				const sid = sessionIdRef.current;
				const nid = nodeIdRef.current;
				if (!sid || !nid) return;
				const data: StoredChat = {
					messages: msgs,
					lastPromptTimestamp: timestamp,
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

	const clearChat = useCallback(() => {
		if (abortRef.current) {
			abortRef.current.abort();
			abortRef.current = null;
		}
		setMessages([]);
		setIsStreaming(false);
		stopStreamingCtx();
		setError(null);
		try {
			const sid = sessionIdRef.current;
			const nid = nodeIdRef.current;
			if (sid && nid) {
				localStorage.removeItem(getStorageKey(sid, nid));
			}
		} catch (e) {
			console.error("Failed to delete stored chat:", e);
		}
	}, [stopStreamingCtx]);

	// Periodic checker for 1-hour expiration
	useEffect(() => {
		const checkExpiration = () => {
			try {
				const sid = sessionIdRef.current;
				const nid = nodeIdRef.current;
				if (!sid || !nid) return;
				const key = getStorageKey(sid, nid);
				const storedRaw = localStorage.getItem(key);
				if (storedRaw) {
					const stored: StoredChat = JSON.parse(storedRaw);
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

			// Capture current IDs at call time for the API request
			const currentSessionId = sessionIdRef.current;
			const currentNodeId = nodeIdRef.current;

			// Append user message immediately
			const userMessage: ConceptChatMessage = {
				role: "user",
				content: trimmed,
			};

			// Use functional updater to avoid stale messages closure
			let historyForRequest: ConceptChatMessage[] = [];
			const timestamp = Date.now();

			setMessages((prev) => {
				const updatedWithUser = [...prev, userMessage];
				historyForRequest = updatedWithUser.slice(
					-MAX_HISTORY_MESSAGES,
				);
				saveToStorage(updatedWithUser, timestamp);
				return updatedWithUser;
			});

			setIsStreaming(true);
			startStreaming();
			setError(null);

			// Prepare assistant placeholder
			const assistantMessage: ConceptChatMessage = {
				role: "assistant",
				content: "",
			};

			setMessages((prev) => [...prev, assistantMessage]);

			const controller = new AbortController();
			abortRef.current = controller;

			try {
				// Wait one microtask so historyForRequest is populated
				await Promise.resolve();

				await streamConceptChat({
					sessionId: currentSessionId,
					nodeId: currentNodeId,
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
							saveToStorage(updated, timestamp);
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
					const updated =
						last?.role === "assistant" && !last.content
							? prev.slice(0, -1)
							: prev;
					saveToStorage(updated, timestamp);
					return updated;
				});
			} finally {
				if (abortRef.current === controller) {
					abortRef.current = null;
				}
				setIsStreaming(false);
				stopStreamingCtx();
			}
		},
		[saveToStorage, startStreaming, stopStreamingCtx],
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
