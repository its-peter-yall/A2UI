/**
 * ============================================================================
 * FILE: useConceptChatPanel.ts
 * LOCATION: client/src/features/learning/useConceptChatPanel.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Headless controller managing concept chat panel state: open/close,
 *    topic ownership persistence, carousel navigation isolation, explicit
 *    retargeting, heading context scoping, curiosity prefill, and width clamping.
 *
 * ROLE IN PROJECT:
 *    Shared controller between LearningPathContainer and RevisionPage.
 *    Decouples chat lifecycle from carousel swipe and generation mutations.
 *
 * KEY COMPONENTS:
 *    - useConceptChatPanel: Primary exported hook
 *    - CHAT_MIN_PERCENT: 25% minimum width
 *    - CHAT_MAX_PERCENT: 38% maximum width
 *
 * USAGE:
 *    ```tsx
 *    const chat = useConceptChatPanel({
 *      sessionId,
 *      activeTopicId: currentNode?.id,
 *      activeTopicTitle: currentNode?.title,
 *    });
 *    ```
 * ============================================================================
 */

import { useState, useCallback, useRef, useEffect } from "react";

export const CHAT_MIN_PERCENT = 25;
export const CHAT_MAX_PERCENT = 38;

export interface UseConceptChatPanelOptions {
	sessionId?: string;
	activeTopicId?: string;
	activeTopicTitle?: string;
	initialWidthPercent?: number;
}

export interface UseConceptChatPanelResult {
	isOpen: boolean;
	chatNodeId: string;
	chatTopicTitle: string;
	chatWidthPercent: number;
	selectedHeadingIds: string[];
	prefillMessage: string;
	openChat: (targetNodeId?: string, targetTopicTitle?: string) => void;
	closeChat: () => void;
	askQuestion: (
		question: string,
		targetNodeId?: string,
		targetTopicTitle?: string,
	) => void;
	consumePrefill: () => void;
	toggleHeadingChat: (
		headingId: string,
		targetNodeId?: string,
		targetTopicTitle?: string,
	) => void;
	clearHeadings: () => void;
	setChatWidthPercent: (percent: number) => void;
	adjustChatWidth: (deltaPercent: number) => void;
	retargetTopic: (nodeId: string, topicTitle?: string) => void;
}

export function useConceptChatPanel(
	options: UseConceptChatPanelOptions = {},
): UseConceptChatPanelResult {
	const { activeTopicId = "", activeTopicTitle = "", initialWidthPercent = 25 } =
		options;

	const [isOpen, setIsOpen] = useState(false);
	const [chatNodeId, setChatNodeId] = useState("");
	const [chatTopicTitle, setChatTopicTitle] = useState("");
	const [chatWidthPercent, setChatWidthPercentState] = useState(() =>
		Math.max(
			CHAT_MIN_PERCENT,
			Math.min(CHAT_MAX_PERCENT, initialWidthPercent),
		),
	);
	const [selectedHeadingIds, setSelectedHeadingIds] = useState<string[]>([]);
	const [prefillMessage, setPrefillMessage] = useState("");

	const activeTopicIdRef = useRef(activeTopicId);
	const activeTopicTitleRef = useRef(activeTopicTitle);
	useEffect(() => {
		activeTopicIdRef.current = activeTopicId;
	}, [activeTopicId]);
	useEffect(() => {
		activeTopicTitleRef.current = activeTopicTitle;
	}, [activeTopicTitle]);

	const setChatWidthPercent = useCallback((percent: number) => {
		setChatWidthPercentState(
			Math.max(CHAT_MIN_PERCENT, Math.min(CHAT_MAX_PERCENT, percent)),
		);
	}, []);

	const adjustChatWidth = useCallback((deltaPercent: number) => {
		setChatWidthPercentState((prev) =>
			Math.max(
				CHAT_MIN_PERCENT,
				Math.min(CHAT_MAX_PERCENT, prev + deltaPercent),
			),
		);
	}, []);

	const retargetTopic = useCallback(
		(nodeId: string, topicTitle?: string) => {
			setChatNodeId(nodeId);
			setChatTopicTitle(topicTitle ?? "");
			setSelectedHeadingIds([]);
		},
		[],
	);

	const openChat = useCallback(
		(targetNodeId?: string, targetTopicTitle?: string) => {
			const destinationNodeId =
				targetNodeId || chatNodeId || activeTopicIdRef.current;
			const destinationTopicTitle =
				targetTopicTitle ||
				(targetNodeId ? "" : chatTopicTitle || activeTopicTitleRef.current);

			if (destinationNodeId !== chatNodeId) {
				retargetTopic(destinationNodeId, destinationTopicTitle);
			} else if (targetTopicTitle && !chatTopicTitle) {
				setChatTopicTitle(targetTopicTitle);
			}

			setIsOpen(true);
		},
		[chatNodeId, chatTopicTitle, retargetTopic],
	);

	const closeChat = useCallback(() => {
		setIsOpen(false);
	}, []);

	const askQuestion = useCallback(
		(
			question: string,
			targetNodeId?: string,
			targetTopicTitle?: string,
		) => {
			const destinationNodeId =
				targetNodeId || chatNodeId || activeTopicIdRef.current;
			const destinationTopicTitle =
				targetTopicTitle ||
				(targetNodeId ? "" : chatTopicTitle || activeTopicTitleRef.current);

			if (destinationNodeId !== chatNodeId) {
				retargetTopic(destinationNodeId, destinationTopicTitle);
			} else if (targetTopicTitle && !chatTopicTitle) {
				setChatTopicTitle(targetTopicTitle);
			}

			setPrefillMessage(question);
			setIsOpen(true);
		},
		[chatNodeId, chatTopicTitle, retargetTopic],
	);

	const consumePrefill = useCallback(() => {
		setPrefillMessage("");
	}, []);

	const toggleHeadingChat = useCallback(
		(
			headingId: string,
			targetNodeId?: string,
			targetTopicTitle?: string,
		) => {
			const destinationNodeId =
				targetNodeId || chatNodeId || activeTopicIdRef.current;
			const destinationTopicTitle =
				targetTopicTitle ||
				(targetNodeId ? "" : chatTopicTitle || activeTopicTitleRef.current);

			if (destinationNodeId !== chatNodeId) {
				setChatNodeId(destinationNodeId);
				setChatTopicTitle(destinationTopicTitle);
				setSelectedHeadingIds([headingId]);
			} else {
				setSelectedHeadingIds((prev) =>
					prev.includes(headingId)
						? prev.filter((id) => id !== headingId)
						: [...prev, headingId],
				);
			}

			setIsOpen(true);
		},
		[chatNodeId, chatTopicTitle],
	);

	const clearHeadings = useCallback(() => {
		setSelectedHeadingIds([]);
	}, []);

	return {
		isOpen,
		chatNodeId,
		chatTopicTitle,
		chatWidthPercent,
		selectedHeadingIds,
		prefillMessage,
		openChat,
		closeChat,
		askQuestion,
		consumePrefill,
		toggleHeadingChat,
		clearHeadings,
		setChatWidthPercent,
		adjustChatWidth,
		retargetTopic,
	};
}
