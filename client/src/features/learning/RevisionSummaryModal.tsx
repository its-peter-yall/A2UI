/**
 * ============================================================================
 * FILE: RevisionSummaryModal.tsx
 * LOCATION: client/src/features/learning/RevisionSummaryModal.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Modal displayed on revision completion showing performance summary.
 *
 * ROLE IN PROJECT:
 *    Shown by RevisionPage when a revision session reaches "completed" status.
 *    Presents quiz scores, topics reviewed, time spent, and a comparison with
 *    the original attempt. Provides actions to return to the dashboard or
 *    start a new revision.
 *
 * KEY COMPONENTS:
 *    - RevisionSummaryModal: Dialog with stats grid, comparison section, actions
 *    - ImprovementBadge: Color-coded badge for positive/negative/zero improvement
 *    - formatDuration: Converts seconds to human-readable "Xm Ys" string
 *
 * DEPENDENCIES:
 *    - External: react, framer-motion, lucide-react
 *    - Internal: @/types/learning (RevisionSummary), @/lib/utils
 *
 * USAGE:
 *    <RevisionSummaryModal
 *      revisionSummary={summaryData}
 *      onClose={handleClose}
 *      onReviseAgain={handleReviseAgain}
 *      onBackToDashboard={handleBackToDashboard}
 *    />
 * ============================================================================
 */
// RevisionSummaryModal.tsx
// Modal displayed on revision completion showing performance summary and comparison

// Shows revision stats (topics reviewed, quiz scores), comparison with original
// attempt (improvement percentage), and provides actions to go back to dashboard
// or start another revision. Uses glassmorphism styling with Framer Motion entrance.

// @see: RevisionPage.tsx (parent integration)
// @see: client/src/types/learning.ts (RevisionSummary)
// @note: comparison section only renders when comparison data is available

import { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { RevisionSummary } from "@/types/learning";
import { cn } from "@/lib/utils";

export interface RevisionSummaryModalProps {
	revisionSummary: RevisionSummary;
	onClose: () => void;
	onReviseAgain: () => void;
	onBackToDashboard: () => void;
}

/**
 * Format seconds into a human-readable duration string.
 */
function formatDuration(seconds: number): string {
	if (seconds < 60) {
		return `${seconds}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	if (remainingSeconds === 0) {
		return `${minutes}m`;
	}
	return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Get the mode label for display.
 */
function getModeLabel(mode: RevisionSummary["mode"]): string {
	return mode === "full_review" ? "Full Review" : "Quiz Only";
}

export function RevisionSummaryModal({
	revisionSummary,
	onClose,
	onReviseAgain,
	onBackToDashboard,
}: RevisionSummaryModalProps) {
	const modalRef = useRef<HTMLDivElement>(null);

	// Focus trap: focus the modal on mount and trap focus
	useEffect(() => {
		const previousActiveElement = document.activeElement as HTMLElement | null;

		// Focus the first focusable element, or the modal itself
		const focusableSelector =
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
		const modal = modalRef.current;
		if (modal) {
			const focusableElements =
				modal.querySelectorAll<HTMLElement>(focusableSelector);
			if (focusableElements.length > 0) {
				focusableElements[0].focus();
			} else {
				modal.focus();
			}
		}

		return () => {
			previousActiveElement?.focus();
		};
	}, []);

	// Focus trap and escape key handler
	useEffect(() => {
		const modal = modalRef.current;
		if (!modal) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
				return;
			}

			if (event.key !== "Tab") return;

			const focusableSelector =
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
			const focusableElements =
				modal.querySelectorAll<HTMLElement>(focusableSelector);
			if (focusableElements.length === 0) return;

			const firstElement = focusableElements[0];
			const lastElement = focusableElements[focusableElements.length - 1];

			if (event.shiftKey) {
				if (document.activeElement === firstElement) {
					event.preventDefault();
					lastElement.focus();
				}
			} else {
				if (document.activeElement === lastElement) {
					event.preventDefault();
					firstElement.focus();
				}
			}
		};

		modal.addEventListener("keydown", handleKeyDown);
		return () => modal.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	// Close on backdrop click
	const handleBackdropClick = useCallback(
		(event: React.MouseEvent) => {
			if (event.target === event.currentTarget) {
				onClose();
			}
		},
		[onClose],
	);

	const { comparison } = revisionSummary;
	const quizScore = revisionSummary.total_quiz_score_percent;

	return (
		<AnimatePresence>
			<motion.div
				className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				onClick={handleBackdropClick}
				data-testid="revision-summary-backdrop"
			>
				<motion.div
					ref={modalRef}
					role="dialog"
					aria-modal="true"
					aria-label="Revision Summary"
					tabIndex={-1}
					className={cn(
						"relative w-full max-w-md rounded-xl border border-white/10 p-6",
						"bg-card/95 backdrop-blur-md shadow-2xl",
						"flex flex-col gap-5",
						"focus:outline-none",
					)}
					initial={{ scale: 0.9, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					exit={{ scale: 0.9, opacity: 0 }}
					transition={{ type: "spring", stiffness: 300, damping: 25 }}
					data-testid="revision-summary-modal"
				>
					{/* Header */}
					<div className="flex flex-col items-center gap-2 text-center">
						<Trophy
							className="h-10 w-10 text-[var(--cyber-yellow)]"
							aria-hidden="true"
							data-testid="celebration-icon"
						/>
						<h2 className="text-xl font-bold text-foreground">
							Revision Complete!
						</h2>
						<span
							className={cn(
								"inline-block rounded-full px-3 py-0.5 text-xs font-medium",
								revisionSummary.mode === "full_review"
									? "bg-primary/20 text-primary"
									: "bg-blue-500/20 text-blue-400",
							)}
							data-testid="mode-badge"
						>
							{getModeLabel(revisionSummary.mode)}
						</span>
					</div>

					{/* Stats */}
					<div className="grid grid-cols-2 gap-3" data-testid="stats-section">
						<div className="rounded-lg bg-muted/50 p-3 text-center">
							<p className="text-2xl font-bold text-foreground">
								{revisionSummary.nodes_reviewed}/{revisionSummary.nodes_total}
							</p>
							<p className="text-xs text-muted-foreground">Topics Reviewed</p>
						</div>
						<div className="rounded-lg bg-muted/50 p-3 text-center">
							<p className="text-2xl font-bold text-foreground">
								{quizScore !== null ? `${Math.round(quizScore)}%` : "N/A"}
							</p>
							<p className="text-xs text-muted-foreground">Quiz Score</p>
						</div>
					</div>

					{/* Quiz breakdown */}
					{revisionSummary.quizzes_total > 0 && (
						<div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
							<span data-testid="quizzes-passed">
								<span className="font-medium text-green-400">
									{revisionSummary.quizzes_passed}
								</span>{" "}
								passed
							</span>
							<span className="text-white/20">|</span>
							<span data-testid="quizzes-failed">
								<span className="font-medium text-red-400">
									{revisionSummary.quizzes_failed}
								</span>{" "}
								failed
							</span>
							<span className="text-white/20">|</span>
							<span>{revisionSummary.quizzes_total} total</span>
						</div>
					)}

					{/* Time spent */}
					{revisionSummary.time_spent_seconds !== null && (
						<p
							className="text-center text-xs text-muted-foreground"
							data-testid="time-spent"
						>
							Time spent: {formatDuration(revisionSummary.time_spent_seconds)}
						</p>
					)}

					{/* Comparison section */}
					{comparison && (
						<div
							className="rounded-lg border border-white/10 bg-muted/30 p-4 space-y-2"
							data-testid="comparison-section"
						>
							<h3 className="text-sm font-medium text-foreground text-center">
								Performance Comparison
							</h3>
							<div className="flex items-center justify-between text-sm">
								<span className="text-muted-foreground">Original Score:</span>
								<span
									className="font-medium text-foreground"
									data-testid="original-score"
								>
									{Math.round(comparison.original_quiz_score_percent)}%
								</span>
							</div>
							<div className="flex items-center justify-between text-sm">
								<span className="text-muted-foreground">Improvement:</span>
								<ImprovementBadge
									improvement={comparison.improvement_percent}
								/>
							</div>
						</div>
					)}

					{/* Action buttons */}
					<div className="flex flex-col gap-2 sm:flex-row sm:gap-3 pt-1">
						<button
							onClick={onBackToDashboard}
							className={cn(
								"flex-1 rounded-lg px-4 py-2 text-sm font-medium",
								"border border-white/10 text-muted-foreground",
								"hover:bg-muted/50 transition-colors",
								"focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
							)}
							data-testid="back-to-dashboard-btn"
						>
							Back to Dashboard
						</button>
						<button
							onClick={onReviseAgain}
							className={cn(
								"flex-1 rounded-lg px-4 py-2 text-sm font-medium",
								"bg-primary text-primary-foreground",
								"hover:bg-primary/90 transition-colors",
								"focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
							)}
							data-testid="revise-again-btn"
						>
							Revise Again
						</button>
					</div>
				</motion.div>
			</motion.div>
		</AnimatePresence>
	);
}

/**
 * Displays improvement percentage with color-coded arrow indicator.
 */
function ImprovementBadge({ improvement }: { improvement: number }) {
	const rounded = Math.round(improvement);

	if (rounded > 0) {
		return (
			<span
				className="flex items-center gap-1 font-medium text-green-400"
				data-testid="improvement-badge"
				data-improvement="positive"
			>
				+{rounded}%
				<ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
			</span>
		);
	}

	if (rounded < 0) {
		return (
			<span
				className="flex items-center gap-1 font-medium text-red-400"
				data-testid="improvement-badge"
				data-improvement="negative"
			>
				{rounded}%
				<ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
			</span>
		);
	}

	return (
		<span
			className="flex items-center gap-1 font-medium text-gray-400"
			data-testid="improvement-badge"
			data-improvement="neutral"
		>
			No change
			<Minus className="h-3.5 w-3.5" aria-hidden="true" />
		</span>
	);
}
