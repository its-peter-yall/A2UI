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
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkEmoji from "remark-emoji";
import rehypeExternalLinks from "rehype-external-links";
import React, { useState, useEffect, useRef } from "react";
import "katex/dist/katex.min.css";
import { MessageCircle, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import mermaid from "mermaid";

// Initialize mermaid for dark mode
if (typeof window !== "undefined") {
	mermaid.initialize({
		startOnLoad: false,
		theme: "dark",
		securityLevel: "loose",
		themeVariables: {
			background: "#18181b",
			primaryColor: "#ffb74d",
			primaryTextColor: "#f4f4f5",
			lineColor: "#ffb74d",
		}
	});
}

interface MermaidProps {
	chart: string;
}

export function Mermaid({ chart }: MermaidProps) {
	const elementId = useRef(`mermaid-${Math.floor(Math.random() * 1000000)}`);
	const containerRef = useRef<HTMLDivElement>(null);
	const [svg, setSvg] = useState<string>("");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let isMounted = true;
		const renderChart = async () => {
			if (!containerRef.current) return;
			try {
				const { svg: renderedSvg } = await mermaid.render(
					elementId.current,
					chart,
					containerRef.current
				);
				if (isMounted) {
					setSvg(renderedSvg);
					setError(null);
				}
			} catch (err: any) {
				console.error("Mermaid parsing error: ", err);
				if (containerRef.current) {
					containerRef.current.innerHTML = "";
				}
				if (isMounted) {
					setError("Failed to parse Mermaid diagram (invalid syntax while typing)");
				}
			}
		};

		// Debounce rendering by 300ms to avoid layout flickering and syntax error thrashing
		const timer = setTimeout(() => {
			renderChart();
		}, 300);

		return () => {
			isMounted = false;
			clearTimeout(timer);
		};
	}, [chart]);

	return (
		<div className="mermaid-wrapper my-6">
			{/* Off-screen rendering target to allow proper text/layout measurement */}
			<div ref={containerRef} style={{ position: "absolute", top: "-9999px", left: "-9999px", visibility: "hidden" }} />
			
			{error && (
				<div className="text-red-500 text-xs p-3 border border-red-500/20 rounded bg-red-500/5 font-mono whitespace-pre-wrap mb-2">
					{error}
				</div>
			)}
			
			{!svg && !error && (
				<div className="animate-pulse bg-zinc-800/20 h-40 rounded-xl flex items-center justify-center text-xs text-muted-foreground">
					Rendering diagram...
				</div>
			)}
			
			{svg && (
				<div 
					className={`mermaid-container flex justify-center overflow-x-auto p-4 rounded-xl border border-zinc-800 bg-[#18181b] transition-opacity duration-200 ${error ? 'opacity-40' : 'opacity-100'}`} 
					dangerouslySetInnerHTML={{ __html: svg }} 
				/>
			)}
		</div>
	);
}

interface Vector {
	name: string;
	x: number;
	y: number;
	color?: string;
}

interface VectorPlotProps {
	data: string;
}

