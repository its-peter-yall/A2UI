/**
 * ============================================================================
 * FILE: ChatStreamingContext.tsx
 * LOCATION: client/src/features/learning/ChatStreamingContext.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Shared context for chat streaming state. Allows LearningPage to pause
 *    session polling while a concept chat stream is active, reducing
 *    unnecessary GET requests during LLM response generation.
 *
 * ROLE IN PROJECT:
 *    Lightweight signal bridge between useConceptChat (producer) and
 *    LearningPage's refetchInterval (consumer).
 *
 * KEY COMPONENTS:
 *    - ChatStreamingProvider: Tracks isStreaming count via ref
 *    - useChatStreaming: Returns current streaming state
 *
 * DEPENDENCIES:
 *    - External: react
 *    - Internal: none
 *
 * USAGE:
 *    ```tsx
 *    <ChatStreamingProvider>
 *      <LearningPage />
 *    </ChatStreamingProvider>
 *    ```
 * ============================================================================
 */

import {
	createContext,
	useContext,
	useState,
	useCallback,
	useRef,
	type ReactNode,
} from "react";

interface ChatStreamingContextValue {
	isStreaming: boolean;
	startStreaming: () => void;
	stopStreaming: () => void;
}

const ChatStreamingContext = createContext<ChatStreamingContextValue>({
	isStreaming: false,
	startStreaming: () => {},
	stopStreaming: () => {},
});

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

export function useChatStreaming() {
	return useContext(ChatStreamingContext);
}
