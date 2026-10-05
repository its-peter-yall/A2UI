/**
 * ============================================================================
 * FILE: CuriositySpark.test.tsx
 * LOCATION: client/src/features/learning/CuriositySpark.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Tests the CuriositySpark widget rendering, button accessibility,
 *    and question click callbacks.
 *
 * ROLE IN PROJECT:
 *    Guards A11 curiosity button presentation and callback wiring.
 *
 * USAGE:
 *    npm run test -- --run src/features/learning/CuriositySpark.test.tsx
 * ============================================================================
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CuriositySpark } from "./CuriositySpark";

vi.mock("./MarkdownRenderer", () => ({
	InlineMarkdown: ({ content }: { content: string }) => <span>{content}</span>,
}));

describe("CuriositySpark", () => {
	it("renders null when questions array is empty", () => {
		const { container } = render(
			<CuriositySpark questions={[]} onAskQuestion={vi.fn()} />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("renders curiosity header and each question button", () => {
		const questions = [
			"What is momentum?",
			"How do Adam and RMSprop differ?",
		];
		render(<CuriositySpark questions={questions} onAskQuestion={vi.fn()} />);

		expect(screen.getByText("Curious to explore more?")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Click any question to ask the chatbot and dive deeper:",
			),
		).toBeInTheDocument();

		const buttons = screen.getAllByRole("button");
		expect(buttons).toHaveLength(2);
		expect(buttons[0]).toHaveAttribute("type", "button");
		expect(buttons[1]).toHaveAttribute("type", "button");
		expect(screen.getByText("What is momentum?")).toBeInTheDocument();
		expect(
			screen.getByText("How do Adam and RMSprop differ?"),
		).toBeInTheDocument();
	});

	it("fires onAskQuestion with exact question text when clicked", () => {
		const handleAsk = vi.fn();
		const questions = ["How does learning rate decay work?"];
		render(
			<CuriositySpark questions={questions} onAskQuestion={handleAsk} />,
		);

		const button = screen.getByRole("button", {
			name: /how does learning rate decay work/i,
		});
		fireEvent.click(button);

		expect(handleAsk).toHaveBeenCalledTimes(1);
		expect(handleAsk).toHaveBeenCalledWith(
			"How does learning rate decay work?",
		);
	});
});
