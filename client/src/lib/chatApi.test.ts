/**
 * ============================================================================
 * FILE: chatApi.test.ts
 * LOCATION: client/src/lib/chatApi.test.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the fetch-based SSE chat API client. Verifies streaming
 *    behavior, header construction, error handling, and [DONE] termination.
 *
 * ROLE IN PROJECT:
 *    Test coverage for chatApi.ts streamConceptChat function.
 *
 * DEPENDENCIES:
 *    - External: vitest
 *    - Internal: @/lib/chatApi
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { streamConceptChat } from "./chatApi";

// Mock providerSettings and providerApi
const mockGetProviderSettings = vi.fn(() => ({
	activeProvider: "openrouter",
	providers: {
		openrouter: {
			apiKey: "test-key",
			model: "openai/gpt-4o",
			modelTitle: "GPT-4o",
			chatModel: "openai/gpt-4o-mini",
			chatModelTitle: "GPT-4o Mini",
		},
		generalcompute: { apiKey: "", model: "", modelTitle: "" },
	},
}));

vi.mock("./providerSettings", () => ({
	getProviderSettings: () => mockGetProviderSettings(),
}));

vi.mock("./providerApi", () => ({
	buildProviderHeaders: () => ({
		"X-Provider-Api-Key": "test-key",
		"X-Model": "openai/gpt-4o",
	}),
}));

function createMockReadableStream(chunks: string[]) {
	let index = 0;
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (index < chunks.length) {
				controller.enqueue(new TextEncoder().encode(chunks[index]));
				index++;
			} else {
				controller.close();
			}
		},
	});
}

describe("streamConceptChat", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("calls fetch with correct URL and headers", async () => {
		const stream = createMockReadableStream([
			'data: {"delta":"hi"}\n\ndata: [DONE]\n\n',
		]);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(stream, {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			}),
		);

		const deltas: string[] = [];
		await streamConceptChat({
			sessionId: "sess-1",
			nodeId: "node-1",
			message: "hello",
			history: [],
			selectedHeadingIds: [],
			onDelta: (d) => deltas.push(d),
		});

		expect(globalThis.fetch).toHaveBeenCalledOnce();
		const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0];
		expect(url).toContain("/learning/sessions/sess-1/nodes/node-1/chat");
		expect(options.method).toBe("POST");
		expect(options.headers["X-Chat-Model"]).toBe("openai/gpt-4o-mini");
		expect(options.headers["Content-Type"]).toBe("application/json");
	});

	it("parses delta chunks and invokes onDelta", async () => {
		const stream = createMockReadableStream([
			'data: {"delta":"Hello "}\n\ndata: {"delta":"world"}\n\ndata: [DONE]\n\n',
		]);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(stream, {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			}),
		);

		const deltas: string[] = [];
		await streamConceptChat({
			sessionId: "s",
			nodeId: "n",
			message: "test",
			history: [],
			selectedHeadingIds: [],
			onDelta: (d) => deltas.push(d),
		});

		expect(deltas).toEqual(["Hello ", "world"]);
	});

	it("stops reading on [DONE] sentinel", async () => {
		const stream = createMockReadableStream([
			'data: {"delta":"ok"}\n\ndata: [DONE]\n\ndata: {"delta":"ignored"}\n\n',
		]);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(stream, {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			}),
		);

		const deltas: string[] = [];
		await streamConceptChat({
			sessionId: "s",
			nodeId: "n",
			message: "test",
			history: [],
			selectedHeadingIds: [],
			onDelta: (d) => deltas.push(d),
		});

		expect(deltas).toEqual(["ok"]);
	});

	it("throws on non-OK response", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(null, { status: 500, statusText: "Internal Server Error" }),
		);

		await expect(
			streamConceptChat({
				sessionId: "s",
				nodeId: "n",
				message: "test",
				history: [],
				selectedHeadingIds: [],
				onDelta: () => {},
			}),
		).rejects.toThrow("Chat request failed: 500 Internal Server Error");
	});

	it("throws on error payload in stream", async () => {
		const stream = createMockReadableStream([
			'data: {"error":"model unavailable"}\n\ndata: [DONE]\n\n',
		]);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(stream, {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			}),
		);

		await expect(
			streamConceptChat({
				sessionId: "s",
				nodeId: "n",
				message: "test",
				history: [],
				selectedHeadingIds: [],
				onDelta: () => {},
			}),
		).rejects.toThrow("model unavailable");
	});

	it("handles JSON event split across two stream chunks", async () => {
		// First chunk: partial JSON {"delta":"hel
		// Second chunk: rest of JSON lo"}\n\n
		const stream = createMockReadableStream([
			'data: {"delta":"hel',
			'lo"}\n\ndata: [DONE]\n\n',
		]);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(stream, {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			}),
		);

		const deltas: string[] = [];
		await streamConceptChat({
			sessionId: "s",
			nodeId: "n",
			message: "test",
			history: [],
			selectedHeadingIds: [],
			onDelta: (d) => deltas.push(d),
		});

		expect(deltas).toEqual(["hello"]);
	});

	it("handles two data events in one stream chunk", async () => {
		const stream = createMockReadableStream([
			'data: {"delta":"Hello "}\n\ndata: {"delta":"world"}\n\ndata: [DONE]\n\n',
		]);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(stream, {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			}),
		);

		const deltas: string[] = [];
		await streamConceptChat({
			sessionId: "s",
			nodeId: "n",
			message: "test",
			history: [],
			selectedHeadingIds: [],
			onDelta: (d) => deltas.push(d),
		});

		expect(deltas).toEqual(["Hello ", "world"]);
	});

	it("sends selected_heading_ids in request body", async () => {
		const stream = createMockReadableStream(["data: [DONE]\n\n"]);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(stream, {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			}),
		);

		await streamConceptChat({
			sessionId: "s",
			nodeId: "n",
			message: "test",
			history: [],
			selectedHeadingIds: ["h-2-intro", "h-3-details"],
			onDelta: () => {},
		});

		const body = JSON.parse(
			(globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
		);
		expect(body.selected_heading_ids).toEqual(["h-2-intro", "h-3-details"]);
	});

	it("sends X-Model header even when no chat model is set", async () => {
		mockGetProviderSettings.mockReturnValue({
			activeProvider: "openrouter",
			providers: {
				openrouter: {
					apiKey: "test-key",
					model: "openai/gpt-4o",
					modelTitle: "GPT-4o",
					chatModel: "",
					chatModelTitle: "",
				},
				generalcompute: { apiKey: "", model: "", modelTitle: "" },
			},
		});

		const stream = createMockReadableStream(["data: [DONE]\n\n"]);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(stream, {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			}),
		);

		await streamConceptChat({
			sessionId: "s",
			nodeId: "n",
			message: "test",
			history: [],
			selectedHeadingIds: [],
			onDelta: () => {},
		});

		const headers = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0][1].headers;
		expect(headers["X-Model"]).toBe("openai/gpt-4o");
		// X-Chat-Model falls back to main model when chatModel is not set
		expect(headers["X-Chat-Model"]).toBe("openai/gpt-4o");
	});
});
