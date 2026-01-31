import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import type { Message, LocalMessage } from '@/types/api';
import { useState } from 'react';

// Hardcoded for now, but should come from config
const DEFAULT_MODEL = 'gemini-2.5-flash';

export function useChat(sessionId: string | null) {
    const queryClient = useQueryClient();
    const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);

    // 1. Fetch Session Messages (Server State)
    const { data: serverMessages = [], isLoading } = useQuery({
        queryKey: ['messages', sessionId],
        queryFn: async () => {
            if (!sessionId) return [];
            // Assuming we have an endpoint for messages, or fetching session includes them
            const session = await api.getSession(sessionId);
            return session.messages || [];
        },
        enabled: !!sessionId,
    });

    // 2. Send Message Mutation
    const sendMessageMutation = useMutation({
        mutationFn: async (content: string) => {
            if (!sessionId) throw new Error("No session ID");
            return api.sendMessage({
                session_id: sessionId,
                message: content,
                model: DEFAULT_MODEL
            });
        },
        onMutate: async (content) => {
            // Optimistic Update
            const tempId = Date.now().toString();
            const userMsg: LocalMessage = {
                id: tempId,
                role: 'user',
                content,
                session_id: sessionId!,
                timestamp: new Date().toISOString()
            };
            const loadingMsg: LocalMessage = {
                id: tempId + '-loading',
                role: 'assistant',
                content: '',
                session_id: sessionId!,
                isLoading: true,
                statusPhase: 'thinking'
            };

            setLocalMessages([userMsg, loadingMsg]);
        },
        onSuccess: (data) => {
            // Invalidate query to refetch real messages
            queryClient.invalidateQueries({ queryKey: ['messages', sessionId] });
            // Clear local messages
            setLocalMessages([]);
        },
        onError: (error) => {
             setLocalMessages(prev => prev.map(m => 
                m.isLoading ? { ...m, isLoading: false, error: error.message } : m
            ));
        }
    });

    const messages = [...serverMessages, ...localMessages];

    return {
        messages,
        isLoading,
        sendMessage: sendMessageMutation.mutate,
        isSending: sendMessageMutation.isPending
    };
}
