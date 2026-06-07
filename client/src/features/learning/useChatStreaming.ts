/**
 * ============================================================================
 * FILE: useChatStreaming.ts
 * LOCATION: client/src/features/learning/useChatStreaming.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Shared context + hook for chat streaming state. Allows LearningPage to
 *    pause session polling while a concept chat stream is active.
 *
 * ROLE IN PROJECT:
 *    Lightweight signal bridge between useConceptChat (producer) and
 *    LearningPage's refetchInterval (consumer).
 *
 * KEY COMPONENTS:
 *    - ChatStreamingContext: React context with streaming state + controls
 *    - useChatStreaming: Hook returning current streaming state + controls
 *
 * DEPENDENCIES:
 *    - External: react
 *    - Internal: none
 *
 * USAGE:
 *    ```tsx
 *    const { isStreaming, startStreaming, stopStreaming } =
 *      useChatStreaming();
 *    ```
 * ============================================================================
 */

import { createContext, useContext } from "react";

interface ChatStreamingContextValue {
	isStreaming: boolean;
	startStreaming: () => void;
	stopStreaming: () => void;
}

export const ChatStreamingContext = createContext<ChatStreamingContextValue>({
	isStreaming: false,
	startStreaming: () => {},
	stopStreaming: () => {},
});

export function useChatStreaming() {
	return useContext(ChatStreamingContext);
}
