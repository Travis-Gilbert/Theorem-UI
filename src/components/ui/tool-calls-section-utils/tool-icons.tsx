import type { IconSvgElement } from "@hugeicons/react";
import type { ComponentType, CSSProperties, ImgHTMLAttributes } from "react";
import { Icon } from "@/components/icons";
import {
	BubbleChatIcon,
	CheckListIcon,
	AlarmClockIcon,
	ComputerProgramming01Icon,
	File02Icon,
	Globe02Icon,
	HugeiconsIcon,
	Image02Icon,
	InformationCircleIcon,
	Link01Icon,
	Notification03Icon,
	PackageOpenIcon,
	SourceCodeCircleIcon,
	SparklesIcon,
	SquareArrowUpRight02Icon,
	Target02Icon,
	ToolsIcon,
} from "@/components/ui/tool-calls-section-utils/icons";

// Theorem: this app has no next/image; a plain <img> stands in for it.
const Image = (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />;

export interface IconProps {
	size?: number;
	width?: number;
	height?: number;
	strokeWidth?: number;
	className?: string;
	color?: string;
}

// Category-specific icons with colors
export interface IconConfig {
	// Theorem: a component draws one of the app's own painted marks.
	icon: IconSvgElement | string | ComponentType<{ style?: CSSProperties }>;
	// Theorem: every tile is the shared raised surface (TILE below), so a mark
	// keeps its own colour and the tiles stop competing with it.
	iconColor: string;
	isImage?: boolean;
}

/**
 * Normalize a category/integration name for icon lookup
 */
const normalizeCategoryName = (name: string): string => {
	if (!name) return "general";
	return name
		.toLowerCase()
		.trim()
		.replace(/[\s-]+/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "");
};

// Alias mapping for backwards compatibility
const iconAliases: Record<string, string> = {
	calendar: "google_calendar",
};

// Theorem: the tile every mark sits on, a palette surface in both modes.
const TILE = "rounded-lg p-1 bg-raised";

// Tool category icon configs - matches gaia repo pattern
const iconConfigs: Record<string, IconConfig> = {
	// Integration icons (use images)
	gmail: {
		icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjUyIDQyIDg4IDY2Ij4KPHBhdGggZmlsbD0iIzQyODVmNCIgZD0iTTU4IDEwOGgxNFY3NEw1MiA1OXY0M2MwIDMuMzIgMi42OSA2IDYgNiIvPgo8cGF0aCBmaWxsPSIjMzRhODUzIiBkPSJNMTIwIDEwOGgxNGMzLjMyIDAgNi0yLjY5IDYtNlY1OWwtMjAgMTUiLz4KPHBhdGggZmlsbD0iI2ZiYmMwNCIgZD0iTTEyMCA0OHYyNmwyMC0xNXYtOGMwLTcuNDItOC40Ny0xMS42NS0xNC40LTcuMiIvPgo8cGF0aCBmaWxsPSIjZWE0MzM1IiBkPSJNNzIgNzRWNDhsMjQgMTggMjQtMTh2MjZMOTYgOTIiLz4KPHBhdGggZmlsbD0iI2M1MjIxZiIgZD0iTTUyIDUxdjhsMjAgMTVWNDhsLTUuNi00LjJjLTUuOTQtNC40NS0xNC40LS4yMi0xNC40IDcuMiIvPgo8L3N2Zz4=",
		iconColor: "text-ink-muted",
		isImage: true,
	},
	google_calendar: {
		icon: "data:image/webp;base64,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",
		iconColor: "text-ink-muted",
		isImage: true,
	},
	github: {
		icon: "/images/icons/github.png",
		iconColor: "text-ink-muted",
		isImage: true,
	},
	linear: {
		icon: "/images/icons/linear.svg",
		iconColor: "text-ink-muted",
		isImage: true,
	},
	slack: {
		icon: "/images/icons/slack.svg",
		iconColor: "text-ink-muted",
		isImage: true,
	},
	google_docs: {
		icon: "/images/icons/google_docs.webp",
		iconColor: "text-ink-muted",
		isImage: true,
	},
	googlesheets: {
		icon: "/images/icons/googlesheets.webp",
		iconColor: "text-ink-muted",
		isImage: true,
	},
	search: {
		icon: "/images/icons/google.svg",
		iconColor: "text-ink-muted",
		isImage: true,
	},
	weather: {
		icon: "/images/icons/weather.webp",
		iconColor: "text-ink-muted",
		isImage: true,
	},
	notion: {
		icon: "/images/icons/notion.webp",
		iconColor: "text-ink-muted",
		isImage: true,
	},
	twitter: {
		icon: "/images/icons/twitter.webp",
		iconColor: "text-ink-muted",
		isImage: true,
	},
	linkedin: {
		icon: "/images/icons/linkedin.svg",
		iconColor: "text-ink-muted",
		isImage: true,
	},
	reddit: {
		icon: "/images/icons/reddit.svg",
		iconColor: "text-ink-muted",
		isImage: true,
	},
	figma: {
		icon: "/images/icons/figma.svg",
		iconColor: "text-ink",
		isImage: true,
	},
	
	// Category icons (use HugeIcons components)
	todos: {
		icon: CheckListIcon,
		iconColor: "text-emerald-400",
	},
	reminders: {
		icon: AlarmClockIcon,
		iconColor: "text-blue-400",
	},
	documents: {
		icon: File02Icon,
		iconColor: "text-orange-400",
	},
	development: {
		icon: SourceCodeCircleIcon,
		iconColor: "text-cyan-400",
	},
	memory: {
		// Theorem: the owner's Streamline mark for memory, not Brain02Icon.
		icon: Icon.Memory,
		iconColor: "text-indigo-400",
	},
	creative: {
		icon: Image02Icon,
		iconColor: "text-pink-400",
	},
	goal_tracking: {
		icon: Target02Icon,
		iconColor: "text-emerald-400",
	},
	notifications: {
		icon: Notification03Icon,
		iconColor: "text-yellow-400",
	},
	support: {
		icon: InformationCircleIcon,
		iconColor: "text-blue-400",
	},
	general: {
		icon: InformationCircleIcon,
		iconColor: "text-ink-muted",
	},
	integrations: {
		icon: Link01Icon,
		iconColor: "text-ink-muted",
	},
	
	// Theorem's own host functions that no category above covers
	history: {
		icon: BubbleChatIcon,
		iconColor: "text-sky-400",
	},
	web: {
		icon: Globe02Icon,
		iconColor: "text-teal-400",
	},
	kit: {
		icon: SparklesIcon,
		iconColor: "text-orange-400",
	},

	// Agent tool call categories
	handoff: {
		icon: SquareArrowUpRight02Icon,
		iconColor: "text-sky-400",
	},
	retrieve_tools: {
		icon: PackageOpenIcon,
		iconColor: "text-indigo-400",
	},
	executor: {
		icon: ComputerProgramming01Icon,
		iconColor: "text-teal-400",
	},
	unknown: {
		icon: ToolsIcon,
		iconColor: "text-ink-muted",
	},
};

/**
 * Get icon for a tool category with optional URL-based icon fallback.
 * Supports built-in categories and custom integration icons via iconUrl.
 */
export const getToolCategoryIcon = (
	category: string,
	iconProps: Partial<IconProps> & { showBackground?: boolean } = {},
	iconUrl?: string | null,
) => {
	const { showBackground = true, ...restProps } = iconProps;

	const defaultProps = {
		size: restProps.size || 16,
		width: restProps.width || 20,
		height: restProps.height || 20,
		strokeWidth: restProps.strokeWidth || 2,
		className: restProps.className,
	};

	// Normalize
	const normalizedCategory = normalizeCategoryName(category);

	// Resolve aliases
	const aliasedCategory =
		iconAliases[normalizedCategory] ||
		iconAliases[category] ||
		normalizedCategory;

	const finalCategory = normalizeCategoryName(aliasedCategory);

	let config = iconConfigs[finalCategory];

	// Fallback search
	if (!config) {
		const normalizedConfigs = Object.entries(iconConfigs);
		const matchingConfig = normalizedConfigs.find(
			([key]) => normalizeCategoryName(key) === finalCategory,
		);
		if (matchingConfig) {
			config = matchingConfig[1];
		}
	}

	// If no predefined config found, try iconUrl fallback for custom integrations
	if (!config) {
		if (iconUrl) {
			const iconElement = (
				<Image
					alt={`${category} Icon`}
					width={defaultProps.width}
					height={defaultProps.height}
					className={`${restProps.className || ""} aspect-square object-contain`}
					src={iconUrl}
				/>
			);
			return showBackground ? (
				<div className={TILE}>{iconElement}</div>
			) : (
				iconElement
			);
		}
		return null;
	}

	// Render image or component icon
	const iconElement = config.isImage ? (
		<Image
			alt={`${category} Icon`}
			width={defaultProps.width}
			height={defaultProps.height}
			className={`${restProps.className || ""} aspect-square object-contain`}
			src={config.icon as string}
		/>
	) : typeof config.icon === "function" ? (
		<config.icon
			style={{
				display: "block",
				width: defaultProps.size,
				height: defaultProps.size,
			}}
		/>
	) : (
		<HugeiconsIcon
			icon={config.icon as IconSvgElement}
			size={defaultProps.size}
			className={restProps.className || config.iconColor}
		/>
	);

	// Return with or without background based on showBackground prop
	return showBackground ? (
		<div className={TILE}>
			{iconElement}
		</div>
	) : (
		iconElement
	);
};

// Format tool names from snake_case to Title Case
export const formatToolName = (name: string): string => {
	return name
		.split("_")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(" ");
};
