/**
 * ============================================================================
 * FILE: MarkdownRenderer.test.ts
 * LOCATION: client/src/features/learning/MarkdownRenderer.test.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for MarkdownRenderer Mermaid preprocessor utility.
 *
 * ROLE IN PROJECT:
 *    Ensures robustness of client-side Mermaid preprocessing logic against
 *    nested/unescaped double quotes and other syntax issues.
 *
 * KEY COMPONENTS:
 *    - preprocessMermaid tests
 *
 * DEPENDENCIES:
 *    - External: vitest
 *    - Internal: ./MarkdownRenderer
 *
 * USAGE:
 *    Run with npm run test or vitest
 * ============================================================================
 */

import { describe, it, expect } from "vitest";
import { preprocessMermaid } from "./mermaidUtils";

describe("preprocessMermaid", () => {
	it("should clean up nested double quotes inside node labels", () => {
		const input = 'A["multimodal LLM<br/>Can "see" image context"]';
		const expected = "A[\"multimodal LLM<br/>Can 'see' image context\"]";
		expect(preprocessMermaid(input)).toBe(expected);
	});

	it("should leave valid nodes without nested double quotes unchanged", () => {
		const input = 'A["Simple label"] --> B["Another label"]';
		expect(preprocessMermaid(input)).toBe(input);
	});

	it("should clean up nested double quotes in multiple nodes connected by arrows", () => {
		const input = 'A["Step "1""] --> B["Step "2""]';
		const expected = "A[\"Step '1'\"] --> B[\"Step '2'\"]";
		expect(preprocessMermaid(input)).toBe(expected);
	});

	it("should handle escaped double quotes correctly", () => {
		const input = 'A["My \\"nested\\" quotes"]';
		const expected = "A[\"My 'nested' quotes\"]";
		expect(preprocessMermaid(input)).toBe(expected);
	});
});
