/**
 * ============================================================================
 * FILE: ProgressBar.tsx
 * LOCATION: client/src/features/learning/ProgressBar.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Visual progress indicator showing the user's advancement through the
 *    learning path. Displays overall completion percentage and individual
 *    step indicators reflecting each node's status.
 *
 * ROLE IN PROJECT:
 *    Presentational component rendered by LearningPathContainer. Provides
 *    at-a-glance course progress and clickable step navigation for completed
 *    or active nodes, reinforcing the sequential learning flow.
 *
 * KEY COMPONENTS:
 *    - ProgressBar: Main progress bar with animated fill and step indicators
 *    - Progress Fill: Animated bar showing overall completion percentage
 *    - Step Indicators: Clickable dots representing each node
 *    - Legend: Color key for mastered/in-progress/locked states
 *
 * DEPENDENCIES:
 *    - External: framer-motion, react
 *    - Internal: @/lib/utils (cn), @/types/learning (ConceptNode, NodeStatus)
 *
 * USAGE:
 *    ```tsx
 *    <ProgressBar
 *      nodes={session.nodes}
 *      currentNodeId={currentSlideNode?.id}
 *      onNodeClick={(nodeId) => goToSlide(nodes.findIndex(n => n.id === nodeId))}
 *    />
 *    ```
 * ============================================================================
 */

import { cn } from "@/lib/utils";
import type { ConceptNode, NodeStatus } from "@/types/learning";
import { motion } from "framer-motion";
import { Fragment, useState } from "react";

interface ProgressBarProps {
	nodes: ConceptNode[];
	currentNodeId?: string;
	onNodeClick?: (nodeId: string) => void;
	className?: string;
}

