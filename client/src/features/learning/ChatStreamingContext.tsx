/**
 * ============================================================================
 * FILE: ChatStreamingContext.tsx
 * LOCATION: client/src/features/learning/ChatStreamingContext.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Provides ChatStreamingContext to the component tree. Tracks streaming
 *    count via ref so LearningPage can pause polling during active streams.
 *
 * ROLE IN PROJECT:
 *    Provider wrapper around ChatStreamingContext from useChatStreaming.
 *
 * KEY COMPONENTS:
 *    - ChatStreamingProvider: Tracks isStreaming count via ref
 *
 * DEPENDENCIES:
 *    - External: react
 *    - Internal: ./useChatStreaming (ChatStreamingContext)
 *
 * USAGE:
 *    ```tsx
 *    <ChatStreamingProvider>
 *      <LearningPage />
 *    </ChatStreamingProvider>
 *    ```
 * ============================================================================
 */

import { useState, useCallback, useRef, type ReactNode } from "react";

import { ChatStreamingContext } from "./useChatStreaming";

export function ChatStreamingProvider({ children }: { children: ReactNode }) {
	const countRef = useRef(0);
	const [isStreaming, setIsStreaming] = useState(false);

	const startStreaming = useCallback(() => {
		countRef.current += 1;
		setIsStreaming(true);
	}, []);

	const stopStreaming = useCallback(() => {
		countRef.current = Math.max(0, countRef.current - 1);
		if (countRef.current === 0) {
			setIsStreaming(false);
		}
	}, []);

	return (
		<ChatStreamingContext.Provider
			value={{ isStreaming, startStreaming, stopStreaming }}
		>
			{children}
		</ChatStreamingContext.Provider>
	);
}
