/**
 * ============================================================================
 * FILE: RevisionPage.tsx
 * LOCATION: client/src/features/learning/RevisionPage.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Route-keyed page body for revision sessions, rendering membership-filtered
 *    concept cards in a carousel with page-owned quiz UI state.
 *
 * ROLE IN PROJECT:
 *    Mounted at /learn/:sessionId/revise/:revisionId. The exported route wrapper
 *    keys the body by session and revision so navigation, quiz selections,
 *    summary visibility, chat targeting, and request state can never survive a
 *    revision route change. Reads the original session for topic content and
 *    the revision session for authoritative progress; revision activity never
 *    mutates original-course state.
 *
 * KEY COMPONENTS:
 *    - RevisionPage: Route wrapper with parameter validation
 *    - RevisionPageBody: Keyed body owning carousel, selections, and notices
 *    - goToSlide: Membership-bounded topic navigation
 *
 * DEPENDENCIES:
 *    - External: react, react-router-dom, @tanstack/react-query, axios, framer-motion
 *    - Internal: @/lib/learningApi, ./useRevisionSession, ./useRevisionMutations,
 *                ./RevisionConceptCard, ./RevisionSummaryModal,
 *                ./TableOfContentsModal, ./ChatPanel, ./revisionQuizState,
 *                @/components/SettingsButton, @/components/ThemeToggle,
 *                ./animations, ./ErrorStates, @/types/learning
 *
 * USAGE:
 *    <Route path="/learn/:sessionId/revise/:revisionId" element={<RevisionPage />} />
 * ============================================================================
 */
// RevisionPage.tsx
// Main page for revision mode, displaying concept cards in either
// full_review or quiz_only mode with revision-specific progress tracking.

// @see: LearningPage.tsx (original learning page)
// @see: RevisionConceptCard.tsx (revision card component)
// @see: RevisionSummaryModal.tsx (completion summary modal)
// @see: useRevisionSession.ts, useRevisionMutations.ts (hooks)

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { List, MessageCircle } from "lucide-react";
import {
	createRevisionSession,
	getLearningSession,
	getRevisionSummary,
} from "@/lib/learningApi";
import {
	getRevisionCompletion,
	revisionQueryKeys,
	useRevisionSession,
} from "./useRevisionSession";
import { useRevisionMutations } from "./useRevisionMutations";
import { RevisionConceptCard } from "./RevisionConceptCard";
import { RevisionSummaryModal } from "./RevisionSummaryModal";
import { ChatPanel } from "./ChatPanel";
import { ConceptChatLayout } from "./ConceptChatLayout";
import { useConceptChatPanel } from "./useConceptChatPanel";
import { SettingsButton } from "@/components/SettingsButton";
import { cn } from "@/lib/utils";
import {
	carouselSlideVariants,
	carouselSlideReducedMotionVariants,
	prefersReducedMotion,
} from "./animations";
import { LoadingState, ErrorState } from "./ErrorStates";
import { createRevisionQuizState } from "./revisionQuizState";
import type { RevisionQuizUiState } from "./revisionQuizState";
import type {
	ConceptNode,
	RevisionNodeProgressWithDetails,
	RevisionNoticeCode,
	RevisionSessionWithProgress,
} from "@/types/learning";

/**
 * Route wrapper for the revision session.
 *
 * The body is keyed by session and revision so every revision-local state -
 * carousel position, quiz selections, summary visibility, chat ownership, and
 * in-flight request flags - is discarded on a route change. Hook-level success
 * callbacks still update their own (old) cache after unmount.
 */
export function RevisionPage() {
	const { sessionId, revisionId } = useParams<{
		sessionId: string;
		revisionId: string;
	}>();

	if (!sessionId || !revisionId) {
		return (
			<ErrorState
				title="Missing revision"
				message="Missing session or revision ID."
				showHomeLink
			/>
		);
	}

	return (
		<RevisionPageBody
			key={`${sessionId}:${revisionId}`}
			sessionId={sessionId}
			revisionId={revisionId}
		/>
	);
}

