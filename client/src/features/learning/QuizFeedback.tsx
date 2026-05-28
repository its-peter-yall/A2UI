/**
 * ============================================================================
 * FILE: QuizFeedback.tsx
 * LOCATION: client/src/features/learning/QuizFeedback.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Displays detailed quiz results after a user submits an answer. Shows
 *    correct/incorrect state, option explanations, and action buttons to
 *    retry or continue. Supports both single QuizCard and QuizSet.
 *
 * ROLE IN PROJECT:
 *    Feedback layer within the learning feature, rendered by ConceptCard when
 *    node status is SHOWING_FEEDBACK. Drives the retry-or-continue decision
 *    point in the sequential learning flow.
 *
 * KEY COMPONENTS:
 *    - QuizFeedback: Main component with result header and action buttons
 *    - Result Header: Shows correct/incorrect icon, attempt count, score
 *    - Quiz Set Progress: Shows "Quiz X of Y" when displaying a QuizSet
 *    - Option Feedback: Each option shows correct/incorrect state with explanation
 *    - Action Buttons: Retry, Next Quiz, or Continue
 *
 * DEPENDENCIES:
 *    - External: (none)
 *    - Internal: @/lib/utils (cn), @/types/learning (QuizCard, QuizSet, QuizSubmitResponse)
 *
 * USAGE:
 *    ```tsx
 *    <QuizFeedback
 *      quiz={node.quiz}
 *      result={feedbackResult}
 *      attemptCount={attemptCount}
 *      onRetry={() => handleRetry()}
 *      onContinue={feedbackResult.is_mastered ? () => onContinueToNext?.(node.id) : undefined}
 *    />
 *    ```
 * ============================================================================
 */

import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { QuizCard, QuizSet, QuizSubmitResponse } from "@/types/learning";

interface QuizFeedbackProps {
	quiz: QuizCard | QuizSet;
	result: QuizSubmitResponse;
	attemptCount: number;
	currentQuizIndex?: number;
	onRetry?: () => void;
	onContinue?: () => void;
	onNextQuiz?: () => void;
}

