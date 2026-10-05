/**
 * ============================================================================
 * FILE: curiosityParser.test.ts
 * LOCATION: client/src/features/learning/curiosityParser.test.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Tests curiosity section parsing, question list extraction, stopping
 *    conditions, and fallback behavior for unformatted topic content.
 *
 * ROLE IN PROJECT:
 *    Guards A11 curiosity question parsing parity across learning and revision.
 *
 * USAGE:
 *    npm run test -- --run src/features/learning/curiosityParser.test.ts
 * ============================================================================
 */

import { describe, expect, it } from "vitest";
import { parseCuriosityQuestions } from "./curiosityParser";

describe("parseCuriosityQuestions", () => {
	it("extracts curiosity questions from '## Curious to explore more?' with dash bullets", () => {
		const markdown = `
# Gradient Descent
Gradient descent optimizes loss functions.

## Curious to explore more?
- How does learning rate affect convergence?
- What is the difference between batch and stochastic gradient descent?
`;
		const result = parseCuriosityQuestions(markdown);
		expect(result.mainContent.trim()).toBe(
			"# Gradient Descent\nGradient descent optimizes loss functions.",
		);
		expect(result.questions).toEqual([
			"How does learning rate affect convergence?",
			"What is the difference between batch and stochastic gradient descent?",
		]);
	});

	it("extracts questions from '### Curious to explore more' without question mark and asterisk bullets", () => {
		const markdown = `
Topic explanation body.

### Curious to explore more
* Can gradient descent get trapped in local minima?
* Why do saddle points matter?
`;
		const result = parseCuriosityQuestions(markdown);
		expect(result.mainContent.trim()).toBe("Topic explanation body.");
		expect(result.questions).toEqual([
			"Can gradient descent get trapped in local minima?",
			"Why do saddle points matter?",
		]);
	});

	it("extracts questions from '## Curiosity Spark' and '### Curiosity Spark'", () => {
		const markdownH2 = `
Topic text.

## Curiosity Spark
- Question 1
`;
		const resultH2 = parseCuriosityQuestions(markdownH2);
		expect(resultH2.questions).toEqual(["Question 1"]);

		const markdownH3 = `
Topic text.

### Curiosity Spark
- Question 2
`;
		const resultH3 = parseCuriosityQuestions(markdownH3);
		expect(resultH3.questions).toEqual(["Question 2"]);
	});

	it("stops question extraction when next section header or blockquote begins", () => {
		const markdown = `
Content body.

## Curious to explore more?
- Valid question 1
- Valid question 2

## Next Section
- Trailing list item not part of curiosity
`;
		const result = parseCuriosityQuestions(markdown);
		expect(result.questions).toEqual(["Valid question 1", "Valid question 2"]);
	});

	it("returns empty questions and preserves markdown unchanged when no curiosity marker exists", () => {
		const markdown = `
# Pure Explanation
This concept has no curiosity questions at all.
- Just a normal list
- Another list item
`;
		const result = parseCuriosityQuestions(markdown);
		expect(result.mainContent).toBe(markdown);
		expect(result.questions).toEqual([]);
	});

	it("handles empty and whitespace-only content safely", () => {
		expect(parseCuriosityQuestions("")).toEqual({
			mainContent: "",
			questions: [],
		});
		expect(parseCuriosityQuestions("   \n\n  ")).toEqual({
			mainContent: "   \n\n  ",
			questions: [],
		});
	});
});
