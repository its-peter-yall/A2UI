/**
 * ============================================================================
 * FILE: ChatPanel.tsx
 * LOCATION: client/src/features/learning/ChatPanel.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Right-side sliding drawer for concept chat. Displays message history,
 *    streaming state, error state, textarea input, and send/close buttons.
 *    Animated with framer-motion from x: "100%" to x: 0.
 *
 * ROLE IN PROJECT:
 *    Primary UI for the concept chatbot. Renders inside
 *    LearningPathContainer when isChatOpen is true. Consumes useConceptChat
 *    for state management and streamConceptChat for SSE communication.
 *
 * KEY COMPONENTS:
 *    - ChatPanel: Named export drawer component
 *
 * DEPENDENCIES:
 *    - External: react, framer-motion, lucide-react
 *    - Internal: @/types/learning, @/features/learning/useConceptChat,
 *                @/lib/utils
 *
 * USAGE:
 *    ```tsx
 *    <ChatPanel
 *      isOpen={isChatOpen}
 *      onClose={() => setIsChatOpen(false)}
 *      sessionId={sessionId}
 *      nodeId={nodeId}
 *      selectedHeadingIds={selectedHeadingIds}
 *      onClearHeadings={() => setSelectedHeadingIds([])}
 *    />
 *    ```
 * ============================================================================
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, MessageCircle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConceptChat } from "./useConceptChat";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface ChatPanelProps {
	isOpen: boolean;
	onClose: () => void;
	sessionId: string;
	nodeId: string;
	selectedHeadingIds: string[];
	onClearHeadings: () => void;
	isCourseComplete?: boolean;
}

const TypingIndicator = () => (
	<div className="flex items-center gap-1.5 py-2 px-1" aria-label="Thinking">
		<span className="h-1.5 w-1.5 bg-(--cyber-yellow) rounded-full animate-bounce" style={{ animationDelay: "0ms", animationDuration: "0.8s" }} />
		<span className="h-1.5 w-1.5 bg-(--cyber-yellow)/80 rounded-full animate-bounce" style={{ animationDelay: "150ms", animationDuration: "0.8s" }} />
		<span className="h-1.5 w-1.5 bg-(--cyber-yellow)/50 rounded-full animate-bounce" style={{ animationDelay: "300ms", animationDuration: "0.8s" }} />
	</div>
);

export function ChatPanel({
	isOpen,
	onClose,
	sessionId,
	nodeId,
	selectedHeadingIds,
	onClearHeadings,
	isCourseComplete = false,
}: ChatPanelProps) {
	const {
		messages,
		isStreaming,
		error,
		sendMessage,
		clearChat,
		stopStreaming,
	} = useConceptChat(sessionId, nodeId, isCourseComplete);

	const [input, setInput] = useState("");
	const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const previousFocusRef = useRef<HTMLElement | null>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	// Reset input when panel closes (during render to avoid effect state cascade)
	if (isOpen !== prevIsOpen) {
		setPrevIsOpen(isOpen);
		if (!isOpen) {
			setInput("");
		}
	}

	// Auto-scroll to bottom on new messages
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	// Stop streaming when panel closes and restore focus (but retain messages)
	useEffect(() => {
		if (!isOpen) {
			stopStreaming();
			// Return focus to the element that opened the panel
			if (previousFocusRef.current) {
				previousFocusRef.current.focus();
				previousFocusRef.current = null;
			}
		}
	}, [isOpen, stopStreaming]);

	// Auto-focus textarea and save previous focus when opened
	useEffect(() => {
		if (isOpen && textareaRef.current) {
			previousFocusRef.current = document.activeElement as HTMLElement;
			textareaRef.current.focus();
		}
	}, [isOpen]);

	// Escape key handler and focus trap
	useEffect(() => {
		if (!isOpen) return;

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
				return;
			}

			if (e.key !== "Tab" || !panelRef.current) return;

			const focusableSelector =
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
			const focusableElements =
				panelRef.current.querySelectorAll<HTMLElement>(focusableSelector);
			if (focusableElements.length === 0) return;

			const firstElement = focusableElements[0];
			const lastElement = focusableElements[focusableElements.length - 1];

			if (e.shiftKey) {
				if (document.activeElement === firstElement) {
					e.preventDefault();
					lastElement.focus();
				}
			} else {
				if (document.activeElement === lastElement) {
					e.preventDefault();
					firstElement.focus();
				}
			}
		};

		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [isOpen, onClose]);

	const handleSend = async () => {
		const trimmed = input.trim();
		if (!trimmed || isStreaming) return;
		setInput("");
		await sendMessage(trimmed, selectedHeadingIds);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	// Auto-resize textarea
	const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setInput(e.target.value);
		const el = e.target;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
	};

	const canSend = input.trim().length > 0 && !isStreaming;

	return (
		<AnimatePresence>
			{isOpen && (
				<motion.div
					ref={panelRef}
					role="dialog"
					aria-modal="false"
					aria-labelledby="chat-panel-title"
					initial={{ width: 0, opacity: 0 }}
					animate={{ width: 480, opacity: 1 }}
					exit={{ width: 0, opacity: 0 }}
					transition={{ type: "spring", damping: 30, stiffness: 300 }}
					className={cn(
						"shrink-0 overflow-hidden h-full",
						"bg-background border-l border-border",
						"flex flex-col",
					)}
				>
					{/* Header */}
					<div className="flex items-center justify-between px-4 py-3 border-b">
						<div className="flex items-center gap-2">
							<MessageCircle className="h-5 w-5 text-(--cyber-yellow)" />
							<h2 id="chat-panel-title" className="font-semibold text-sm">
								Ask about this concept
							</h2>
						</div>
						<div className="flex items-center gap-1">
							{messages.length > 0 && (
								<button
									onClick={clearChat}
									className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
									aria-label="Clear conversation"
									title="Clear conversation"
								>
									<Trash2 className="h-4 w-4" />
								</button>
							)}
							<button
								onClick={onClose}
								className="p-1.5 rounded-md hover:bg-muted transition-colors"
								aria-label="Close concept chat"
							>
								<X className="h-4 w-4" />
							</button>
						</div>
					</div>

					{/* Selected headings indicator */}
					{selectedHeadingIds.length > 0 && (
						<div className="px-4 py-2 border-b bg-(--cyber-yellow)/5 flex items-center justify-between">
							<span className="text-xs text-muted-foreground">
								{selectedHeadingIds.length} heading
								{selectedHeadingIds.length !== 1 ? "s" : ""} selected
							</span>
							<button
								onClick={onClearHeadings}
								className="text-xs text-(--cyber-yellow) hover:underline"
							>
								Clear selections
							</button>
						</div>
					)}

					{/* Messages */}
					<div
						className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
						role="log"
						aria-live="polite"
						aria-atomic="false"
						aria-label="Chat messages"
					>
						{messages.length === 0 && (
							<div className="text-center text-sm text-muted-foreground py-12">
								<MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
								<p>Ask a question about this concept.</p>
								{selectedHeadingIds.length > 0 && (
									<p className="mt-1 text-xs">
										Focused on {selectedHeadingIds.length} selected heading
										{selectedHeadingIds.length !== 1 ? "s" : ""}.
									</p>
								)}
							</div>
						)}

						{messages.map((msg, i) => (
							<div
								key={i}
								className={cn(
									"flex",
									msg.role === "user" ? "justify-end" : "justify-start",
								)}
							>
								<div
									className={cn(
										"max-w-[85%] rounded-lg px-3 py-2 text-sm",
										msg.role === "user"
											? "bg-primary text-primary-foreground"
											: "bg-muted",
									)}
								>
									{msg.role === "assistant" ? (
										msg.content ? (
											<MarkdownRenderer
												content={msg.content}
												className="prose-sm text-[13.5px] leading-relaxed max-w-none"
											/>
										) : (
											<TypingIndicator />
										)
									) : (
										<span>{msg.content}</span>
									)}
								</div>
							</div>
						))}

						{error && (
							<div className="text-center text-xs text-destructive py-2">
								{error}
							</div>
						)}

						<div ref={messagesEndRef} />
					</div>

					{/* Input area */}
					<div className="border-t px-4 py-3">
						<label htmlFor="chat-input" className="sr-only">
							Ask a question about this concept
						</label>
						<div className="flex items-end gap-2">
							<textarea
								id="chat-input"
								ref={textareaRef}
								value={input}
								onChange={handleInputChange}
								onKeyDown={handleKeyDown}
								placeholder="Ask a question..."
								rows={1}
								className={cn(
									"flex-1 resize-none rounded-lg px-3 py-2 text-sm",
									"bg-muted border border-border text-foreground",
									"placeholder:text-muted-foreground",
									"focus:outline-none focus:ring-2 focus:ring-primary/50",
									"max-h-30",
								)}
								disabled={isStreaming}
							/>
							{isStreaming ? (
								<button
									onClick={stopStreaming}
									className={cn(
										"p-2.5 rounded-lg transition-colors",
										"bg-destructive text-destructive-foreground hover:bg-destructive/90",
									)}
									aria-label="Stop streaming"
								>
									<X className="h-4 w-4" />
								</button>
							) : (
								<button
									onClick={handleSend}
									disabled={!canSend}
									className={cn(
										"p-2.5 rounded-lg transition-colors",
										canSend
											? "bg-(--cyber-yellow) text-black hover:bg-(--cyber-yellow)/90"
											: "bg-muted text-muted-foreground cursor-not-allowed",
									)}
									aria-label="Send message"
								>
									<Send className="h-4 w-4" />
								</button>
							)}
						</div>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
