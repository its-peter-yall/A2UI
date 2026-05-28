/**
 * ============================================================================
 * FILE: MarkdownRenderer.tsx
 * LOCATION: client/src/features/learning/MarkdownRenderer.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Renders markdown content as styled HTML for concept explanations in the
 *    learning path. Wraps react-markdown with custom styling, GitHub Flavored
 *    Markdown (GFM) support, and HTML sanitization for security.
 *
 * ROLE IN PROJECT:
 *    Shared rendering utility within the learning feature. Consumed by
 *    ConceptCard to display AI-generated explanations with consistent
 *    typography and Cyber Yellow accent colors aligned with the design system.
 *
 * KEY COMPONENTS:
 *    - MarkdownRenderer: Main wrapper with styled prose container
 *    - Custom Components: Code block and heading rendering with overrides
 *    - Plugin Configuration: GFM, raw HTML, and sanitization plugins
 *
 * DEPENDENCIES:
 *    - External: react-markdown, rehype-raw, rehype-sanitize, remark-gfm,
 *                react, tailwindcss/typography, lucide-react
 *    - Internal: @/lib/utils (cn utility)
 *
 * USAGE:
 *    ```tsx
 *    <MarkdownRenderer content={node.content_markdown} />
 *
 *    <MarkdownRenderer
 *      content={node.content_markdown}
 *      selectedHeadingIds={selectedIds}
 *      onToggleHeadingChat={handleToggle}
 *      enableHeadingChat
 *    />
 *    ```
 * ============================================================================
 */

import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import React, { useState } from "react";
import { MessageCircle, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

export interface CodeBlockProps {
	className?: string;
	children: React.ReactNode;
}

export function CodeBlock({ className, children }: CodeBlockProps) {
	const [copied, setCopied] = useState(false);
	const codeText = String(children).replace(/\n$/, "");
	const match = /language-(\w+)/.exec(className || "");
	const lang = match ? match[1] : "";

	const displayLang = "Code";

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(codeText);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy text: ", err);
		}
	};

	return (
		<div className="my-4 rounded-xl border border-border bg-[#18181b] overflow-hidden">
			<div className="flex items-center justify-between px-4 py-2 border-b border-border bg-[#0f0f12] text-xs font-semibold text-muted-foreground select-none">
				<span>{displayLang}</span>
				<button
					type="button"
					onClick={handleCopy}
					className="p-1 rounded hover:bg-white/10 hover:text-foreground transition-all duration-200 cursor-pointer focus:outline-none"
					aria-label={copied ? "Copied" : "Copy code"}
				>
					{copied ? (
						<Check className="h-4 w-4 text-green-500 animate-in fade-in zoom-in duration-200" />
					) : (
						<Copy className="h-4 w-4 transition-transform active:scale-95" />
					)}
				</button>
			</div>
			<div className="text-[13.5px] leading-relaxed font-mono">
				<SyntaxHighlighter
					language={lang || "text"}
					style={vscDarkPlus}
					customStyle={{
						margin: 0,
						padding: "1rem",
						background: "transparent",
						fontSize: "inherit",
						lineHeight: "inherit",
						fontFamily: "inherit",
					}}
					codeTagProps={{
						className: "font-mono text-[#f4f4f5]",
					}}
				>
					{codeText}
				</SyntaxHighlighter>
			</div>
		</div>
	);
}

interface MarkdownRendererProps {
	content: string;
	className?: string;
	selectedHeadingIds?: string[];
	onToggleHeadingChat?: (headingId: string) => void;
	enableHeadingChat?: boolean;
}

/**
 * Generate a stable heading ID from text content and level.
 * Uses lowercase kebab-case with level prefix: "h-2-my-heading"
 */
function generateHeadingId(level: number, text: string): string {
	const slug = text
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.trim();
	return `h-${level}-${slug}`;
}

/**
 * Extract plain text from React children nodes.
 */
function extractText(children: React.ReactNode): string {
	if (typeof children === "string") return children;
	if (typeof children === "number") return String(children);
	if (Array.isArray(children)) return children.map(extractText).join("");
	if (React.isValidElement(children)) {
		const elementProps = children.props as { children?: React.ReactNode };
		if (elementProps.children) {
			return extractText(elementProps.children);
		}
	}
	return "";
}

