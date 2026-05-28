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

import { useState, useRef, useCallback } from 'react';
import type { ConceptChatMessage } from '@/types/learning';
import { streamConceptChat } from '@/lib/chatApi';

const MAX_HISTORY_MESSAGES = 10;

/**
 * Hook for ephemeral concept chat with SSE streaming.
 *
 * @param sessionId - Active learning session ID
 * @param nodeId - Active concept node ID
 * @returns Chat state and actions
 */
export function useConceptChat(sessionId: string, nodeId: string) {
  const [messages, setMessages] = useState<ConceptChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (message: string, selectedHeadingIds: string[]) => {
      const trimmed = message.trim();
      if (!trimmed) return;

      // Append user message immediately
      const userMessage: ConceptChatMessage = {
        role: 'user',
        content: trimmed,
      };

      const historyForRequest = [...messages, userMessage].slice(
        -MAX_HISTORY_MESSAGES,
      );

      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setError(null);

      // Prepare assistant placeholder
      const assistantMessage: ConceptChatMessage = {
        role: 'assistant',
        content: '',
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
              if (last && last.role === 'assistant') {
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + delta,
                };
              }
              return updated;
            });
          },
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        const errorMsg =
          err instanceof Error ? err.message : 'Chat request failed';
        setError(errorMsg);
        // Remove empty assistant placeholder on error
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && !last.content) {
            return prev.slice(0, -1);
          }
          return prev;
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

  const resetChat = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setMessages([]);
    setIsStreaming(false);
    setError(null);
  }, []);

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
    resetChat,
    stopStreaming,
  };
}
