/**
 * ============================================================================
 * FILE: ConceptChatLayout.test.tsx
 * LOCATION: client/src/features/learning/ConceptChatLayout.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Tests ConceptChatLayout split desktop mode (>= 768px), keyboard/mouse
 *    separator resizing, and responsive sub-768px full-width overlay mode.
 *
 * ROLE IN PROJECT:
 *    Guards A13 layout boundaries, independent scrolling, and responsive safeguards.
 *
 * USAGE:
 *    npm run test -- --run src/features/learning/ConceptChatLayout.test.tsx
 * ============================================================================
 */

import type { ReactNode, ComponentPropsWithoutRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConceptChatLayout } from "./ConceptChatLayout";

vi.mock("framer-motion", () => ({
	motion: {
		div: ({
			children,
			...props
		}: ComponentPropsWithoutRef<"div">) => <div {...props}>{children}</div>,
	},
	AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

function mockMatchMedia(matches: boolean) {
	window.matchMedia = vi.fn().mockImplementation((query: string) => ({
		matches,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	}));
}

describe("ConceptChatLayout", () => {
	beforeEach(() => {
		mockMatchMedia(true); // Desktop by default
	});

	it("renders main content full width when chat is closed", () => {
		render(
			<ConceptChatLayout
				isChatOpen={false}
				chatWidthPercent={25}
				onChatWidthChange={vi.fn()}
				onCloseChat={vi.fn()}
				chatPanel={<div data-testid="chat-panel">Chat</div>}
			>
				<div data-testid="main-content">Course Content</div>
			</ConceptChatLayout>,
		);

		expect(screen.getByTestId("main-content")).toBeInTheDocument();
		expect(
			screen.queryByRole("separator", { name: "Resize chat panel" }),
		).not.toBeInTheDocument();
	});

	it("renders split view with resize separator on desktop (>= 768px) when chat is open", () => {
		mockMatchMedia(true);
		render(
			<ConceptChatLayout
				isChatOpen={true}
				chatWidthPercent={30}
				onChatWidthChange={vi.fn()}
				onCloseChat={vi.fn()}
				chatPanel={<div data-testid="chat-panel">Chat Panel</div>}
			>
				<div data-testid="main-content">Course Content</div>
			</ConceptChatLayout>,
		);

		expect(screen.getByTestId("main-content")).toBeInTheDocument();
		expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
		const separator = screen.getByRole("separator", {
			name: "Resize chat panel",
		});
		expect(separator).toBeInTheDocument();
		expect(separator).toHaveAttribute("aria-orientation", "vertical");
		expect(separator).toHaveAttribute("aria-valuenow", "30");
	});

	it("supports keyboard resizing on the desktop separator with bounds clamping", () => {
		mockMatchMedia(true);
		const handleChange = vi.fn();
		render(
			<ConceptChatLayout
				isChatOpen={true}
				chatWidthPercent={25}
				onChatWidthChange={handleChange}
				onCloseChat={vi.fn()}
				chatPanel={<div data-testid="chat-panel">Chat Panel</div>}
			>
				<div>Course Content</div>
			</ConceptChatLayout>,
		);

		const separator = screen.getByRole("separator", {
			name: "Resize chat panel",
		});

		// ArrowLeft increases width by 2%
		fireEvent.keyDown(separator, { key: "ArrowLeft" });
		expect(handleChange).toHaveBeenCalledWith(27);

		// ArrowRight decreases width by 2%
		fireEvent.keyDown(separator, { key: "ArrowRight" });
		expect(handleChange).toHaveBeenCalledWith(25); // Clamped by handler to min 25

		// Home sets min width (25)
		fireEvent.keyDown(separator, { key: "Home" });
		expect(handleChange).toHaveBeenCalledWith(25);

		// End sets max width (38)
		fireEvent.keyDown(separator, { key: "End" });
		expect(handleChange).toHaveBeenCalledWith(38);
	});

	it("supports mouse drag resizing on desktop separator", () => {
		mockMatchMedia(true);
		const handleChange = vi.fn();
		const { container } = render(
			<ConceptChatLayout
				isChatOpen={true}
				chatWidthPercent={25}
				onChatWidthChange={handleChange}
				onCloseChat={vi.fn()}
				chatPanel={<div data-testid="chat-panel">Chat Panel</div>}
			>
				<div>Course Content</div>
			</ConceptChatLayout>,
		);

		const layoutContainer = container.firstChild as HTMLElement;
		vi.spyOn(layoutContainer, "getBoundingClientRect").mockReturnValue({
			width: 1000,
			height: 800,
			top: 0,
			left: 0,
			bottom: 800,
			right: 1000,
			x: 0,
			y: 0,
			toJSON: () => {},
		});

		const separator = screen.getByRole("separator", {
			name: "Resize chat panel",
		});

		fireEvent.mouseDown(separator);
		fireEvent.mouseMove(window, { clientX: 700 });
		expect(handleChange).toHaveBeenCalledWith(30);

		fireEvent.mouseUp(window);
	});

	it("renders full-width chat overlay on narrow viewports (< 768px) without desktop resize separator", () => {
		mockMatchMedia(false); // Mobile viewport
		render(
			<ConceptChatLayout
				isChatOpen={true}
				chatWidthPercent={25}
				onChatWidthChange={vi.fn()}
				onCloseChat={vi.fn()}
				chatPanel={<div data-testid="chat-panel">Mobile Chat</div>}
			>
				<div data-testid="main-content">Course Content Behind Overlay</div>
			</ConceptChatLayout>,
		);

		expect(screen.getByTestId("main-content")).toBeInTheDocument();
		expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
		expect(
			screen.queryByRole("separator", { name: "Resize chat panel" }),
		).not.toBeInTheDocument();
		expect(screen.getByTestId("concept-chat-overlay")).toBeInTheDocument();
	});
});
