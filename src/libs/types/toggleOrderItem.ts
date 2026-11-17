import GObject from "gi://GObject";
import type {
	QuickMenuToggle,
	QuickToggle,
} from "resource:///org/gnome/shell/ui/quickSettings.js";

/**
 * Represents a Quick Settings toggle entry in the toggle ordering configuration.
 * Used to match, reorder, or hide QuickToggle and QuickMenuToggle instances.
 */
export interface ToggleOrderItem {
	/** GObject type name of the toggle instance. */
	gtypeName?: string;
	/** JavaScript constructor name of the toggle class. */
	constructorName?: string;
	/** Regular expression pattern string matched against the toggle title. */
	titleRegex?: string;
	/** Human-readable display name shown in preferences. */
	friendlyName?: string;
	/** Whether this entry represents the placeholder for non-ordered toggles. */
	nonOrdered?: boolean;
	/** Whether this entry represents a built-in GNOME Shell system toggle. */
	isSystem?: boolean;
	/** Compiled regular expression cached from `titleRegex`. */
	cachedTitleRegex?: RegExp;
	/** Whether the matched toggle should be hidden from Quick Settings. */
	hide?: boolean;
}
export namespace ToggleOrderItem {
	/**
	 * Checks whether two toggle order items represent the same configuration entry.
	 *
	 * @param a - First order item to compare
	 * @param b - Second order item to compare
	 * @returns True if both items match according to their type and identifying fields
	 */
	export function match(a: ToggleOrderItem, b: ToggleOrderItem) {
		if (
			a.isSystem !== b.isSystem ||
			a.nonOrdered !== b.nonOrdered ||
			a.hide !== b.hide
		)
			return false;
		if (a.nonOrdered) return true;
		if (a.isSystem) return a.constructorName === b.constructorName;
		return (
			a.constructorName === b.constructorName &&
			a.titleRegex === b.titleRegex &&
			a.friendlyName === b.friendlyName &&
			a.gtypeName === b.gtypeName
		);
	}
	/**
	 * Determines whether a live Quick Settings toggle matches an order item.
	 *
	 * @param item - Order item specification to match against
	 * @param toggle - Live QuickToggle or QuickMenuToggle instance
	 * @returns True if the toggle matches the item's type, constructor, or title regex
	 */
	export function toggleMatch(
		item: ToggleOrderItem,
		toggle: QuickToggle | QuickMenuToggle,
	): boolean {
		if (item.nonOrdered) return false;
		if (
			item.gtypeName &&
			GObject.type_name_from_instance(
				toggle as unknown as GObject.TypeInstance,
			) !== item.gtypeName
		)
			return false;
		if (
			item.constructorName &&
			toggle.constructor.name !== item.constructorName
		)
			return false;
		if (
			item.cachedTitleRegex &&
			toggle.title.match(item.cachedTitleRegex) == null
		)
			return false;
		if (!item.gtypeName && !item.constructorName && !item.cachedTitleRegex)
			return false;
		return true;
	}
	/** Default template for creating a new toggle order item. */
	export const Default: ToggleOrderItem = {
		hide: false,
		titleRegex: "",
		constructorName: "",
		friendlyName: "",
		gtypeName: "",
	};
	/**
	 * Creates a new toggle order item with default values and the given label.
	 *
	 * @param friendlyName - Human-readable name for the toggle
	 * @returns New ToggleOrderItem populated with defaults
	 */
	export function create(friendlyName: string): ToggleOrderItem {
		return {
			...Default,
			friendlyName,
		};
	}
}
