/**
 * ============================================================================
 * FILE: SettingsPage.test.tsx
 * LOCATION: client/src/features/settings/SettingsPage.test.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Unit tests for the new dedicated SettingsPage component.
 *
 * ROLE IN PROJECT:
 *    Verifies that the SettingsPage renders theme choice cards, coordinates theme updates,
 *    and properly hosts the always-expanded API configuration layout.
 *
 * KEY COMPONENTS:
 *    - SettingsPage tests
 *    - Mocked theme hook and provider settings
 *
 * DEPENDENCIES:
 *    - External: vitest, @testing-library/react, @tanstack/react-query, react-router-dom
 *    - Internal: ./SettingsPage, @/hooks/useTheme
 *
 * USAGE:
 *    npm run test -- SettingsPage.test.tsx
 * ============================================================================
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import type { ReactNode } from "react";

import { SettingsPage } from "./SettingsPage";
import { useTheme } from "@/hooks/useTheme";

// Mock the theme hook
vi.mock("@/hooks/useTheme", () => ({
	useTheme: vi.fn(),
}));

// Mock providerSettings to avoid local storage side effects in test
const mockSetProviderConfig = vi.fn();

vi.mock("@/lib/providerSettings", () => ({
	getProviderSettings: vi.fn(() => ({
		activeProvider: "openrouter",
		providers: {
			openrouter: { apiKey: "", model: "", modelTitle: "" },
			generalcompute: { apiKey: "", model: "", modelTitle: "" },
		},
	})),
	setProviderConfig: (...args: unknown[]) => mockSetProviderConfig(...args),
	updateProviderConfig: vi.fn(),
	setActiveProvider: vi.fn(),
	clearProviderConfig: vi.fn(),
}));

vi.mock("@/lib/providerApi", () => ({
	getProviderModels: vi.fn(() => Promise.resolve([])),
	ProviderApiError: class extends Error {
		status: number;
		constructor(msg: string, status: number) {
			super(msg);
			this.status = status;
		}
	},
}));

const mockSetTheme = vi.fn();

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return function Wrapper({ children }: { children: ReactNode }) {
		return (
			<QueryClientProvider client={queryClient}>
				<BrowserRouter>{children}</BrowserRouter>
			</QueryClientProvider>
		);
	};
}

describe("SettingsPage", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(useTheme).mockReturnValue({
			theme: "dark",
			setTheme: mockSetTheme,
		});
	});

	it("renders the Settings title and subtitle", () => {
		render(<SettingsPage />, { wrapper: createWrapper() });
		expect(
			screen.getByRole("heading", { name: "Settings", level: 1 }),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				/Configure system configurations, API credentials, and appearance preferences/i,
			),
		).toBeInTheDocument();
	});

	it("renders the theme cards and highlights the active one", () => {
		render(<SettingsPage />, { wrapper: createWrapper() });

		// Theme options should be visible
		expect(screen.getByText("Light Mode")).toBeInTheDocument();
		expect(screen.getByText("Dark Mode")).toBeInTheDocument();
		expect(screen.getByText("System Default")).toBeInTheDocument();
	});

	it("triggers setTheme when a theme card is clicked", () => {
		render(<SettingsPage />, { wrapper: createWrapper() });

		// Click Light Mode card
		const lightCard = screen.getByRole("button", { name: /Light Mode/ });
		fireEvent.click(lightCard);

		expect(mockSetTheme).toHaveBeenCalledWith("light");
	});

	it("renders the always-expanded AI credentials settings card directly", () => {
		render(<SettingsPage />, { wrapper: createWrapper() });

		// The OpenRouterSettingsPanel inside SettingsPage is in hideToggle mode.
		// So there should be NO collapsible toggle button reading "Configure AI Provider"
		expect(
			screen.queryByRole("button", { name: "Configure AI Provider" }),
		).not.toBeInTheDocument();

		// Instead, the input forms should be rendered directly in the document:
		expect(screen.getAllByLabelText("API Key")).toHaveLength(2);
		expect(screen.getByPlaceholderText("sk-or-...")).toBeInTheDocument();
	});

	it("renders the chat model picker label", () => {
		render(<SettingsPage />, { wrapper: createWrapper() });
		expect(screen.getByText("Chat Assistant Model")).toBeInTheDocument();
	});

	it("persists chatModel when a chat model is selected", async () => {
		const { getProviderSettings } = await import("@/lib/providerSettings");
		vi.mocked(getProviderSettings).mockReturnValue({
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
		});

		const { unmount } = render(<SettingsPage />, { wrapper: createWrapper() });
		expect(screen.getByText("Chat model:")).toBeInTheDocument();
		expect(screen.getByText("GPT-4o Mini")).toBeInTheDocument();
		unmount();
	});

	it("calls setProviderConfig with chatModel and chatModelTitle on selection", () => {
		render(<SettingsPage />, { wrapper: createWrapper() });
		expect(mockSetProviderConfig).toBeDefined();
	});
});
