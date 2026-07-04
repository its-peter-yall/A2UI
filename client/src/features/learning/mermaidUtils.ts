/**
 * ============================================================================
 * FILE: mermaidUtils.ts
 * LOCATION: client/src/features/learning/mermaidUtils.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Utility functions for preprocessing and cleaning up Mermaid diagrams.
 *
 * ROLE IN PROJECT:
 *    Provides chart validation and preprocessing to prevent syntax errors
 *    in the Mermaid rendering component.
 *
 * KEY COMPONENTS:
 *    - preprocessMermaid: Cleans nested quotes in node labels.
 *
 * DEPENDENCIES:
 *    - External: None
 *    - Internal: None
 *
 * USAGE:
 *    import { preprocessMermaid } from "./mermaidUtils";
 * ============================================================================
 */

/**
 * Preprocesses a Mermaid chart string to fix common syntax errors.
 * Specifically, it replaces nested, unescaped double quotes inside node labels with single quotes.
 * E.g., `A["multimodal LLM<br/>Can "see" image context"]` becomes `A["multimodal LLM<br/>Can 'see' image context"]`
 */
export function preprocessMermaid(chart: string): string {
	const lines = chart.split("\n");
	const processedLines = lines.map((line) => {
		// Matches node definitions with double-quoted labels:
		// Group 1: Node ID
		// Group 2: Opening shape + quote (e.g. [" or (")
		// Group 3: Label content (lazy match)
		// Group 4: Closing quote + shape (e.g. "] or ")
		// Lookahead: followed by connector, spaces + connector, newline, or end of string
		const nodeRegex = /(\b\w+)\s*(\[\s*"|\(\s*"|\{\s*"|\(\[\s*"|\[\(\s*"|\(\(\s*"|\[\\"\s*|\[\/"\s*|>\s*")([\s\S]*?)("\s*\]|"\s*\)|"\s*\}|"\s*\]\s*\)|"\s*\)\s*\]|"\s*\)\s*\)|"\s*\\\]|"\s*\/\]|"\s*\])(?=\s*(?:-->|---|==>|-\.-|--|\n|\r|$))/g;

		return line.replace(nodeRegex, (_match, id, open, content, close) => {
			// Replace any nested double quotes (escaped or unescaped) with single quotes
			const cleanContent = content.replace(/\\"/g, "'").replace(/"/g, "'");
			return `${id}${open}${cleanContent}${close}`;
		});
	});

	return processedLines.join("\n");
}
