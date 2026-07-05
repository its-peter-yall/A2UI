/**
 * ============================================================================
 * FILE: ProgressBar.tsx
 * LOCATION: client/src/features/learning/ProgressBar.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Refactored visual progress indicator showing the user's overall advancement
 *    through the learning path using a single glowing green progress bar.
 *
 * ROLE IN PROJECT:
 *    Presentational component rendered by LearningPathContainer. Displays
 *    overall completion percentage with a glowing bar and shimmer effects.
 *
 * KEY COMPONENTS:
 *    - ProgressBar: Main progress bar with animated fill and glow effect.
 *
 * DEPENDENCIES:
 *    - External: framer-motion, react
 *    - Internal: @/lib/utils (cn), @/types/learning (ConceptNode)
 *
 * USAGE:
 *    ```tsx
 *    <ProgressBar
 *      nodes={session.nodes}
 *    />
 *    ```
 * ============================================================================
 */

import { cn } from "@/lib/utils";
import type { ConceptNode } from "@/types/learning";
import { motion } from "framer-motion";

interface ProgressBarProps {
	nodes: ConceptNode[];
	className?: string;
}

export function ProgressBar({ nodes, className }: ProgressBarProps) {
	const completedCount = nodes.filter((n) => n.status === "COMPLETED").length;
	const percent = nodes.length > 0 ? (completedCount / nodes.length) * 100 : 0;

	return (
		<div className={cn("w-full select-none", className)}>
			{/* Progress text with screen reader context */}
			<div className="flex items-center justify-between mb-3 text-sm">
				<span className="text-muted-foreground font-semibold">Course Progress</span>
				<span className="font-semibold text-muted-foreground" aria-live="polite">
					<span className="sr-only">Course completion: </span>
					{completedCount} / {nodes.length} mastered ({Math.round(percent)}%)
				</span>
			</div>

			{/* Glowing Progress Bar Track */}
			<div className="relative w-full py-2">
				<div className="w-full h-3.5 bg-zinc-800/80 rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] border border-zinc-700/20 overflow-hidden relative">
					<motion.div
						className="h-full bg-gradient-to-r from-emerald-500 via-green-400 to-emerald-400 rounded-full relative shadow-[0_0_12px_rgba(34,197,94,0.8)]"
						initial={{ width: 0 }}
						animate={{ width: `${percent}%` }}
						transition={{ duration: 0.5, ease: "easeOut" }}
					>
						{/* Subtle Inner shimmer sweep */}
						<span className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.15)_50%,transparent_100%)] animate-[shimmer_2s_infinite] rounded-full pointer-events-none" />
					</motion.div>
				</div>
				{/* Soft Outer Neon Glow Overlay */}
				<div
					className="absolute top-2 left-0 h-3.5 bg-green-500/15 blur-[3px] rounded-full pointer-events-none transition-all duration-500"
					style={{ width: `${percent}%` }}
				/>
			</div>
		</div>
	);
}
