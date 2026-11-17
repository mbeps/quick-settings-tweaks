import GObject from "gi://GObject";
import type { SystemIndicator } from "resource:///org/gnome/shell/ui/quickSettings.js";

/**
 * Represents a system indicator entry in the panel indicator ordering configuration.
 * Used to match, reorder, or hide GNOME Shell system indicators in the top bar.
 */
export interface SystemIndicatorOrderItem {
	/** GObject type name of the indicator instance. */
	gtypeName?: string;
	/** JavaScript constructor name of the indicator class. */
	constructorName?: string;
	/** Human-readable display name shown in preferences. */
	friendlyName?: string;
	/** Whether this entry represents the placeholder for non-ordered indicators. */
	nonOrdered?: boolean;
	/** Whether this entry represents a built-in GNOME Shell system indicator. */
	isSystem?: boolean;
	/** Whether the matched indicator should be hidden from the panel. */
	hide?: boolean;
}
export namespace SystemIndicatorOrderItem {
	/**
	 * Checks whether two system indicator order items represent the same configuration entry.
	 *
	 * @param a - First order item to compare
	 * @param b - Second order item to compare
	 * @returns True if both items match according to their type and identifying fields
	 */
	export function match(
		a: SystemIndicatorOrderItem,
		b: SystemIndicatorOrderItem,
	) {
		if (
			a.isSystem !== b.isSystem ||
			a.nonOrdered !== b.nonOrdered ||
			a.hide !== b.hide
		)
			return false;
		if (a.nonOrdered) return true;
		if (a.isSystem) return a.gtypeName === b.gtypeName;
		return (
			a.constructorName === b.constructorName &&
			a.friendlyName === b.friendlyName &&
			a.gtypeName === b.gtypeName
		);
	}
	/**
	 * Determines whether a live GNOME Shell system indicator matches an order item.
	 *
	 * @param item - Order item specification to match against
	 * @param indicator - Live SystemIndicator instance from the panel
	 * @returns True if the indicator matches the item's GObject type and constructor
	 */
	export function indicatorMatch(
		item: SystemIndicatorOrderItem,
		indicator: SystemIndicator,
	): boolean {
		if (item.nonOrdered) return false;
		if (
			item.gtypeName &&
			GObject.type_name_from_instance(
				indicator as unknown as GObject.TypeInstance,
			) !== item.gtypeName
		)
			return false;
		if (
			item.constructorName &&
			indicator.constructor.name !== item.constructorName
		)
			return false;
		return true;
	}
	/** Default template for creating a new system indicator order item. */
	export const Default: SystemIndicatorOrderItem = {
		hide: false,
		constructorName: "",
		friendlyName: "",
		gtypeName: "",
	};
	/**
	 * Creates a new system indicator order item with default values and the given label.
	 *
	 * @param friendlyName - Human-readable name for the indicator
	 * @returns New SystemIndicatorOrderItem populated with defaults
	 */
	export function create(friendlyName: string): SystemIndicatorOrderItem {
		return {
			...Default,
			friendlyName,
		};
	}
}
