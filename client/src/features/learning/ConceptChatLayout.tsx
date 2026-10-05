/**
 * ============================================================================
 * FILE: ConceptChatLayout.tsx
 * LOCATION: client/src/features/learning/ConceptChatLayout.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Bounded container providing responsive split layout for desktop (>= 768px)
 *    and full-width overlay mode for narrow screens (< 768px). Supports
 *    mouse drag and keyboard separator controls with strict [25, 38] clamping.
 *
 * ROLE IN PROJECT:
 *    Replaces unconstrained in-flow chat placement across LearningPathContainer
 *    and RevisionPage. Ensures chat never renders beneath content or bottom-left.
 *
 * KEY COMPONENTS:
 *    - ConceptChatLayout: Primary exported component
 *    - useIsDesktop: Responsive viewport listener
 *
 * USAGE:
 *    ```tsx
 *    <ConceptChatLayout
 *      isChatOpen={isOpen}
 *      chatWidthPercent={width}
 *      onChatWidthChange={setWidth}
 *      onCloseChat={close}
 *      chatPanel={<ChatPanel ... />}
 *    >
 *      <CourseContent />
 *    </ConceptChatLayout>
 *    ```
 * ============================================================================
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHAT_MIN_PERCENT, CHAT_MAX_PERCENT } from "./useConceptChatPanel";

export interface ConceptChatLayoutProps {
	children: ReactNode;
	chatPanel: ReactNode;
	isChatOpen: boolean;
	chatWidthPercent: number;
	onChatWidthChange: (percent: number) => void;
	onCloseChat: () => void;
	className?: string;
	contentClassName?: string;
}

function useIsDesktop(breakpoint = 768): boolean {
	const [isDesktop, setIsDesktop] = useState(() => {
		if (typeof window === "undefined" || !window.matchMedia) return true;
		return window.matchMedia(`(min-width: ${breakpoint}px)`).matches;
	});

	useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return;
		const media = window.matchMedia(`(min-width: ${breakpoint}px)`);
		const update = (e: MediaQueryListEvent | MediaQueryList) => {
			setIsDesktop(e.matches);
		};
		update(media);
		if (media.addEventListener) {
			media.addEventListener("change", update);
			return () => media.removeEventListener("change", update);
		} else {
			media.addListener(update);
			return () => media.removeListener(update);
		}
	}, [breakpoint]);

	return isDesktop;
}

export function ConceptChatLayout({
	children,
	chatPanel,
	isChatOpen,
	chatWidthPercent,
	onChatWidthChange,
	className,
	contentClassName,
}: ConceptChatLayoutProps) {
	const isDesktop = useIsDesktop(768);
	const containerRef = useRef<HTMLDivElement>(null);
	const isResizingRef = useRef(false);

	const handleResizeStart = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		isResizingRef.current = true;
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
	}, []);

	const handleResizeMove = useCallback(
		(e: MouseEvent) => {
			if (!isResizingRef.current || !containerRef.current) return;
			const containerRect = containerRef.current.getBoundingClientRect();
			const containerWidth = containerRect.width;
			const mouseX = e.clientX - containerRect.left;
			const newPercent = ((containerWidth - mouseX) / containerWidth) * 100;
			const clamped = Math.max(
				CHAT_MIN_PERCENT,
				Math.min(CHAT_MAX_PERCENT, newPercent),
			);
			onChatWidthChange(clamped);
		},
		[onChatWidthChange],
	);

	const handleResizeEnd = useCallback(() => {
		isResizingRef.current = false;
		document.body.style.cursor = "";
		document.body.style.userSelect = "";
	}, []);

	useEffect(() => {
		const onMouseMove = (e: MouseEvent) => {
			if (isResizingRef.current) handleResizeMove(e);
		};
		const onMouseUp = () => {
			if (isResizingRef.current) handleResizeEnd();
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);

		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
		};
	}, [handleResizeMove, handleResizeEnd]);

	const handleSeparatorKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowLeft") {
			e.preventDefault();
			onChatWidthChange(
				Math.min(CHAT_MAX_PERCENT, chatWidthPercent + 2),
			);
		} else if (e.key === "ArrowRight") {
			e.preventDefault();
			onChatWidthChange(
				Math.max(CHAT_MIN_PERCENT, chatWidthPercent - 2),
			);
		} else if (e.key === "Home") {
			e.preventDefault();
			onChatWidthChange(CHAT_MIN_PERCENT);
		} else if (e.key === "End") {
			e.preventDefault();
			onChatWidthChange(CHAT_MAX_PERCENT);
		}
	};

	return (
		<div
			ref={containerRef}
			className={cn("relative flex w-full h-full overflow-hidden", className)}
		>
			{/* Main Content Area */}
			<motion.div
				className={cn(
					"flex flex-col gap-6 p-4 overflow-y-auto h-full",
					isDesktop && isChatOpen
						? "transition-all"
						: "w-full",
					contentClassName,
				)}
				animate={{
					flex:
						isDesktop && isChatOpen
							? `0 0 ${100 - chatWidthPercent}%`
							: "1 1 100%",
				}}
				transition={{ type: "spring", damping: 30, stiffness: 300 }}
			>
				{children}
			</motion.div>

			{/* Desktop Resize Separator */}
			{isDesktop && isChatOpen && (
				<div
					className="w-1 bg-border hover:bg-(--cyber-yellow) cursor-col-resize shrink-0 transition-colors relative group select-none"
					onMouseDown={handleResizeStart}
					role="separator"
					aria-orientation="vertical"
					aria-label="Resize chat panel"
					aria-valuenow={chatWidthPercent}
					aria-valuemin={CHAT_MIN_PERCENT}
					aria-valuemax={CHAT_MAX_PERCENT}
					tabIndex={0}
					onKeyDown={handleSeparatorKeyDown}
				>
					<div className="absolute inset-y-0 -left-1 -right-1" />
					<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
						<GripVertical className="h-4 w-4 text-muted-foreground" />
					</div>
				</div>
			)}

			{/* Desktop Chat Pane */}
			{isDesktop && chatPanel}

			{/* Mobile Overlay Mode (< 768px) */}
			{!isDesktop && isChatOpen && (
				<div
					data-testid="concept-chat-overlay"
					className="absolute inset-0 z-40 bg-background flex flex-col overflow-hidden"
				>
					{chatPanel}
				</div>
			)}
		</div>
	);
}
