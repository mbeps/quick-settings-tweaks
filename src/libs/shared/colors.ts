/**
 * RGBA color tuple `[red, green, blue, alpha]`.
 * RGB channels range from 0 to 255; alpha is scaled from 0 to 1000.
 */
export type Rgba = [number, number, number, number];
export namespace Rgba {
	/**
	 * Formats an RGBA tuple into a CSS `rgba()` string.
	 * Normalizes the 0–1000 alpha channel to the 0–1 range expected by CSS.
	 *
	 * @param color - RGBA color tuple to format
	 * @returns CSS `rgba(r,g,b,a)` string
	 */
	export function formatCss(color: Rgba): string {
		const [r, g, b, a] = color;
		return `rgba(${r},${g},${b},${a / 1000})`;
	}
}
/**
 * RGB color tuple `[red, green, blue]` with channels ranging from 0 to 255.
 */
export type Rgb = [number, number, number];
