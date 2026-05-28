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
 *    - External: framer-motion
 *    - Internal: @/lib/utils (cn), @/types/learning (ConceptNode, NodeStatus),
 *                ./animations (progressStepVariants)
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
import { progressStepVariants } from "./animations";

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
	const progressPercent =
		nodes.length > 0 ? (completedCount / nodes.length) * 100 : 0;

	return (
		<div className={cn("w-full", className)}>
			{/* Progress text with screen reader context */}
			<div className="flex items-center justify-between mb-2 text-sm">
				<span className="text-muted-foreground">Progress</span>
				<span className="font-medium" aria-live="polite">
					<span className="sr-only">Course progress: </span>
					{completedCount} / {nodes.length} mastered
				</span>
			</div>

			{/* Main progress bar with ARIA attributes */}
			<div
				className="h-2 bg-muted rounded-full overflow-hidden mb-3"
				role="progressbar"
				aria-valuenow={progressPercent}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label={`Course progress: ${Math.round(progressPercent)}% complete`}
			>
				<motion.div
					className="h-full bg-green-500 rounded-full"
					initial={{ width: 0 }}
					animate={{ width: `${progressPercent}%` }}
					transition={{
						type: "spring",
						stiffness: 100,
						damping: 20,
					}}
				/>
			</div>

			{/* Node steps as navigation list */}
			<nav aria-label="Learning path progress">
				<ol className="flex items-center gap-1 list-none p-0 m-0">
					{nodes.map((node, index) => {
						const isCurrent = node.id === currentNodeId;
						const isLocked = node.status === "LOCKED";
						const canClick = !isLocked && onNodeClick;
						const isCompleted = node.status === "COMPLETED";

						return (
							<li key={node.id} className="flex-1">
								<motion.button
									onClick={() => {
										// Only allow clicking non-locked nodes
										if (canClick) {
											onNodeClick(node.id);
										}
									}}
									disabled={isLocked}
									aria-disabled={isLocked}
									aria-current={isCurrent ? "step" : undefined}
									aria-label={`${node.title}: ${formatStatusForScreenReader(node.status, index + 1)}`}
									title={`${node.title} (${formatStatus(node.status)})`}
									variants={progressStepVariants}
									initial="incomplete"
									animate={isCompleted ? "complete" : "incomplete"}
									className={cn(
										"w-full h-2 rounded-full transition-colors duration-200",
										getStepColor(node.status),
										isCurrent && "ring-2 ring-offset-1 ring-primary",
										isLocked
											? "cursor-not-allowed opacity-50"
											: "cursor-pointer hover:opacity-80",
										// Focus styles for accessibility
										"focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
									)}
								/>
							</li>
						);
					})}
				</ol>
			</nav>

			{/* Legend - visible to screen readers for context on step colors */}
			<div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
				<div className="flex items-center gap-1">
					<div className="w-3 h-3 rounded-full bg-green-500" />
					<span>Mastered</span>
				</div>
				<div className="flex items-center gap-1">
					<div className="w-3 h-3 rounded-full bg-primary" />
					<span>In progress</span>
				</div>
				<div className="flex items-center gap-1">
					<div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
					<span>Locked</span>
				</div>
			</div>
		</div>
	);
}

function getStepColor(status: NodeStatus): string {
	switch (status) {
		case "COMPLETED":
			return "bg-green-500";
		case "LOCKED":
			return "bg-muted-foreground/30";
		case "ERROR":
			return "bg-destructive";
		default:
			// VIEWING_EXPLANATION, IN_QUIZ, SHOWING_FEEDBACK are all "active"
			return "bg-primary";
	}
}

function formatStatus(status: NodeStatus): string {
	switch (status) {
		case "LOCKED":
			return "Locked - complete previous topic first";
		case "VIEWING_EXPLANATION":
			return "Reading explanation";
		case "IN_QUIZ":
			return "Taking quiz";
		case "SHOWING_FEEDBACK":
			return "Reviewing feedback";
		case "COMPLETED":
			return "Mastered";
		case "ERROR":
			return "Error - retry available";
		default:
			return status;
	}
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
