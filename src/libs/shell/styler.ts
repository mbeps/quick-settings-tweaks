import St from "gi://St";
import { Rgba } from "../shared/colors.js";
import type { SettingLoader } from "./feature.js";

/**
 * Helpers for building inline CSS styles and loading style options for `St` slider widgets.
 */
export namespace StyledSlider {
	/**
	 * Visual styling options for a slider widget.
	 */
	export interface Options {
		/** Slider variant; `"slim"` hides the handle and uses accent/active color. */
		style: "slim" | "default";
		/** Fill color for the active portion of the slider bar. */
		activeBackgroundColor: Rgba | null;
		/** Handle radius in pixels (ignored in `"slim"` mode). */
		handleRadius: number;
		/** Handle color (ignored in `"slim"` mode). */
		handleColor: Rgba | null;
		/** Track background color for the inactive portion of the bar. */
		backgroundColor: Rgba | null;
		/** Bar height in pixels. */
		height: number;
	}

	/**
	 * Builds an inline St CSS style string from the given slider options.
	 *
	 * @param options - Slider styling configuration
	 * @returns Semicolon-separated inline CSS declarations
	 */
	export function getStyle(options: Options): string {
		const {
			style,
			activeBackgroundColor,
			handleRadius,
			handleColor,
			backgroundColor,
			height,
		} = options;
		const styleList = [];
		switch (style) {
			case "slim":
				styleList.push("-slider-handle-radius:0px");
				if (activeBackgroundColor) {
					styleList.push(`color:${Rgba.formatCss(activeBackgroundColor)}`);
				} else {
					styleList.push("color:-st-accent-color");
				}
				break;
			default:
				if (handleRadius) {
					styleList.push(`-slider-handle-radius:${handleRadius}px`);
				}
				if (handleColor) {
					styleList.push(`color:${Rgba.formatCss(handleColor)}`);
				}
				break;
		}
		if (height) styleList.push(`-barlevel-height:${height}px`);
		if (activeBackgroundColor)
			styleList.push(
				`-barlevel-active-background-color:${Rgba.formatCss(activeBackgroundColor)}`,
			);
		if (backgroundColor)
			styleList.push(
				`-barlevel-background-color:${Rgba.formatCss(backgroundColor)}`,
			);
		const result = styleList.join(";");
		return result;
	}
	export namespace Options {
		/**
		 * Loads slider styling options from GSettings using the given key prefix.
		 *
		 * @param loader - `SettingLoader` instance to read and subscribe to keys
		 * @param prefix - GSettings key prefix (e.g. `"volume-mixer-slider"`)
		 * @returns Populated `StyledSlider.Options` object
		 */
		export function fromLoader(loader: SettingLoader, prefix: string): Options {
			return {
				style: loader.loadString(`${prefix}-style`) as Options["style"],
				handleColor: loader.loadRgba(`${prefix}-handle-color`),
				handleRadius: loader.loadInt(`${prefix}-handle-radius`),
				backgroundColor: loader.loadRgba(`${prefix}-background-color`),
				height: loader.loadInt(`${prefix}-height`),
				activeBackgroundColor: loader.loadRgba(
					`${prefix}-active-background-color`,
				),
			};
		}

		/**
		 * Checks whether a GSettings key belongs to this slider's style configuration.
		 *
		 * @param prefix - GSettings key prefix
		 * @param key - GSettings key name to check
		 * @returns `true` if the key is one of the slider style keys
		 */
		export function isStyleKey(prefix: string, key: string): boolean {
			if (key === `${prefix}-style`) return true;
			if (key === `${prefix}-handle-color`) return true;
			if (key === `${prefix}-handle-radius`) return true;
			if (key === `${prefix}-background-color`) return true;
			if (key === `${prefix}-height`) return true;
			if (key === `${prefix}-active-background-color`) return true;
			return false;
		}
	}
}

/**
 * Helpers for configuring scrollbar visibility and vertical fade effects on `St.ScrollView`.
 */
export namespace StyledScroll {
	/**
	 * Scrollbar and fade styling options for a `St.ScrollView`.
	 */
	export interface Options {
		/** Whether the vertical scrollbar is shown automatically or hidden (`EXTERNAL`). */
		showScrollbar: boolean;
		/** Vertical fade offset in pixels; `0` disables the `vfade` style class. */
		fadeOffset: number;
	}

	/**
	 * Applies scrollbar policy, `vfade` style class, and `-st-vfade-offset` to a `St.ScrollView`.
	 *
	 * @param scroll - Target `St.ScrollView` widget
	 * @param options - Scroll styling options
	 */
	export function updateStyle(scroll: St.ScrollView, options: Options) {
		scroll.style_class = options.fadeOffset ? "vfade" : "";
		scroll.vscrollbar_policy = options.showScrollbar
			? St.PolicyType.AUTOMATIC
			: St.PolicyType.EXTERNAL;
		scroll.style = options.fadeOffset
			? `-st-vfade-offset:${options.fadeOffset}px;`
			: "";
	}
	export namespace Options {
		/**
		 * Loads scroll styling options from GSettings using the given key prefix.
		 *
		 * @param loader - `SettingLoader` instance to read and subscribe to keys
		 * @param prefix - GSettings key prefix
		 * @returns Populated `StyledScroll.Options` object
		 */
		export function fromLoader(loader: SettingLoader, prefix: string): Options {
			return {
				showScrollbar: loader.loadBoolean(`${prefix}-show-scrollbar`),
				fadeOffset: loader.loadInt(`${prefix}-fade-offset`),
			};
		}
	}
}