export function VectorPlot({ data }: VectorPlotProps) {
	const [plotData, setPlotData] = useState<{
		vectors: Vector[];
		grid?: boolean;
		xAxisLabel?: string;
		yAxisLabel?: string;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		try {
			const parsed = JSON.parse(data);
			if (!parsed.vectors || !Array.isArray(parsed.vectors)) {
				throw new Error("Missing 'vectors' array");
			}
			setPlotData(parsed);
			setError(null);
		} catch (err: any) {
			setError(`Invalid plot data: ${err.message}`);
		}
	}, [data]);

	if (error) {
		return (
			<div className="text-red-500 text-sm p-4 border border-red-500/20 rounded bg-red-500/5 my-4 font-mono">
				{error}
			</div>
		);
	}

	if (!plotData) return null;

	const width = 300;
	const height = 300;
	const padding = 30;
	
	const allX = plotData.vectors.flatMap(v => [0, v.x]);
	const allY = plotData.vectors.flatMap(v => [0, v.y]);
	const minX = Math.min(...allX, -2);
	const maxX = Math.max(...allX, 5);
	const minY = Math.min(...allY, -2);
	const maxY = Math.max(...allY, 5);
	
	const domainX = [minX - 1, maxX + 1];
	const domainY = [minY - 1, maxY + 1];
	
	const mapX = (val: number) => {
		return padding + ((val - domainX[0]) / (domainX[1] - domainX[0])) * (width - 2 * padding);
	};
	const mapY = (val: number) => {
		return height - (padding + ((val - domainY[0]) / (domainY[1] - domainY[0])) * (height - 2 * padding));
	};

	const originX = mapX(0);
	const originY = mapY(0);

	const gridLines = [];
	if (plotData.grid !== false) {
		for (let x = Math.ceil(domainX[0]); x <= Math.floor(domainX[1]); x++) {
			if (x !== 0) {
				gridLines.push(
					<line
						key={`v-${x}`}
						x1={mapX(x)}
						y1={padding}
						x2={mapX(x)}
						y2={height - padding}
						stroke="#27272a"
						strokeWidth="0.5"
					/>
				);
			}
		}
		for (let y = Math.ceil(domainY[0]); y <= Math.floor(domainY[1]); y++) {
			if (y !== 0) {
				gridLines.push(
					<line
						key={`h-${y}`}
						x1={padding}
						y1={mapY(y)}
						x2={width - padding}
						y2={mapY(y)}
						stroke="#27272a"
						strokeWidth="0.5"
					/>
				);
			}
		}
	}

	return (
		<div className="flex flex-col items-center justify-center my-6 p-4 rounded-xl border border-zinc-800 bg-[#18181b] select-none">
			<svg width={width} height={height} className="overflow-visible">
				<defs>
					{plotData.vectors.map((v, i) => (
						<marker
							key={`arrow-${i}`}
							id={`arrow-${i}`}
							viewBox="0 0 10 10"
							refX="6"
							refY="5"
							markerWidth="6"
							markerHeight="6"
							orient="auto-start-reverse"
						>
							<path d="M 0 1.5 L 10 5 L 0 8.5 z" fill={v.color || "#ffb74d"} />
						</marker>
					))}
				</defs>

				{gridLines}

				<line
					x1={padding}
					y1={originY}
					x2={width - padding}
					y2={originY}
					stroke="#52525b"
					strokeWidth="1.5"
				/>
				<line
					x1={originX}
					y1={padding}
					x2={originX}
					y2={height - padding}
					stroke="#52525b"
					strokeWidth="1.5"
				/>

				<text
					x={width - padding + 5}
					y={originY + 4}
					fill="#a1a1aa"
					fontSize="10"
					textAnchor="start"
				>
					{plotData.xAxisLabel || "x"}
				</text>
				<text
					x={originX}
					y={padding - 8}
					fill="#a1a1aa"
					fontSize="10"
					textAnchor="middle"
				>
					{plotData.yAxisLabel || "y"}
				</text>

				<text
					x={originX - 8}
					y={originY + 12}
					fill="#52525b"
					fontSize="8"
					textAnchor="end"
				>
					0
				</text>

				{plotData.vectors.map((v, i) => {
					const vx = mapX(v.x);
					const vy = mapY(v.y);
					const color = v.color || "#ffb74d";
					return (
						<g key={`vec-${i}`}>
							<line
								x1={originX}
								y1={originY}
								x2={vx}
								y2={vy}
								stroke={color}
								strokeWidth="2.5"
								markerEnd={`url(#arrow-${i})`}
							/>
							<text
								x={vx + (v.x >= 0 ? 8 : -8)}
								y={vy + (v.y >= 0 ? -4 : 8)}
								fill={color}
								fontSize="12"
								fontWeight="bold"
								textAnchor={v.x >= 0 ? "start" : "end"}
							>
								{v.name} ({v.x}, {v.y})
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
}

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
		<div className="not-prose my-4 rounded-xl border border-zinc-800 bg-[#18181b] overflow-hidden">
			<div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-[#0f0f12] text-xs font-semibold text-muted-foreground select-none">
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
						className: "font-mono !text-[#f4f4f5]",
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
								"border-l-3 border-[#ffb74d] pl-3 bg-[#ffb74d]/5 rounded-r",
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
								"hover:bg-[#ffb74d]/20",
								isSelected && "opacity-100",
							)}
							aria-label={`Chat about "${text}"`}
						>
							<MessageCircle
								className={cn(
									"h-4 w-4",
									isSelected ? "text-[#ffb74d]" : "text-muted-foreground",
								)}
							/>
						</button>
					</>,
				)}
			</div>
		);
	};
}

interface InlineMarkdownProps {
	content: string;
	className?: string;
}

