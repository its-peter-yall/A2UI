# Implementation Plan: Table of Contents & Progress Bar Refactoring

This document describes the step-by-step implementation plan for refactoring the course progress indicators and introducing a structured Table of Contents (TOC) feature. The changes align with the codebase conventions and satisfy all requirements outlined in [goal.md](file:///D:/Peter/A2UI/docs/goal.md).

---

## 1. Design & UI Specifications

### A. Table of Contents Modal
The Table of Contents displays as a beautiful glassmorphic modal overlay. It provides structured overview and navigation capabilities for the course.

#### Styling Tokens (Tailwind 4.x)
- **Backdrop Overlay**: `fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center`
- **Modal Container**: `bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-xl p-6 w-full max-w-4xl max-h-[85vh] flex flex-col focus:outline-none relative`
- **Topic Status Badge Styles**:
  - *Mastered*: `bg-emerald-500/10 text-emerald-400 border border-emerald-500/20`
  - *In Progress*: `bg-amber-500/10 text-amber-400 border border-amber-500/20`
  - *Locked*: `bg-zinc-800/50 text-zinc-500 border border-zinc-700/30`
- **Complexity Badge Styles**:
  - *Basic*: `bg-emerald-500/10 text-emerald-400 border border-emerald-500/20`
  - *Intermediate*: `bg-amber-500/10 text-amber-400 border border-amber-500/20`
  - *Advanced*: `bg-rose-500/10 text-rose-400 border border-rose-500/20`

#### Exact Column Layout
We use a standard HTML `<table>` or grid system nested in a scrollable body wrapper (`overflow-y-auto h-[480px] max-h-[480px] pr-2 scrollbar-thin`):
1. **Column 1 (`Topic #` / `w-[10%]` / `text-center`)**: Displays the 1-based topic index (`#1`, `#2`, etc.).
2. **Column 2 (`Topic Name` / `w-[50%]`)**: Displayed as a button/link. If the topic is unlocked, clicking navigates to the topic and closes the modal. If locked, it displays as muted text.
3. **Column 3 (`Quizzes` / `w-[15%]` / `text-center`)**: Shows the total count of quizzes in this topic.
4. **Column 4 (`Difficulty` / `w-[15%]` / `text-center`)**: Displays a badge of complexity (Basic, Intermediate, Advanced).
5. **Column 5 (`Status` / `w-[10%]` / `text-center`)**: Displays status indicator (Mastered / In Progress / Locked).

#### Topic Pagination & Scrolling Height Constraints
To display exactly **10 topics at once**, we set the row height to a fixed value (e.g. `h-[48px]`) and the table body container height to exactly `480px` (`h-[480px]`). Any additional topics are scrolled to view.

#### Scroll-to-View Handling
When the modal opens, the active topic row should be automatically scrolled into view. We handle this using a React `ref` pointing to the row of the current active topic:
```tsx
const activeRowRef = useRef<HTMLTableRowElement | null>(null);

useEffect(() => {
  if (isOpen && activeRowRef.current) {
    activeRowRef.current.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }
}, [isOpen]);
```

---

### B. Glowing Green Progress Bar
The old step-by-step navigation progress bar (`o---o---o`) and its pagination controls are removed. It is replaced with a single, high-fidelity glowing progress bar.

#### Structure & Glow Styling
The glowing bar consists of an outer track and an animated inner fill:
- **Outer Track**: `h-3 bg-zinc-800/80 rounded-full relative overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] border border-zinc-700/20`
- **Inner Fill**: A Framer Motion `motion.div` with an emerald-to-green gradient and neon box shadow:
  ```tsx
  <motion.div
    className="h-full bg-gradient-to-r from-emerald-500 via-green-400 to-emerald-400 rounded-full relative shadow-[0_0_12px_rgba(34,197,94,0.8)]"
    initial={{ width: 0 }}
    animate={{ width: `${percent}%` }}
    transition={{ duration: 0.5, ease: "easeOut" }}
  >
    {/* Inner shimmer sweep */}
    <span className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.15)_50%,transparent_100%)] animate-[shimmer_2s_infinite] rounded-full pointer-events-none" />
  </motion.div>
  ```
- **Outer Glow Backdrop**: An optional secondary `div` blurred behind the main track for extreme glow:
  ```tsx
  <div
    className="absolute top-2 left-0 h-3.5 bg-green-500/15 blur-[3px] rounded-full pointer-events-none transition-all duration-500"
    style={{ width: `${percent}%` }}
  />
  ```

---

## 2. Code Modifications

### A. [TableOfContentsModal.tsx](file:///D:/Peter/A2UI/client/src/features/learning/TableOfContentsModal.tsx) (New Component)
Create a new file containing the Table of Contents modal component.

```tsx
import { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lock, CheckCircle2, PlayCircle, HelpCircle } from "lucide-react";
import type { ConceptNode } from "@/types/learning";
import { cn } from "@/lib/utils";

interface TableOfContentsModalProps {
	isOpen: boolean;
	onClose: () => void;
	nodes: ConceptNode[];
	currentNodeId?: string;
	onSelectTopic: (index: number) => void;
}

function getNumQuizzes(node: ConceptNode): number {
	if (node.quiz_set) return node.quiz_set.quizzes.length;
	if (node.quiz_set_hidden) return node.quiz_set_hidden.total_quizzes || node.quiz_set_hidden.quizzes.length;
	if (node.quiz || node.quiz_hidden) return 1;
	return 0;
}

export function TableOfContentsModal({
	isOpen,
	onClose,
	nodes,
	currentNodeId,
	onSelectTopic,
}: TableOfContentsModalProps) {
	const modalRef = useRef<HTMLDivElement>(null);
	const activeRowRef = useRef<HTMLTableRowElement | null>(null);

	// Focus trap & Escape key
	useEffect(() => {
		if (!isOpen) return;
		const previousActiveElement = document.activeElement as HTMLElement | null;
		
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
				return;
			}
			if (event.key !== "Tab") return;

			const focusableSelector = 'button, [href], [tabindex]:not([tabindex="-1"])';
			const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(focusableSelector);
			if (!focusableElements || focusableElements.length === 0) return;

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

		modalRef.current?.focus();
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			previousActiveElement?.focus();
		};
	}, [isOpen, onClose]);

	// Auto-scroll active row into view
	useEffect(() => {
		if (isOpen && activeRowRef.current) {
			activeRowRef.current.scrollIntoView({
				behavior: "smooth",
				block: "nearest",
			});
		}
	}, [isOpen]);

	if (!isOpen) return null;

	return (
		<AnimatePresence>
			<motion.div
				className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				onClick={(e) => e.target === e.currentTarget && onClose()}
			>
				<motion.div
					ref={modalRef}
					role="dialog"
					aria-modal="true"
					aria-label="Table of Contents"
					tabIndex={-1}
					className="relative w-full max-w-4xl bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-xl p-6 flex flex-col focus:outline-none"
					initial={{ scale: 0.95, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					exit={{ scale: 0.95, opacity: 0 }}
					transition={{ type: "spring", stiffness: 300, damping: 25 }}
				>
					{/* Close Button */}
					<button
						onClick={onClose}
						className="absolute top-4 right-4 p-2 rounded-md hover:bg-muted text-muted-foreground transition-colors"
						aria-label="Close modal"
					>
						<X className="w-5 h-5" />
					</button>

					{/* Title */}
					<h2 className="text-xl font-bold text-foreground mb-4">Table of Contents</h2>

					{/* Table Container - Fits exactly 10 items (approx. 48px per row + headers) */}
					<div className="overflow-x-auto border border-border/60 rounded-lg bg-muted/20">
						<table className="w-full border-collapse text-left text-sm">
							<thead>
								<tr className="border-b border-border/60 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider h-10">
									<th className="px-4 w-[10%] text-center">#</th>
									<th className="px-4 w-[50%]">Topic Name</th>
									<th className="px-4 w-[15%] text-center">Quizzes</th>
									<th className="px-4 w-[15%] text-center">Difficulty</th>
									<th className="px-4 w-[10%] text-center">Status</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/40 overflow-y-auto block max-h-[480px] w-full">
								{nodes.map((node, index) => {
									const isCurrent = node.id === currentNodeId;
									const isLocked = node.status === "LOCKED";
									const isCompleted = node.status === "COMPLETED";
									const isInProgress = !isCompleted && !isLocked && node.status !== "ERROR";
									const numQuizzes = getNumQuizzes(node);

									let statusLabel = "In Progress";
									let statusBadgeClass = "bg-amber-500/10 text-amber-400 border border-amber-500/20";
									let statusIcon = <PlayCircle className="w-4 h-4" />;
									if (isLocked) {
										statusLabel = "Locked";
										statusBadgeClass = "bg-zinc-800/50 text-zinc-500 border border-zinc-700/30";
										statusIcon = <Lock className="w-4 h-4" />;
									} else if (isCompleted) {
										statusLabel = "Mastered";
										statusBadgeClass = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
										statusIcon = <CheckCircle2 className="w-4 h-4" />;
									} else if (node.status === "ERROR") {
										statusLabel = "In Progress";
										statusIcon = <HelpCircle className="w-4 h-4" />;
									}

									const complexityBadgeClass = 
										node.complexity === "Advanced" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
										node.complexity === "Intermediate" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
										"bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";

									return (
										<tr
											key={node.id}
											ref={isCurrent ? activeRowRef : undefined}
											className={cn(
												"h-12 block table-row hover:bg-muted/10 transition-colors",
												isCurrent && "bg-primary/5 border-l-2 border-primary"
											)}
										>
											<td className="px-4 text-center font-mono text-muted-foreground w-[10%]">
												#{node.sequence_index + 1}
											</td>
											<td className="px-4 w-[50%]">
												{!isLocked ? (
													<button
														onClick={() => {
															onSelectTopic(index);
															onClose();
														}}
														className="text-left font-medium text-primary hover:underline cursor-pointer"
													>
														{node.title}
													</button>
												) : (
													<span className="text-muted-foreground font-medium flex items-center gap-1.5 cursor-not-allowed">
														{node.title}
													</span>
												)}
											</td>
											<td className="px-4 text-center text-muted-foreground w-[15%]">
												{numQuizzes}
											</td>
											<td className="px-4 text-center w-[15%]">
												{node.complexity && (
													<span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", complexityBadgeClass)}>
														{node.complexity}
													</span>
												)}
											</td>
											<td className="px-4 w-[10%]">
												<div className="flex justify-center">
													<span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1", statusBadgeClass)} title={statusLabel}>
														{statusIcon}
														<span>{statusLabel}</span>
													</span>
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>

					{/* Bottom Legends & Key (Moved from Progress Bar) */}
					<div className="flex items-center gap-6 mt-6 pt-4 border-t border-border/60 text-xs text-muted-foreground select-none">
						<span className="font-semibold text-foreground">Status Legend:</span>
						<div className="flex items-center gap-1.5">
							<span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
							<span>Mastered</span>
						</div>
						<div className="flex items-center gap-1.5">
							<span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)] animate-pulse" />
							<span>In progress</span>
						</div>
						<div className="flex items-center gap-1.5">
							<span className="w-2.5 h-2.5 rounded-full bg-zinc-600" />
							<span>Locked</span>
						</div>
					</div>
				</motion.div>
			</motion.div>
		</AnimatePresence>
	);
}
```

---

### B. [ProgressBar.tsx](file:///D:/Peter/A2UI/client/src/features/learning/ProgressBar.tsx) (Refactoring)
Remove the old navigation controls/steps and replace them with the single glowing green progress bar.

```tsx
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
```

---

### C. [ConceptCard.tsx](file:///D:/Peter/A2UI/client/src/features/learning/ConceptCard.tsx) (Prop Coordination)
Accept `onOpenTOC` as an optional prop and render a meticulous "Table of Contents" button inside the card header for non-quiz screens (`VIEWING_EXPLANATION` or `COMPLETED`).

```tsx
// Inside ConceptCardProps Interface:
onOpenTOC?: () => void;

// Inside ConceptCard component, render in the Header section (around line 352-371):
<div className="flex items-center gap-2">
  {onOpenTOC && (node.status === "VIEWING_EXPLANATION" || node.status === "COMPLETED") && (
    <button
      type="button"
      onClick={onOpenTOC}
      className={cn(
        "px-2.5 py-1.5 rounded-lg text-xs font-semibold select-none transition-all duration-200 cursor-pointer flex items-center gap-1.5",
        "border border-border/80 text-muted-foreground bg-card hover:bg-accent/40 focus:outline-none focus:ring-1 focus:ring-primary"
      )}
      title="Open Table of Contents"
    >
      <span className="text-[10px]">☰</span>
      <span>Contents</span>
    </button>
  )}
  <span className="text-sm text-muted-foreground">
    #{node.sequence_index + 1}
  </span>
  ...
</div>
```

---

### E. [LearningPathContainer.tsx](file:///D:/Peter/A2UI/client/src/features/learning/LearningPathContainer.tsx) (Orchestration)
Integrate the Table of Contents modal state, bind navigation triggers, and hook up the callbacks.

1. **Imports**: Import `TableOfContentsModal` and required icons.
2. **State**: Add state `const [isTOCOpen, setIsTOCOpen] = useState(false);`
3. **ConceptCard integration**: Pass `onOpenTOC={() => setIsTOCOpen(true)}` to `<ConceptCard />`.
4. **Modal rendering**: Render `<TableOfContentsModal />` component just above `<ToastContainer />`.
5. **Progress Bar properties**: Simplify parameters passed to `<ProgressBar />` (removing `currentNodeId` and `onNodeClick` since they are no longer required for step nodes).

---

## 3. Execution Phases

| Phase | Description | Key Deliverables |
|---|---|---|
| **Phase 1** | Create Table of Contents component | `TableOfContentsModal.tsx` completed with focus trap, exact columns, scrolling body, and status legends. |
| **Phase 2** | Refactor Progress Bar component | `ProgressBar.tsx` refactored to single glowing green bar without pagination or step-by-step nodes. |
| **Phase 3** | Integrate Table of Contents in main layout | `LearningPathContainer.tsx` modified to hold modal states, update imports, and handle navigation clicks. |
| **Phase 4** | Add Entry button in Concept Card | `ConceptCard.tsx` header updated to show Table of Contents trigger button on explanation/mastered screens. |
| **Phase 5** | Verification & Clean compilation | Run full build (`npm run build` / `npm run lint`) to confirm TypeScript type-safety and ensure no styling glitches. |