/**
 * Creates a heading component override for the given level.
 */
function createHeadingComponent(
	level: number,
	selectedHeadingIds: string[],
	onToggleHeadingChat?: (headingId: string) => void,
	enableHeadingChat?: boolean,
) {
	const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
	return function HeadingOverride({
		children,
		...props
	}: React.HTMLAttributes<HTMLHeadingElement>) {
		const text = extractText(children);
		const headingId = generateHeadingId(level, text);
		const isSelected = selectedHeadingIds.includes(headingId);

		if (!enableHeadingChat) {
			return React.createElement(Tag, props, children);
		}

		return (
			<div className="relative" data-heading-id={headingId}>
				{React.createElement(
					Tag,
					{
						...props,
						className: cn(
							props.className,
							"group inline-block w-fit relative pr-7",
							isSelected &&
								"border-l-3 border-[#FFD400] pl-3 bg-[#FFD400]/5 rounded-r",
						),
					},
					<>
						{children}
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onToggleHeadingChat?.(headingId);
							}}
							className={cn(
								"absolute right-0 top-1/2 -translate-y-1/2 p-1 rounded-md inline-flex items-center justify-center cursor-pointer",
								"opacity-0 group-hover:opacity-100 transition-opacity duration-200",
								"hover:bg-[#FFD400]/20",
								isSelected && "opacity-100",
							)}
							aria-label={`Chat about "${text}"`}
						>
							<MessageCircle
								className={cn(
									"h-4 w-4",
									isSelected ? "text-[#FFD400]" : "text-muted-foreground",
								)}
							/>
						</button>
					</>
				)}
			</div>
		);
	};
}

export function MarkdownRenderer({
	content,
	className,
	selectedHeadingIds = [],
	onToggleHeadingChat,
	enableHeadingChat = false,
}: MarkdownRendererProps) {
	const h2 = createHeadingComponent(
		2,
		selectedHeadingIds,
		onToggleHeadingChat,
		enableHeadingChat,
	);
	const h3 = createHeadingComponent(
		3,
		selectedHeadingIds,
		onToggleHeadingChat,
		enableHeadingChat,
	);
	const h4 = createHeadingComponent(
		4,
		selectedHeadingIds,
		onToggleHeadingChat,
		enableHeadingChat,
	);
	const h5 = createHeadingComponent(
		5,
		selectedHeadingIds,
		onToggleHeadingChat,
		enableHeadingChat,
	);
	const h6 = createHeadingComponent(
		6,
		selectedHeadingIds,
		onToggleHeadingChat,
		enableHeadingChat,
	);

	return (
		<div
			className={cn(
				"prose max-w-none text-[15px] leading-relaxed font-medium",
				"dark:prose-invert",
				// Body Text
				"prose-p:text-foreground",
				// Headings: Cyber Yellow (Primary)
				"prose-headings:text-primary",
				// Strong / Bold: Cyber Yellow (Primary)
				"prose-strong:text-primary",
				// Links: Cyber Yellow (Primary)
				"prose-a:text-primary hover:prose-a:text-primary/80",
				// Code
				"prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none [&_pre_code]:text-foreground [&_pre_code]:bg-transparent [&_pre_code]:p-0",
				// Lists
				"prose-ul:text-muted-foreground prose-ol:text-muted-foreground",
				// Pre / Block Code
				"prose-pre:bg-muted prose-pre:border prose-pre:border-border",
				className,
			)}
		>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeRaw, rehypeSanitize]}
				components={{
					h2,
					h3,
					h4,
					h5,
					h6,
					code({
						className: codeClassName,
						children,
						...props
					}: React.HTMLAttributes<HTMLElement>) {
						const isInline = !codeClassName;
						if (isInline) {
							return (
								<code className={cn("bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono text-[14px]", codeClassName)} {...props}>
									{children}
								</code>
							);
						}
						return <CodeBlock className={codeClassName}>{children}</CodeBlock>;
					},
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}