/**
 * Body for one loaded revision route.
 *
 * All topics shown, every carousel count, and all navigation come from the
 * revision's own node membership, so a topic absent from the revision is never
 * fabricated into the list and never counted.
 */
function RevisionPageBody({
	sessionId,
	revisionId,
}: {
	sessionId: string;
	revisionId: string;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	// Focus management
	const carouselRef = useRef<HTMLDivElement>(null);

	// Carousel state
	const [currentIndex, setCurrentIndex] = useState(0);
	const [direction, setDirection] = useState(0);

	// TOC state
	const [isTOCOpen, setIsTOCOpen] = useState(false);

	// Page-owned ephemeral quiz UI state, keyed by node so unmounting a topic
	// card cannot discard unsubmitted selections.
	const [quizStateByNode, setQuizStateByNode] = useState<
		Record<string, RevisionQuizUiState>
	>({});

	// Fetch original session for node content/quizzes
	const {
		data: originalSession,
		isLoading: isLoadingOriginal,
		isError: isOriginalError,
		error: originalError,
	} = useQuery({
		queryKey: ["learningSession", sessionId],
		queryFn: () => getLearningSession(sessionId),
		enabled: !!sessionId,
		staleTime: 60_000,
	});

	// Fetch revision session for progress
	const {
		data: revisionSession,
		isLoading: isLoadingRevision,
		isError: isRevisionError,
		error: revisionError,
	} = useRevisionSession(revisionId);

	useEffect(() => {
		// Focus the carousel container for keyboard navigation
		if (!isLoadingOriginal && !isLoadingRevision && carouselRef.current) {
			carouselRef.current.focus();
		}
	}, [isLoadingOriginal, isLoadingRevision]);

	// Revision mutations
	const { markReviewed, submitAnswer, quizRequestStates, reviewRequestStates, isAnyLoading } =
		useRevisionMutations({
			revisionId,
			onError: (error, context) => {
				console.error(`Revision mutation error (${context}):`, error);
			},
		});

	/**
	 * Summary visibility is route-local and starts false.
	 *
	 * Server completion alone never opens the summary, so submitting a final
	 * quiz does not cover the feedback the user just asked for, and re-entering
	 * a completed revision leaves its content readable.
	 */
	const [isSummaryOpen, setIsSummaryOpen] = useState(false);

	const summaryQuery = useQuery({
		queryKey: revisionQueryKeys.summary(revisionId),
		queryFn: ({ signal }) => getRevisionSummary(revisionId, signal),
		enabled: isSummaryOpen && revisionSession?.status === "completed",
		staleTime: 30_000,
	});

	// Guard late navigation and state updates from an unmounted route.
	const mounted = useRef(true);
	const [createRevisionError, setCreateRevisionError] = useState<string>();
	const [isCreatingRevision, setIsCreatingRevision] = useState(false);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	/**
	 * Start another revision in the same mode.
	 *
	 * Explicit only, never automatic on completion, and a failure surfaces a
	 * recoverable message rather than leaving the action silently inert.
	 */
	const handleReviseAgain = useCallback(async () => {
		if (!revisionSession || isCreatingRevision) return;
		setCreateRevisionError(undefined);
		setIsCreatingRevision(true);
		try {
			const next = await createRevisionSession(sessionId, {
				mode: revisionSession.mode,
			});
			void queryClient.invalidateQueries({
				queryKey: revisionQueryKeys.list(sessionId),
				exact: true,
			});
			void queryClient.invalidateQueries({ queryKey: ["courses"] });
			if (mounted.current) navigate(`/learn/${sessionId}/revise/${next.id}`);
		} catch (error: unknown) {
			console.error("Could not create another revision:", error);
			if (mounted.current) {
				setCreateRevisionError("Could not create another revision. Please try again.");
			}
		} finally {
			if (mounted.current) setIsCreatingRevision(false);
		}
	}, [revisionSession, sessionId, isCreatingRevision, queryClient, navigate]);

	const handleCloseSummary = useCallback(() => {
		setIsSummaryOpen(false);
	}, []);

	const handleBackToDashboard = useCallback(() => {
		setIsSummaryOpen(false);
		navigate("/learn");
	}, [navigate]);

	/**
	 * Topics this revision actually covers, in original course order.
	 */
	const topics =
		originalSession?.nodes.filter((node) =>
			revisionSession?.nodes.some((progress) => progress.node_id === node.id),
		) ?? [];
	const currentNode = topics[currentIndex];
	const currentRevisionProgress: RevisionNodeProgressWithDetails | undefined =
		currentNode
			? revisionSession?.nodes.find((progress) => progress.node_id === currentNode.id)
			: undefined;

	/**
	 * Explicit conversation ownership.
	 *
	 * Opening captures a topic ID, so carousel navigation alone never rebinds or
	 * cancels an open conversation. Only an explicit question or heading action
	 * retargets chat. Defined before every early return so the controller is
	 * never conditionally created.
	 */
	const chat = useConceptChatPanel({
		sessionId,
		activeTopicId: currentNode?.id,
		activeTopicTitle: currentNode?.title,
	});

	/**
	 * The element that invoked chat, captured when an open action starts.
	 *
	 * ChatPanel refocuses its own captured element on desktop close, but the
	 * sub-768px overlay unmounts the whole panel, so a close there leaves focus
	 * on body; the page then restores this recorded opener instead.
	 */
	const chatOpenerRef = useRef<HTMLElement | null>(null);
	const openChatCapturingOpener = (open: () => void) => {
		if (!chat.isOpen) {
			const active = document.activeElement;
			chatOpenerRef.current =
				active instanceof HTMLElement && active !== document.body
					? active
					: null;
		}
		open();
	};

	// Run after ChatPanel's own restore (effects run child first): recover the
	// recorded opener only when close still left focus on body, which is the
	// mobile-overlay unmount path, and never steal a successful restore.
	const wasChatOpen = useRef(false);
	useEffect(() => {
		if (chat.isOpen) {
			wasChatOpen.current = true;
			return;
		}
		if (!wasChatOpen.current) return;
		wasChatOpen.current = false;
		const opener = chatOpenerRef.current;
		chatOpenerRef.current = null;
		if (!opener || document.activeElement !== document.body) return;
		if (opener.isConnected) opener.focus();
	}, [chat.isOpen]);

	// Carousel navigation
	const goToSlide = useCallback(
		(index: number) => {
			if (topics.length === 0) return;
			const clamped = Math.max(0, Math.min(index, topics.length - 1));
			const dir = clamped > currentIndex ? 1 : clamped < currentIndex ? -1 : 0;
			setDirection(dir);
			setCurrentIndex(clamped);
		},
		[topics.length, currentIndex],
	);

	const canGoNext = currentIndex < topics.length - 1;
	const canGoPrev = currentIndex > 0;

	// Loading state
	if (isLoadingOriginal || isLoadingRevision) {
		return <LoadingState message="Loading revision session..." />;
	}

	// Error states
	const error = originalError || revisionError;
	const isNotFound =
		(isOriginalError || isRevisionError) &&
		axios.isAxiosError(error) &&
		error.response?.status === 404;

	if (isNotFound) {
		return (
			<div className="flex flex-col items-center justify-center min-h-screen gap-4">
				<p className="text-xl font-semibold">Revision not found</p>
				<p className="text-muted-foreground">
					This revision session doesn&apos;t exist or has been removed.
				</p>
				<Link
					to="/learn"
					className="text-primary hover:text-primary/80 transition-colors"
				>
					&larr; Dashboard
				</Link>
			</div>
		);
	}

	if (isOriginalError || isRevisionError) {
		return (
			<ErrorState
				title="Failed to load revision"
				message="We couldn't load the revision data. Please try again."
				showHomeLink
			/>
		);
	}

	if (!originalSession || !revisionSession) {
		return (
			<ErrorState
				title="No data available"
				message="Session or revision data is missing."
				showHomeLink
			/>
		);
	}

	// Reject a revision that does not belong to this course before rendering
	// any topic, so foreign progress is never displayed.
	if (revisionSession.original_session_id !== sessionId) {
		return (
			<ErrorState
				title="Invalid revision ownership"
				message="This revision does not belong to the requested course."
				showHomeLink
			/>
		);
	}

	// Determine header text based on mode
	const modeLabel =
		revisionSession.mode === "full_review" ? "Full Review" : "Practice Quizzes";
	const modeBadgeColor =
		revisionSession.mode === "full_review"
			? "bg-blue-500/20 text-blue-600 dark:text-blue-400"
			: "bg-green-500/20 text-green-600 dark:text-green-400";

	// Calculate revision-specific progress
	const { total: totalNodes, completed: completedNodes } =
		getRevisionCompletion(revisionSession);

	/**
	 * The summary is offered only when the server reports authoritative
	 * completion over a nonzero participating topic count, so a zero-denominator
	 * revision never offers a successful-completion summary.
	 */
	const canViewSummary =
		revisionSession.status === "completed" && totalNodes > 0;

	/**
	 * Compatibility guidance, one stable message per notice code.
	 *
	 * Incompatible attempt counts are summed so a page load never repeats the
	 * same explanation for every affected topic, and a refetch that resolves a
	 * notice simply drops its line.
	 */
	const noticeCodes = [
		...new Set(revisionSession.notices.map((notice) => notice.code)),
	];
	const noticeCopy: Record<RevisionNoticeCode, string> = {
		legacy_review_inferred:
			"Earlier explicit review was restored from the saved review date.",
		legacy_review_required:
			"Earlier quiz activity did not record explicit reading review. Use Mark as Reviewed to finish reading.",
		incompatible_attempts: `${revisionSession.notices
			.filter((notice) => notice.code === "incompatible_attempts")
			.reduce((sum, notice) => sum + notice.attempt_count, 0)} historical attempts were retained but cannot match the available quizzes. They are excluded from feedback, completion, and accuracy.`,
		completion_recalculated:
			"Completion was recalculated from reading review or submitted quizzes. Earlier completion totals may be lower; saved compatible feedback remains available.",
	};

	/**
	 * A revision topic whose original content is gone stays navigable; it is a
	 * recoverable data notice, never authority to invent membership.
	 */
	const hasUnavailableTopic = revisionSession.nodes.some(
		(node) =>
			!originalSession.nodes.some((topic) => topic.id === node.node_id),
	);

	return (
		<div className="h-dvh min-h-0 flex flex-col overflow-hidden bg-background">
			{/* Skip to main content link for keyboard users */}
			<a
				href="#main-content"
				className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
			>
				Skip to main content
			</a>
			{/* Header */}
			<header className="shrink-0 z-10 bg-background/95 backdrop-blur border-b">
				<div className="max-w-6xl mx-auto px-4 py-3">
					<div className="flex items-center justify-between mb-3">
						<button
							onClick={() => navigate("/learn")}
							className={cn(
								"flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors",
								"focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md px-2 py-1",
							)}
							aria-label="Go to dashboard"
							data-testid="back-to-dashboard"
						>
							<span aria-hidden="true">&larr;</span>
							<span>Dashboard</span>
						</button>
						<div
							className="flex items-center gap-2 overflow-hidden"
							data-testid="revision-header"
						>
							<span className="text-sm font-medium text-foreground truncate max-w-[200px]">
								Revision #{revisionSession.revision_number}
							</span>
							<span
								className={cn(
									"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0",
									modeBadgeColor,
								)}
								data-testid="revision-mode-badge"
							>
								{modeLabel}
							</span>
						</div>
						<div className="w-24 flex justify-end">
							<SettingsButton />
						</div>{" "}
						{/* Spacer for alignment */}
					</div>

					{/* Table of Contents button (replaces progress bar) */}
					<div className="flex items-center justify-between pt-1">
						<div className="flex items-center gap-2">
							<button
								onClick={() => setIsTOCOpen(true)}
								className="inline-flex items-center gap-2 text-sm font-medium border border-input bg-background hover:bg-muted text-foreground rounded-lg px-3.5 py-1.5 transition-colors cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-primary"
								aria-label="Open Table of Contents"
								data-testid="toc-button"
							>
								<List className="h-4 w-4 text-primary" />
								<span>Table of Contents</span>
							</button>
							{canViewSummary && (
								<button
									type="button"
									onClick={() => setIsSummaryOpen(true)}
									className="rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
								>
									View Summary
								</button>
							)}
						</div>
						<div
							className="text-xs font-medium text-muted-foreground"
							aria-live="polite"
						>
							{completedNodes} / {totalNodes} topics{" "}
							{revisionSession.mode === "full_review" ? "reviewed" : "finished"}
						</div>
					</div>
				</div>
			</header>

			{/*
			 * Bounded, viewport-height shell. Header and footer stay fixed while
			 * content and chat scroll independently inside it, so chat can never
			 * render beneath the final quiz or at the bottom-left.
			 */}
			<main id="main-content" className="min-h-0 flex-1 overflow-hidden">
				<ConceptChatLayout
					isChatOpen={chat.isOpen}
					chatWidthPercent={chat.chatWidthPercent}
					onChatWidthChange={chat.setChatWidthPercent}
					onCloseChat={chat.closeChat}
					className="[&_[role=dialog]]:max-md:!w-full"
					chatPanel={
						<ChatPanel
							isOpen={chat.isOpen}
							onClose={chat.closeChat}
							sessionId={sessionId}
							nodeId={chat.chatNodeId}
							topicTitle={chat.chatTopicTitle}
							selectedHeadingIds={chat.selectedHeadingIds}
							onClearHeadings={chat.clearHeadings}
							widthPercent={chat.chatWidthPercent}
							prefillMessage={chat.prefillMessage}
							onPrefillConsumed={chat.consumePrefill}
						/>
					}
				>
					<div
						className={cn(
							"mx-auto w-full flex flex-col gap-6",
							chat.isOpen ? "max-w-5xl" : "max-w-6xl",
						)}
					>
					{/* Course title */}
					<header className="text-center">
						<h1 className="text-2xl font-bold">
							{originalSession.course_title}
						</h1>
					</header>

					{/* Compatibility guidance, one message per code */}
					{noticeCodes.length > 0 && (
						<aside
							aria-label="Revision compatibility notices"
							className="rounded-lg border bg-muted/30 p-3"
						>
							{noticeCodes.map((code) => (
								<p key={code} className="text-sm text-muted-foreground">
									{noticeCopy[code]}
								</p>
							))}
						</aside>
					)}

					{/* Zero-denominator and empty-revision guidance */}
					{revisionSession.mode === "quiz_only" && totalNodes === 0 && (
						<p role="status">No practice quizzes available.</p>
					)}
					{topics.length === 0 && (
						<p role="status">No topics available in this revision.</p>
					)}
					{hasUnavailableTopic && (
						<p role="status">
							Some saved revision topics are unavailable in this course. Available
							topics remain usable.
						</p>
					)}

					{/* Attempt accuracy, never derived from topic statuses */}
					<span className="text-xs text-muted-foreground">
						{revisionSession.total_quiz_score_percent === null
							? "Attempt accuracy: N/A"
							: `${revisionSession.total_quiz_score_percent}% attempt accuracy`}
					</span>

					{/* Slide counter */}
					{topics.length > 0 && (
						<div className="flex justify-center text-sm text-muted-foreground">
							<span>
								Topic {currentIndex + 1} of {topics.length}
							</span>
						</div>
					)}

					{/* Carousel */}
					<div
						className="relative overflow-hidden outline-none"
						role="region"
						aria-roledescription="carousel"
						aria-label="Revision carousel"
						ref={carouselRef}
						tabIndex={-1}
					>
						<AnimatePresence mode="wait" custom={direction} initial={false}>
							{currentNode && currentRevisionProgress && (
								<motion.div
									key={currentNode.id}
									custom={direction}
									variants={
										prefersReducedMotion()
											? carouselSlideReducedMotionVariants
											: carouselSlideVariants
									}
									initial="enter"
									animate="center"
									exit="exit"
									className="w-full relative"
								>
									<RevisionConceptCard
										key={currentNode.id}
										node={currentNode}
										revisionMode={revisionSession.mode}
										revisionProgress={currentRevisionProgress}
										revisionId={revisionId}
										quizState={
											quizStateByNode[currentNode.id] ??
											createRevisionQuizState()
										}
										onQuizStateChange={(next) =>
											setQuizStateByNode((previous) => ({
												...previous,
												[currentNode.id]: next,
											}))
										}
										quizResults={currentRevisionProgress.quiz_results}
										quizRequestStates={quizRequestStates[currentNode.id]}
										onQuizSubmit={submitAnswer}
										onMarkReviewed={markReviewed}
										isMarkingReviewed={
											reviewRequestStates[currentNode.id]?.isPending
										}
										markReviewedError={reviewRequestStates[currentNode.id]?.error}
										selectedHeadingIds={
											chat.chatNodeId === currentNode.id
												? chat.selectedHeadingIds
												: []
										}
										onToggleHeadingChat={(headingId) =>
											openChatCapturingOpener(() =>
												chat.toggleHeadingChat(
													headingId,
													currentNode.id,
													currentNode.title,
												),
											)
										}
										onAskQuestion={(question) =>
											openChatCapturingOpener(() =>
												chat.askQuestion(
													question,
													currentNode.id,
													currentNode.title,
												),
											)
										}
									/>
								</motion.div>
							)}
						</AnimatePresence>
					</div>

					{/* Navigation buttons */}
					{topics.length > 0 && (
						<div className="flex justify-between items-center">
							<button
								aria-label="Previous topic"
								onClick={() => goToSlide(currentIndex - 1)}
								disabled={!canGoPrev}
								className={cn(
									"px-4 py-2 rounded-md text-sm font-medium transition-colors",
									canGoPrev
										? "text-muted-foreground hover:bg-muted cursor-pointer"
										: "opacity-0 pointer-events-none",
								)}
							>
								&larr; Previous
							</button>
							<button
								aria-label="Next topic"
								onClick={() => goToSlide(currentIndex + 1)}
								disabled={!canGoNext}
								className={cn(
									"px-4 py-2 rounded-md text-sm font-medium transition-colors",
									canGoNext
										? "text-muted-foreground hover:bg-muted cursor-pointer"
										: "opacity-0 pointer-events-none",
								)}
							>
								Next &rarr;
							</button>
						</div>
					)}
				</div>
				</ConceptChatLayout>
			</main>

			{/* Loading overlay for mutations */}
			{isAnyLoading && (
				<div
					className="fixed bottom-4 right-4 bg-background border rounded-lg shadow-lg p-3 flex items-center gap-2"
					role="status"
					aria-busy="true"
					aria-label="Loading"
				>
					<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
					<span className="text-sm text-muted-foreground">Updating...</span>
				</div>
			)}

			{/*
			 * Chat FAB - bottom-right fixed. It stays mounted while chat is open
			 * so the panel can restore focus to it on close; opacity-0 (never
			 * hidden/invisible, which would blur it and defeat that capture)
			 * plus pointer-events, tabindex, and aria-hidden keep it out of
			 * pointer, keyboard, and assistive reach in that state.
			 */}
			{currentNode && (
				<button
					onClick={() =>
						openChatCapturingOpener(() =>
							chat.openChat(currentNode.id, currentNode.title),
						)
					}
					className={cn(
						"fixed bottom-6 right-6 z-30 h-14 w-14 rounded-full bg-(--cyber-yellow) text-black shadow-lg hover:bg-(--cyber-yellow)/90 transition-colors flex items-center justify-center cursor-pointer",
						chat.isOpen && "pointer-events-none opacity-0",
					)}
					aria-label="Open concept chat"
					data-testid="revision-chat-fab"
					aria-hidden={chat.isOpen || undefined}
					tabIndex={chat.isOpen ? -1 : undefined}
				>
					<MessageCircle className="h-6 w-6" />
				</button>
			)}

			{/* Table of Contents Modal */}
			{isTOCOpen && (
				<RevisionContentsDialog
					topics={topics}
					session={revisionSession}
					currentNodeId={currentNode?.id}
					onSelect={goToSlide}
					onClose={() => setIsTOCOpen(false)}
				/>
			)}

			{/* Footer */}
			<footer className="shrink-0 border-t py-4 text-center text-sm text-muted-foreground">
				<p>Revision mode &mdash; your original progress is preserved</p>
			</footer>

			{/* Revise-again recovery */}
			{createRevisionError && <p role="alert">{createRevisionError}</p>}

			{/*
			 * Explicit summary. While refreshing, the stale modal is hidden
			 * rather than shown with outdated accuracy, and a fetch failure
			 * offers recovery instead of silently displaying old metrics.
			 */}
			{isSummaryOpen && summaryQuery.isFetching && (
				<p role="status">Loading summary...</p>
			)}
			{isSummaryOpen && summaryQuery.isError && (
				<div role="alert">
					Could not load the summary.{" "}
					<button
						type="button"
						onClick={() => {
							void summaryQuery.refetch();
						}}
					>
						Try loading summary again
					</button>
					<button type="button" onClick={handleCloseSummary}>
						Close summary
					</button>
				</div>
			)}
			{isSummaryOpen &&
				!summaryQuery.isFetching &&
				!summaryQuery.isError &&
				summaryQuery.data?.revision_id === revisionId && (
					<RevisionSummaryModal
						revisionSummary={summaryQuery.data}
						onClose={handleCloseSummary}
						onReviseAgain={handleReviseAgain}
						onBackToDashboard={handleBackToDashboard}
					/>
				)}
		</div>
	);
}
/**
 * Revision-scoped table of contents.
 *
 * This is intentionally a separate dialog from the shared normal-learning
 * `TableOfContentsModal`, whose mastery, lock, and unlock vocabulary does not
 * apply to a revision. Every revision topic stays navigable and its status is
 * described with mode-specific wording: reading review for Full Review, and
 * submission coverage for Practice.
 */
function RevisionContentsDialog({
	topics,
	session,
	currentNodeId,
	onSelect,
	onClose,
}: {
	topics: ConceptNode[];
	session: RevisionSessionWithProgress;
	currentNodeId?: string;
	onSelect: (index: number) => void;
	onClose: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const previous =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		ref.current?.focus();
		return () => {
			previous?.focus();
		};
	}, []);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				ref={ref}
				role="dialog"
				aria-modal="true"
				aria-label="Table of Contents"
				tabIndex={-1}
				className="max-h-[80dvh] w-full max-w-4xl overflow-y-auto rounded-xl border bg-card p-6"
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.stopPropagation();
						onClose();
					}
					if (event.key !== "Tab") return;
					const controls = ref.current?.querySelectorAll<HTMLButtonElement>("button");
					const first = controls?.[0];
					const last = controls?.[controls.length - 1];
					if (
						event.shiftKey &&
						(document.activeElement === first || document.activeElement === ref.current)
					) {
						event.preventDefault();
						last?.focus();
					}
					if (!event.shiftKey && document.activeElement === last) {
						event.preventDefault();
						first?.focus();
					}
				}}
			>
				<button
					type="button"
					aria-label="Close Table of Contents"
					onClick={onClose}
					className="rounded-md px-2 py-1 focus-visible:ring-2 focus-visible:ring-primary"
				>
					Close
				</button>
				<h2 className="text-xl font-bold">Table of Contents</h2>
				<table className="w-full text-left text-sm">
					<thead>
						<tr>
							<th>Topic</th>
							<th>Quizzes</th>
							<th>Difficulty</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{topics.map((node, index) => {
							const progress = session.nodes.find(
								(row) => row.node_id === node.id,
							);
							const label =
								session.mode === "full_review"
									? progress?.content_reviewed_at
										? "Reviewed"
										: "Reading pending"
									: progress?.quiz_count === 0
										? "No quiz available"
										: progress && progress.quiz_results.length === progress.quiz_count
											? "Practice finished"
											: "Practice pending";
							return (
								<tr key={node.id} className="border-t">
									<td className="p-3">
										<button
											type="button"
											aria-current={currentNodeId === node.id ? "step" : undefined}
											onClick={() => {
												onSelect(index);
												onClose();
											}}
											className="rounded text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary"
										>
											{node.title}
										</button>
									</td>
									<td>{progress?.quiz_count ?? 0}</td>
									<td>{node.complexity}</td>
									<td>{label}</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}
