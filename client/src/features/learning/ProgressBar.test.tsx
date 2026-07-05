/**
 * ============================================================================
 * FILE: ProgressBar.test.tsx
 * LOCATION: client/src/features/learning/ProgressBar.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the refactored ProgressBar component.
 *
 * ROLE IN PROJECT:
 *    Verifies that the progress bar only displays the overall progress percentage,
 *    correctly computes mastery stats, renders the glowing bar, and has completely
 *    removed the old step dots, legends, and pagination controls.
 *
 * KEY COMPONENTS:
 *    - ProgressBar: Glowing green progress bar indicator
 *
 * DEPENDENCIES:
 *    - External: @testing-library/react, vitest
 *    - Internal: ./ProgressBar
 *
 * USAGE:
 *    npm run test
 * ============================================================================
 */

import type { ComponentPropsWithoutRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";
import { ProgressBar } from "./ProgressBar";
import type { ConceptNode } from "@/types/learning";

// Mock framer-motion to avoid animation issues in jsdom environment
vi.mock("framer-motion", () => ({
	motion: {
		div: ({ children, style, ...props }: ComponentPropsWithoutRef<"div"> & { style?: React.CSSProperties }) => (
			<div {...props} style={style}>
				{children}
			</div>
		),
	},
}));

const mockNodes: ConceptNode[] = [
	{
		id: "node-1",
		learning_session_id: "session-1",
		sequence_index: 0,
		title: "Topic 1",
		content_markdown: "",
		status: "COMPLETED",
		error_message: null,
		retry_available: false,
		complexity: "Basic",
		quiz: null,
		quiz_set: null,
		quiz_hidden: null,
		quiz_set_hidden: null,
		created_at: "",
		updated_at: null,
	},
	{
		id: "node-2",
		learning_session_id: "session-1",
		sequence_index: 1,
		title: "Topic 2",
		content_markdown: "",
		status: "COMPLETED",
		error_message: null,
		retry_available: false,
		complexity: "Basic",
		quiz: null,
		quiz_set: null,
		quiz_hidden: null,
		quiz_set_hidden: null,
		created_at: "",
		updated_at: null,
	},
	{
		id: "node-3",
		learning_session_id: "session-1",
		sequence_index: 2,
		title: "Topic 3",
		content_markdown: "",
		status: "LOCKED",
		error_message: null,
		retry_available: false,
		complexity: "Advanced",
		quiz: null,
		quiz_set: null,
		quiz_hidden: null,
		quiz_set_hidden: null,
		created_at: "",
		updated_at: null,
	},
];

describe("ProgressBar Component (Refactored)", () => {
	test("displays overall progress percent and count", () => {
		render(<ProgressBar nodes={mockNodes} />);

		// Check the title "Course Progress"
		expect(screen.getByText("Course Progress")).toBeDefined();

		// Check progress stats: 2 of 3 mastered (67%)
		expect(screen.getByText(/2 \/ 3 mastered/)).toBeDefined();
		expect(screen.getByText(/67%/)).toBeDefined();
	});

	test("does not display pagination controls or step dots", () => {
		render(<ProgressBar nodes={mockNodes} />);

		// Old pagination buttons (< or >) should not exist
		expect(screen.queryByRole("button", { name: /</ })).toBeNull();
		expect(screen.queryByRole("button", { name: />/ })).toBeNull();

		// Old list/ol elements representing step dots should not exist
		expect(screen.queryByRole("list")).toBeNull();
		expect(screen.queryByRole("listitem")).toBeNull();
	});

	test("does not display legend section since it is moved to TOC", () => {
		render(<ProgressBar nodes={mockNodes} />);

		// "Status Legend:" or "Legend" should not be rendered
		expect(screen.queryByText(/Legend/i)).toBeNull();
	});
});