export function QuizFeedback({
	quiz,
	result,
	attemptCount,
	currentQuizIndex = 0,
	onRetry,
	onContinue,
	onNextQuiz,
}: QuizFeedbackProps) {
	const {
		is_correct,
		is_mastered,
		selected_option_id,
		correct_option_id,
		explanation,
		selected_explanation,
	} = result;

	// Determine if we're dealing with a QuizSet and extract current quiz
	const isQuizSet = "quizzes" in quiz;
	const currentQuiz = isQuizSet
		? (quiz.quizzes[currentQuizIndex] ?? quiz.quizzes[0])
		: quiz;

	// Guard against undefined current quiz (edge case: empty quiz set)
	if (!currentQuiz) {
		return (
			<div className="p-4 text-center text-muted-foreground">
				No quiz data available.
			</div>
		);
	}

	const totalQuizzes = isQuizSet ? quiz.quizzes.length : 1;
	const hasMoreQuizzes = currentQuizIndex < totalQuizzes - 1;

	const resultHeaderRef = useRef<HTMLDivElement>(null);

	// Move focus to feedback header after answer submission
	useEffect(() => {
		if (result && resultHeaderRef.current) {
			resultHeaderRef.current.focus();
		}
	}, [result]);

	// For wrong answers, correct_option_id is null (not revealed)
	// Only show correct answer when user answered correctly
	const showCorrectAnswer = is_correct && correct_option_id !== null;

	// Difficulty label styles
	const difficultyStyles = {
		easy: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
		medium:
			"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
		hard: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
	};

	return (
		<div className="space-y-6">
			{/* Result header */}
			<div
				ref={resultHeaderRef}
				tabIndex={-1}
				className={cn(
					"flex items-center gap-3 p-4 rounded-lg focus:outline-none",
					is_correct
						? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
						: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200",
				)}
			>
				<span className="text-2xl">{is_correct ? "✅" : "❌"}</span>
				<div>
					<p className="font-semibold text-lg">
						{is_correct ? "Correct!" : "Incorrect"}
					</p>
					<p className="text-sm opacity-80">
						Attempt #{attemptCount} • Score: {result.score_percent}%
					</p>
				</div>
				{is_mastered && (
					<span className="ml-auto text-sm font-medium bg-green-500 text-white px-2 py-1 rounded">
						Mastered!
					</span>
				)}
			</div>

			{/* Quiz set progress indicator */}
			{isQuizSet && totalQuizzes > 1 && (
				<div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
					<span>
						Quiz {currentQuizIndex + 1} of {totalQuizzes}
					</span>
					{currentQuiz?.difficulty && (
						<span
							className={cn(
								"text-xs font-medium px-2 py-0.5 rounded-full",
								difficultyStyles[
									currentQuiz.difficulty as "easy" | "medium" | "hard"
								],
							)}
						>
							{currentQuiz.difficulty.charAt(0).toUpperCase() +
								currentQuiz.difficulty.slice(1)}
						</span>
					)}
				</div>
			)}

			{/* Question */}
			<div>
				<p className="font-medium text-lg">{currentQuiz.question_text}</p>
			</div>

			{/* Options with feedback */}
			<div className="space-y-3">
				{currentQuiz.options.map((option) => {
					const isSelected = option.option_id === selected_option_id;
					const isCorrectOption = option.option_id === correct_option_id;

					return (
						<div
							key={option.option_id}
							className={cn(
								"p-4 rounded-lg border-2 transition-all",
								// Show correct answer styling only when user answered correctly
								showCorrectAnswer &&
									isCorrectOption &&
									"border-green-500 bg-green-50 dark:bg-green-900/20",
								// Show selected wrong answer styling
								isSelected &&
									!isCorrectOption &&
									"border-red-500 bg-red-50 dark:bg-red-900/20",
								// Default styling for unselected options when answer was wrong
								!isSelected && !isCorrectOption && "border-muted bg-muted/30",
								// When answer was correct but this option wasn't selected, show neutral
								!isSelected &&
									!isCorrectOption &&
									showCorrectAnswer &&
									"border-muted bg-muted/30",
							)}
						>
							<div className="flex items-start gap-3">
								{/* Option indicator with display_label */}
								<div
									className={cn(
										"w-6 h-6 rounded-full flex items-center justify-center text-sm font-mono shrink-0",
										showCorrectAnswer &&
											isCorrectOption &&
											"bg-green-500 text-white",
										isSelected && !isCorrectOption && "bg-red-500 text-white",
										(!showCorrectAnswer || (!isSelected && !isCorrectOption)) &&
											"bg-muted text-muted-foreground",
									)}
								>
									{option.display_label}
								</div>

								{/* Option content */}
								<div className="flex-1 space-y-2">
									<div className="flex items-center gap-2">
										<span className="font-medium">{option.text}</span>
										{isSelected && (
											<span className="text-xs text-muted-foreground">
												(Your answer)
											</span>
										)}
										{showCorrectAnswer && isCorrectOption && (
											<span className="text-xs text-green-600 dark:text-green-400 font-medium">
												✓ Correct answer
											</span>
										)}
									</div>

									{/* Explanation - show from result data */}
									{/* When answer is correct, show all option explanations for learning */}
									{showCorrectAnswer && (
										<div className="mt-2">
											{isCorrectOption ? (
												<div>
													<span className="text-xs text-green-600 dark:text-green-400 font-medium block mb-1">
														✓ Correct answer
													</span>
													<p className="text-sm text-green-700 dark:text-green-300">
														{explanation}
													</p>
												</div>
											) : (
												<div>
													<span className="text-xs text-muted-foreground font-medium block mb-1">
														Why this is incorrect:
													</span>
													<p className="text-sm text-muted-foreground">
														{option.explanation}
													</p>
												</div>
											)}
										</div>
									)}
									{/* Show explanation for wrong selected answer (when answer is wrong) */}
									{!showCorrectAnswer &&
										isSelected &&
										!isCorrectOption &&
										selected_explanation && (
											<div className="mt-2">
												<span className="text-xs text-red-500 dark:text-red-400 font-medium block mb-1">
													Why this is incorrect:
												</span>
												<p className="text-sm text-red-600 dark:text-red-300">
													{selected_explanation}
												</p>
											</div>
										)}
								</div>
							</div>
						</div>
					);
				})}
			</div>

			{/* Action buttons */}
			<div className="flex justify-end gap-3 pt-4 border-t">
				{/* Next Quiz button - only show for QuizSet when correct and more quizzes exist */}
				{isQuizSet && is_correct && hasMoreQuizzes && onNextQuiz && (
					<button
						onClick={onNextQuiz}
						className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
					>
						Next Quiz →
					</button>
				)}

				{/* Retry button - show when not mastered and no next quiz or not in set */}
				{!is_mastered &&
					onRetry &&
					(!isQuizSet || !is_correct || !hasMoreQuizzes) && (
						<button
							onClick={onRetry}
							className="px-4 py-2 border rounded-md hover:bg-muted transition-colors"
						>
							Try Again
						</button>
					)}

				{/* Continue button - only show when mastered */}
				{is_mastered && onContinue && (
					<button
						onClick={onContinue}
						className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
					>
						{result.next_node_unlocked
							? "Continue to Next Topic →"
							: "Complete Course 🎉"}
					</button>
				)}

				{/* Course complete message when mastered but no continue handler */}
				{is_mastered && !onContinue && (
					<span className="px-4 py-2 text-muted-foreground">
						Course complete! 🎉
					</span>
				)}
			</div>
		</div>
	);
}