export function InlineMarkdown({ content, className }: InlineMarkdownProps) {
	return (
		<span className={cn("prose-inline", className)}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkMath, remarkEmoji]}
				rehypePlugins={[
					rehypeRaw,
					rehypeSanitize,
					rehypeKatex,
					[rehypeExternalLinks, { target: "_blank", rel: ["noopener", "noreferrer"] }]
				]}
				allowedElements={[
					"p",
					"em",
					"strong",
					"code",
					"a",
					"br",
					"del",
					"span",
				]}
				unwrapDisallowed
				components={{
					p({ children }) {
						return <>{children}</>;
					},
					code({
						className: codeClassName,
						children,
						...props
					}: React.HTMLAttributes<HTMLElement>) {
						const isInline = !codeClassName;
						if (isInline) {
							return (
								<code
									className={cn(
										"bg-primary/10 text-primary px-1 py-0.5 rounded font-mono text-[13px]",
										codeClassName,
									)}
									{...props}
								>
									{children}
								</code>
							);
						}
						return (
							<code className={codeClassName} {...props}>
								{children}
							</code>
						);
					},
				}}
			>
				{content}
			</ReactMarkdown>
		</span>
	);
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
				"prose max-w-none text-base leading-relaxed",
				"dark:prose-invert",
				// Body Text
				"prose-p:text-foreground",
				// Headings: Cyber Yellow / Primary brand color
				"prose-headings:text-primary font-bold",
				// Strong / Bold: Cyber Yellow / Primary brand color
				"prose-strong:text-primary font-bold",
				// Links: Cyber Yellow (Primary)
				"prose-a:text-primary hover:prose-a:text-primary/80",
				// Code
				"prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none [&_pre_code]:bg-transparent [&_pre_code]:p-0",
				// Lists
				"prose-ul:text-muted-foreground prose-ol:text-muted-foreground",
				// Blockquotes: left border matches primary brand, text is slightly muted
				"prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground/90 prose-blockquote:italic",
				// Pre / Block Code
				"prose-pre:bg-transparent prose-pre:p-0 prose-pre:border-none",
				className,
			)}
		>
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkMath, remarkEmoji]}
				rehypePlugins={[
					rehypeRaw,
					rehypeSanitize,
					rehypeKatex,
					[rehypeExternalLinks, { target: "_blank", rel: ["noopener", "noreferrer"] }]
				]}
				components={{
					h2,
					h3,
					h4,
					h5,
					h6,
					table({ children, ...props }) {
						return (
							<div 
								className="w-full overflow-x-auto border border-foreground/15 rounded-xl max-w-full shadow-sm"
								style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}
							>
								<table className="min-w-full divide-y divide-foreground/15 text-[14px] table-auto border-collapse m-0!" {...props}>
									{children}
								</table>
							</div>
						);
					},
					thead({ children, ...props }) {
						return (
							<thead className="bg-muted/40" {...props}>
								{children}
							</thead>
						);
					},
					tbody({ children, ...props }) {
						return (
							<tbody className="divide-y divide-foreground/10" {...props}>
								{children}
							</tbody>
						);
					},
					tr({ children, ...props }) {
						return (
							<tr className="hover:bg-muted/10 transition-colors" {...props}>
								{children}
							</tr>
						);
					},
					th({ children, ...props }) {
						return (
							<th className="px-4 py-3 text-left font-bold text-primary border-b border-r border-foreground/20 last:border-r-0 uppercase tracking-wider text-[12px] whitespace-nowrap" {...props}>
								{children}
							</th>
						);
					},
					td({ children, ...props }) {
						return (
							<td className="px-4 py-3 text-foreground/90 border-b border-r border-foreground/10 last:border-r-0 align-middle leading-relaxed" {...props}>
								{children}
							</td>
						);
					},
					pre({ children }) {
						return <>{children}</>;
					},
					code({
						className: codeClassName,
						children,
						...props
					}: React.HTMLAttributes<HTMLElement>) {
						const isInline = !codeClassName;
						if (isInline) {
							return (
								<code
									className={cn(
										"bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono text-[14px]",
										codeClassName,
									)}
									{...props}
								>
									{children}
								</code>
							);
						}
						const match = /language-([\w-]+)/.exec(codeClassName || "");
						const lang = match ? match[1] : "";
						if (lang === "mermaid") {
							return <Mermaid chart={String(children).replace(/\n$/, "")} />;
						}
						if (lang === "vector-plot") {
							return <VectorPlot data={String(children).replace(/\n$/, "")} />;
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