export function ProgressBar({
	nodes,
	currentNodeId,
	onNodeClick,
	className,
}: ProgressBarProps) {
	const completedCount = nodes.filter((n) => n.status === "COMPLETED").length;

	// Pagination state: 10 nodes per page
	const nodesPerPage = 10;
	const totalPages = Math.ceil(nodes.length / nodesPerPage);

	const [currentPage, setCurrentPage] = useState(() => {
		const nodeIndex = nodes.findIndex((n) => n.id === currentNodeId);
		return nodeIndex !== -1 ? Math.floor(nodeIndex / nodesPerPage) : 0;
	});
	const [prevNodeId, setPrevNodeId] = useState(currentNodeId);

	// Sync current page when currentNodeId changes from outside
	if (currentNodeId !== prevNodeId) {
		setPrevNodeId(currentNodeId);
		const nodeIndex = nodes.findIndex((n) => n.id === currentNodeId);
		if (nodeIndex !== -1) {
			setCurrentPage(Math.floor(nodeIndex / nodesPerPage));
		}
	}

	const startIndex = currentPage * nodesPerPage;
	const endIndex = Math.min(nodes.length, startIndex + nodesPerPage);
	const visibleNodes = nodes.slice(startIndex, endIndex);

	const hasPrev = currentPage > 0;
	const hasNext = currentPage < totalPages - 1;

	const prevRangeText = hasPrev
		? `${(currentPage - 1) * nodesPerPage + 1}-${currentPage * nodesPerPage}`
		: "";

	const nextRangeText = hasNext
		? `${(currentPage + 1) * nodesPerPage + 1}-${Math.min(nodes.length, (currentPage + 2) * nodesPerPage)}`
		: "";

	return (
		<div className={cn("w-full", className)}>
			{/* Progress text with screen reader context */}
			<div className="flex items-center justify-between mb-3 text-sm select-none">
				<span className="text-muted-foreground font-semibold">Progress</span>
				<span className="font-semibold text-muted-foreground" aria-live="polite">
					<span className="sr-only">Course progress: </span>
					{completedCount} / {nodes.length} mastered
				</span>
			</div>

			{/* Node steps as navigation list structured as a glowing o---o---o chain */}
			<nav aria-label="Learning path progress" className="pt-8 pb-2 flex items-center justify-between gap-4">
				{totalPages > 1 && (
					<button
						onClick={() => hasPrev && setCurrentPage((prev) => prev - 1)}
						disabled={!hasPrev}
						className={cn(
							"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold select-none transition-all duration-200 flex-shrink-0 cursor-pointer",
							"border border-border/80 text-muted-foreground bg-card hover:bg-accent/40 focus:outline-none focus:ring-1 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background",
							!hasPrev && "opacity-30 cursor-not-allowed hover:bg-card"
						)}
						aria-label={hasPrev ? `Go to topics ${prevRangeText}` : "No previous topics"}
					>
						<span className="text-sm font-bold">&lt;</span>
						{hasPrev && <span>{prevRangeText}</span>}
					</button>
				)}

				<ol className="flex items-center justify-center flex-1 gap-0 list-none p-0 m-0">
					{visibleNodes.map((node, localIndex) => {
						const globalIndex = startIndex + localIndex;
						const isCurrent = node.id === currentNodeId;
						const isLocked = node.status === "LOCKED";
						const canClick = !isLocked && onNodeClick;
						const isCompleted = node.status === "COMPLETED";
						const isError = node.status === "ERROR";
						const isInProgress = !isCompleted && !isLocked && !isError;

						// Define 3D spherical lens colors using radial gradients
						let lensBgClass = "";
						if (isCompleted) {
							lensBgClass = "bg-[radial-gradient(circle_at_50%_35%,_#4ade80_0%,_#16a34a_60%,_#14532d_100%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.6)]";
						} else if (isCurrent) {
							lensBgClass = "bg-[radial-gradient(circle_at_50%_35%,_#ffe082_0%,_#ffb74d_60%,_#78350f_100%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.7)]";
						} else if (isInProgress) {
							lensBgClass = "bg-[radial-gradient(circle_at_50%_35%,_#ffd54f_0%,_#ffa726_65%,_#5d4037_100%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.6)]";
						} else if (isError) {
							lensBgClass = "bg-[radial-gradient(circle_at_50%_35%,_#f87171_0%,_#dc2626_60%,_#7f1d1d_100%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.6)]";
						} else {
							lensBgClass = "bg-[radial-gradient(circle_at_50%_35%,_#a1a1aa_0%,_#52525b_70%,_#27272a_100%)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]";
						}

						// Metallic bezel classes
						const bezelClass = isCurrent
							? "from-zinc-200 via-zinc-400 to-zinc-700 ring-2 ring-primary ring-offset-1 ring-offset-background"
							: isLocked
								? "from-zinc-700 via-zinc-800 to-zinc-900 opacity-60"
								: "from-zinc-400 via-zinc-600 to-zinc-800";

						const nextNode = nodes[globalIndex + 1];
						const isNextUnlocked = nextNode && nextNode.status !== "LOCKED";

						return (
							<Fragment key={node.id}>
								{/* Node (button) */}
								<li className="relative flex items-center group">
									{/* Hover Popover showing 1-based order number */}
									<div
										className={cn(
											"absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[10px] font-bold z-30 select-none transition-all duration-200 ease-out whitespace-nowrap",
											"bg-primary text-primary-foreground shadow-lg",
											"opacity-0 scale-75 translate-y-1.5 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0",
											"border border-zinc-950/20"
										)}
									>
										{globalIndex + 1}
									</div>

									<motion.button
										onClick={() => {
											if (canClick) {
												onNodeClick(node.id);
											}
										}}
										disabled={isLocked}
										aria-disabled={isLocked}
										aria-current={isCurrent ? "step" : undefined}
										aria-label={`${node.title}: ${formatStatusForScreenReader(node.status, globalIndex + 1)}`}
										whileHover={!isLocked ? { scale: 1.2 } : {}}
										whileTap={!isLocked ? { scale: 0.9 } : {}}
										className={cn(
											"w-5.5 h-5.5 rounded-full p-[1.5px] transition-all duration-300 flex items-center justify-center flex-shrink-0 z-10",
											"bg-gradient-to-b shadow-[0_2px_4px_rgba(0,0,0,0.5)] border border-zinc-950/60",
											bezelClass,
											isLocked
												? "cursor-not-allowed"
												: "cursor-pointer",
											"focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
										)}
									>
										{/* Inner dark groove/bezel border */}
										<div className="w-full h-full rounded-full p-[0.5px] bg-zinc-950/50 flex items-center justify-center">
											{/* Inner Lens */}
											<div className={cn("w-full h-full rounded-full relative overflow-hidden flex items-center justify-center", lensBgClass)}>
												{/* Glossy light glare reflection sweep */}
												<span className="absolute top-[0.5px] left-[1px] right-[1px] h-[40%] rounded-t-full rounded-b-[45%] bg-gradient-to-b from-white/60 to-white/0 pointer-events-none z-10" />
												
												{/* Active center indicator */}
												{isCurrent && (
													<span className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)] z-20" />
												)}
											</div>
										</div>
									</motion.button>
								</li>

								{/* Connecting Edge (Line) */}
								{localIndex < visibleNodes.length - 1 && (
									<li className="flex-1 h-[3px]" aria-hidden="true">
										<div
											className={cn(
												"h-full w-full transition-all duration-300",
												isNextUnlocked
													? "bg-primary"
													: "bg-primary/20"
											)}
										/>
									</li>
								)}
							</Fragment>
						);
					})}
				</ol>

				{totalPages > 1 && (
					<button
						onClick={() => hasNext && setCurrentPage((prev) => prev + 1)}
						disabled={!hasNext}
						className={cn(
							"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold select-none transition-all duration-200 flex-shrink-0 cursor-pointer",
							"border border-border/80 text-muted-foreground bg-card hover:bg-accent/40 focus:outline-none focus:ring-1 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background",
							!hasNext && "opacity-30 cursor-not-allowed hover:bg-card"
						)}
						aria-label={hasNext ? `Go to topics ${nextRangeText}` : "No next topics"}
					>
						{hasNext && <span>{nextRangeText}</span>}
						<span className="text-sm font-bold">&gt;</span>
					</button>
				)}
			</nav>

			{/* Legend - visible to screen readers for context on step colors */}
			<div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground select-none">
				<div className="flex items-center gap-1.5">
					<div
						className="w-4 h-4 rounded-full p-[1.5px] bg-gradient-to-b from-zinc-400 via-zinc-600 to-zinc-800 border border-zinc-950/60 shadow-[0_1px_2px_rgba(0,0,0,0.4)] flex items-center justify-center"
					>
						<div className="w-full h-full rounded-full p-[0.5px] bg-zinc-950/50 flex items-center justify-center">
							<div className="w-full h-full rounded-full relative overflow-hidden bg-[radial-gradient(circle_at_50%_35%,_#4ade80_0%,_#16a34a_60%,_#14532d_100%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.5)]">
								<span className="absolute top-[0.5px] left-[0.5px] right-[0.5px] h-[40%] rounded-t-full rounded-b-[45%] bg-gradient-to-b from-white/50 to-white/0 pointer-events-none" />
							</div>
						</div>
					</div>
					<span>Mastered</span>
				</div>
				<div className="flex items-center gap-1.5">
					<div
						className="w-4 h-4 rounded-full p-[1.5px] bg-gradient-to-b from-zinc-400 via-zinc-600 to-zinc-800 border border-zinc-950/60 shadow-[0_1px_2px_rgba(0,0,0,0.4)] flex items-center justify-center"
					>
						<div className="w-full h-full rounded-full p-[0.5px] bg-zinc-950/50 flex items-center justify-center">
							<div className="w-full h-full rounded-full relative overflow-hidden bg-[radial-gradient(circle_at_50%_35%,_#ffe082_0%,_#ffb74d_60%,_#78350f_100%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.5)]">
								<span className="absolute top-[0.5px] left-[0.5px] right-[0.5px] h-[40%] rounded-t-full rounded-b-[45%] bg-gradient-to-b from-white/50 to-white/0 pointer-events-none" />
							</div>
						</div>
					</div>
					<span>In progress</span>
				</div>
				<div className="flex items-center gap-1.5">
					<div className="w-4 h-4 rounded-full p-[1.5px] bg-gradient-to-b from-zinc-700 to-zinc-900 opacity-60 border border-zinc-950/60 flex items-center justify-center">
						<div className="w-full h-full rounded-full p-[0.5px] bg-zinc-950/50 flex items-center justify-center">
							<div className="w-full h-full rounded-full relative overflow-hidden bg-[radial-gradient(circle_at_50%_35%,_#a1a1aa_0%,_#52525b_70%,_#27272a_100%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]">
								<span className="absolute top-[0.5px] left-[0.5px] right-[0.5px] h-[40%] rounded-t-full rounded-b-[45%] bg-gradient-to-b from-white/30 to-white/0 pointer-events-none" />
							</div>
						</div>
					</div>
					<span>Locked</span>
				</div>
			</div>
		</div>
	);
}


function formatStatusForScreenReader(
	status: NodeStatus,
	stepNumber: number,
): string {
	switch (status) {
		case "LOCKED":
			return `Step ${stepNumber}, locked. Complete previous topics to unlock.`;
		case "VIEWING_EXPLANATION":
			return `Step ${stepNumber}, currently reading explanation`;
		case "IN_QUIZ":
			return `Step ${stepNumber}, currently taking quiz`;
		case "SHOWING_FEEDBACK":
			return `Step ${stepNumber}, reviewing feedback`;
		case "COMPLETED":
			return `Step ${stepNumber}, mastered`;
		case "ERROR":
			return `Step ${stepNumber}, error occurred. Retry available.`;
		default:
			return `Step ${stepNumber}, ${status}`;
	}
}
