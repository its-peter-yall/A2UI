/**
 * ============================================================================
 * FILE: ChatPanel.test.tsx
 * LOCATION: client/src/features/learning/ChatPanel.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the ChatPanel component. Verifies rendering, send button
 *    behavior, heading selection display, and close interaction.
 *
 * ROLE IN PROJECT:
 *    Test coverage for ChatPanel.tsx drawer component.
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react
 *    - Internal: @/features/learning/ChatPanel
 * ============================================================================
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatPanel } from "./ChatPanel";

// Mock scrollIntoView (not available in jsdom)
beforeAll(() => {
	Element.prototype.scrollIntoView = vi.fn();
});

// Mock useConceptChat
vi.mock("./useConceptChat", () => ({
	useConceptChat: () => ({
		messages: [],
		isStreaming: false,
		error: null,
		sendMessage: vi.fn(),
		resetChat: vi.fn(),
		stopStreaming: vi.fn(),
	}),
}));

// Mock react-markdown and plugins to avoid ESM issues
vi.mock("react-markdown", () => ({
	default: ({ children }: { children: string }) => <div>{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: {} }));
vi.mock("rehype-raw", () => ({ default: {} }));
vi.mock("rehype-sanitize", () => ({ default: {} }));

describe("ChatPanel", () => {
	const defaultProps = {
		isOpen: true,
		onClose: vi.fn(),
		sessionId: "sess-1",
		nodeId: "node-1",
		selectedHeadingIds: [],
		onClearHeadings: vi.fn(),
	};

	it("renders nothing when isOpen is false", () => {
		const { container } = render(
			<ChatPanel {...defaultProps} isOpen={false} />,
		);
		expect(container.textContent).toBe("");
	});

	it("renders chat panel when isOpen is true", () => {
		render(<ChatPanel {...defaultProps} />);
		expect(screen.getByText("Ask about this concept")).toBeDefined();
	});

	it("disables send button when input is empty", () => {
		render(<ChatPanel {...defaultProps} />);
		const sendButton = screen.getByLabelText("Send message");
		expect(sendButton).toBeDisabled();
	});

	it("enables send button when input has text", () => {
		render(<ChatPanel {...defaultProps} />);
		const textarea = screen.getByPlaceholderText("Ask a question...");
		fireEvent.change(textarea, { target: { value: "What is this?" } });
		const sendButton = screen.getByLabelText("Send message");
		expect(sendButton).not.toBeDisabled();
	});

	it("shows heading count when headings are selected", () => {
		render(
			<ChatPanel
				{...defaultProps}
				selectedHeadingIds={["h-2-intro", "h-3-details"]}
			/>,
		);
		expect(screen.getByText("2 headings selected")).toBeDefined();
	});

	it("shows singular heading text for one heading", () => {
		render(<ChatPanel {...defaultProps} selectedHeadingIds={["h-2-intro"]} />);
		expect(screen.getByText("1 heading selected")).toBeDefined();
	});

	it("calls onClose when close button clicked", () => {
		const onClose = vi.fn();
		render(<ChatPanel {...defaultProps} onClose={onClose} />);
		fireEvent.click(screen.getByLabelText("Close concept chat"));
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("calls onClose when backdrop clicked", () => {
		const onClose = vi.fn();
		render(<ChatPanel {...defaultProps} onClose={onClose} />);
		// Backdrop is the div with onClick={onClose}
		const backdrop = document.querySelector(".fixed.inset-0");
		expect(backdrop).not.toBeNull();
		fireEvent.click(backdrop!);
		expect(onClose).toHaveBeenCalledOnce();
	});
});
