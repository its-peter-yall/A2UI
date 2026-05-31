/**
 * ============================================================================
 * FILE: MarkdownRenderer.test.tsx
 * LOCATION: client/src/features/learning/MarkdownRenderer.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the MarkdownRenderer component. Verifies heading overrides,
 *    heading chat icons, and selected heading Cyber Yellow styling.
 *
 * ROLE IN PROJECT:
 *    Test coverage for MarkdownRenderer.tsx heading chat integration.
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react
 *    - Internal: @/features/learning/MarkdownRenderer
 * ============================================================================
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarkdownRenderer } from "./MarkdownRenderer";

// Mock react-markdown to pass through children directly for testability
vi.mock("react-markdown", () => ({
	default: ({
		components,
		children,
	}: {
		components?: Record<
			string,
			React.ComponentType<{ children: React.ReactNode }>
		>;
		children: string;
	}) => {
		const lines = children.split("\n");
		return (
			<div>
				{lines.map((line: string, i: number) => {
					const match = line.match(/^(#{2,6})\s+(.+)$/);
					if (match && components) {
						const level = match[1].length;
						const Tag = `h${level}` as keyof typeof components;
						const Comp = components[Tag];
						if (Comp) {
							return <Comp key={i}>{match[2]}</Comp>;
						}
					}
					return <p key={i}>{line}</p>;
				})}
			</div>
		);
	},
}));

vi.mock("remark-gfm", () => ({ default: {} }));
vi.mock("rehype-raw", () => ({ default: {} }));
vi.mock("rehype-sanitize", () => ({ default: {} }));

describe("MarkdownRenderer", () => {
	const content =
		"## Introduction\nSome text here.\n### Details\nMore details.\n#### SubSection\nSub content.\n##### FineDetail\nFine.\n###### MicroDetail\nMicro.";

	it("renders heading chat icons for h2-h6 when enableHeadingChat is true", () => {
		render(
			<MarkdownRenderer
				content={content}
				enableHeadingChat
				selectedHeadingIds={[]}
				onToggleHeadingChat={vi.fn()}
			/>,
		);

		const chatButtons = screen.getAllByLabelText(/Chat about/);
		expect(chatButtons.length).toBe(5);
	});

	it("does not render heading icons when enableHeadingChat is false", () => {
		render(<MarkdownRenderer content={content} enableHeadingChat={false} />);

		const chatButtons = screen.queryAllByLabelText(/Chat about/);
		expect(chatButtons).toHaveLength(0);
	});

	it("applies Cyber Yellow border to selected headings", () => {
		render(
			<MarkdownRenderer
				content={content}
				enableHeadingChat
				selectedHeadingIds={["h-2-introduction"]}
				onToggleHeadingChat={vi.fn()}
			/>,
		);

		// Find the h2 wrapper that should have selected styling
		const headingWrapper = document.querySelector(
			'[data-heading-id="h-2-introduction"]',
		);
		expect(headingWrapper).not.toBeNull();

		// The h2 inside should have yellow border class
		const h2 = headingWrapper?.querySelector("h2");
		expect(h2?.className).toContain("border-[#ffb74d]");
	});

	it("calls onToggleHeadingChat with heading ID when icon clicked", () => {
		const onToggle = vi.fn();
		render(
			<MarkdownRenderer
				content={content}
				enableHeadingChat
				selectedHeadingIds={[]}
				onToggleHeadingChat={onToggle}
			/>,
		);

		const chatButtons = screen.getAllByLabelText(/Chat about/);
		fireEvent.click(chatButtons[0]);
		expect(onToggle).toHaveBeenCalledWith("h-2-introduction");
	});

	it("allows multi-select: two selected heading IDs coexist", () => {
		render(
			<MarkdownRenderer
				content={content}
				enableHeadingChat
				selectedHeadingIds={["h-2-introduction", "h-3-details"]}
				onToggleHeadingChat={vi.fn()}
			/>,
		);

		const h2Wrapper = document.querySelector(
			'[data-heading-id="h-2-introduction"]',
		);
		const h3Wrapper = document.querySelector('[data-heading-id="h-3-details"]');
		expect(h2Wrapper).not.toBeNull();
		expect(h3Wrapper).not.toBeNull();

		const h2 = h2Wrapper?.querySelector("h2");
		const h3 = h3Wrapper?.querySelector("h3");
		expect(h2?.className).toContain("border-[#ffb74d]");
		expect(h3?.className).toContain("border-[#ffb74d]");
	});

	it("toggle-off: clicking a selected heading removes only that heading", () => {
		render(
			<MarkdownRenderer
				content={content}
				enableHeadingChat
				selectedHeadingIds={["h-2-introduction", "h-3-details"]}
				onToggleHeadingChat={vi.fn()}
			/>,
		);

		// h-2-introduction should have yellow border
		const h2 = document
			.querySelector('[data-heading-id="h-2-introduction"]')
			?.querySelector("h2");
		expect(h2?.className).toContain("border-[#ffb74d]");

		// h-4-subsection is NOT selected, should NOT have yellow border
		const h4 = document
			.querySelector('[data-heading-id="h-4-subsection"]')
			?.querySelector("h4");
		expect(h4?.className).not.toContain("border-[#ffb74d]");
	});

	it("generates correct heading IDs from text", () => {
		render(
			<MarkdownRenderer
				content={content}
				enableHeadingChat
				selectedHeadingIds={[]}
				onToggleHeadingChat={vi.fn()}
			/>,
		);

		expect(
			document.querySelector('[data-heading-id="h-2-introduction"]'),
		).not.toBeNull();
		expect(
			document.querySelector('[data-heading-id="h-3-details"]'),
		).not.toBeNull();
	});
});
