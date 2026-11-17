/**
 * Represents an item in the Quick Settings panel layout order configuration.
 * Used to position built-in or custom widgets, line breaks, and page breaks.
 */
export interface QuickSettingsOrderItem {
	/** Unique identifier of the Quick Settings item. */
	id?: string;
	/** Whether to insert a line break at this position. */
	lineBreak?: boolean;
	/** Whether to insert a page break at this position. */
	pageBreak?: boolean;
	/** Unused flag reserved for hiding the item. */
	hide?: boolean; // not used
	/** Unused human-readable label for the item. */
	friendlyName?: string; // not used
}
export namespace QuickSettingsOrderItem {
	/**
	 * Checks whether two Quick Settings order items refer to the same entry.
	 * Compares items by their `id` property.
	 *
	 * @param a - First order item to compare
	 * @param b - Second order item to compare
	 * @returns True if both items share the same `id`
	 */
	export function match(a: QuickSettingsOrderItem, b: QuickSettingsOrderItem) {
		return a.id === b.id;
	}
}
