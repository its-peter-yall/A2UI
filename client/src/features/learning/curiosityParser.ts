export interface CuriositySection {
	mainContent: string;
	questions: string[];
}

const MARKER_PATTERNS = [
	/^##\s*Curious to explore more\??\s*$/im,
	/^###\s*Curious to explore more\??\s*$/im,
	/^##\s*Curiosity Spark\s*$/im,
	/^###\s*Curiosity Spark\s*$/im,
];

export function parseCuriosityQuestions(content: string): CuriositySection {
	for (const pattern of MARKER_PATTERNS) {
		const match = content.match(pattern);
		if (match) {
			const markerIndex = match.index!;
			const mainContent = content.slice(0, markerIndex).trimEnd();
			const afterMarker = content.slice(markerIndex + match[0].length);
			const questions = extractListItems(afterMarker);
			return { mainContent, questions };
		}
	}
	return { mainContent: content, questions: [] };
}

function extractListItems(text: string): string[] {
	const items: string[] = [];
	const lines = text.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
			items.push(trimmed.slice(2).trim());
		} else if (
			trimmed.startsWith("> ") ||
			trimmed.startsWith("### ") ||
			trimmed.startsWith("## ")
		) {
			if (items.length > 0) break;
		} else if (trimmed === "" && items.length > 0) {
			continue;
		} else if (trimmed !== "" && items.length > 0) {
			break;
		}
	}
	return items;
}
