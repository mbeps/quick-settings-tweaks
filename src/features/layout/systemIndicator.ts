import type St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { SystemIndicator } from "resource:///org/gnome/shell/ui/quickSettings.js";
import Global from "../../global.js";
import type Maid from "../../libs/shared/maid.js";
import { StyleClass } from "../../libs/shared/styleClass.js";
import { FeatureBase, type SettingLoader } from "../../libs/shell/feature.js";
import { SystemIndicatorTracker } from "../../libs/shell/quickSettingsUtils.js";
import { SystemIndicatorOrderItem } from "../../libs/types/systemIndicatorOrderItem.js";

/**
 * Customizes the visibility, ordering, and accent styling of top-bar system indicators.
 * Exists to let users hide, reorder, and recolor privacy, screen-sharing, and recording indicators.
 */
export class SystemIndicatorLayoutFeature extends FeatureBase {
	// #region settings
	/** Whether custom indicator ordering and hiding is enabled. */
	orderEnabled: boolean;
	/** Ordered list of indicator rules, including the `nonOrdered` placeholder. */
	order: SystemIndicatorOrderItem[];
	/** Fallback rule applied to indicators not explicitly listed in `order`. */
	unordered: SystemIndicatorOrderItem;
	/** Visual style for the privacy indicator (`"default"`, `"monochrome"`, or `"accent"`). */
	privacyIndicatorStyle: "default" | "monochrome" | "accent";
	/** Whether to apply the accent style class to the screen-sharing indicator. */
	accentScreenSharingIndicator: boolean;
	/** Whether to apply the accent style class to the screen-recording indicator. */
	accentScreenRecordingIndicator: boolean;

	/**
	 * Loads system indicator layout and styling settings from GSettings.
	 *
	 * @param loader - Setting loader bound to the extension schema
	 */
	override loadSettings(loader: SettingLoader): void {
		this.orderEnabled = loader.loadBoolean("system-indicator-layout-enabled");
		this.order = loader.loadValue("system-indicator-layout-order");
		this.unordered = this.order.find((item) => item.nonOrdered);
		this.privacyIndicatorStyle = loader.loadString(
			"system-indicator-privacy-indicator-style",
		) as SystemIndicatorLayoutFeature["privacyIndicatorStyle"];
		this.accentScreenSharingIndicator = loader.loadBoolean(
			"system-indicator-screen-sharing-indicator-use-accent",
		);
		this.accentScreenRecordingIndicator = loader.loadBoolean(
			"system-indicator-screen-recording-indicator-use-accent",
		);
	}
	// #endregion settings

	/**
	 * Hides a newly created indicator if its matching order rule specifies `hide`.
	 *
	 * @param maid - Cleanup maid tied to the indicator's lifecycle
	 * @param indicator - Newly created `SystemIndicator` instance
	 */
	onIndicatorCreated(maid: Maid, indicator: SystemIndicator): void {
		const rule: SystemIndicatorOrderItem =
			this.order.find((item) =>
				SystemIndicatorOrderItem.indicatorMatch(item, indicator),
			) ?? this.unordered;
		if (rule.hide) maid.hideJob(indicator);
	}
	/**
	 * Reorders `Global.Indicators` children according to `this.order`.
	 * Places items before `nonOrdered` at the head, unmatched items in the middle, and the rest at the tail.
	 */
	onUpdate(): void {
		const children = Global.Indicators.get_children();
		const head: SystemIndicator[] = [];
		const middle: SystemIndicator[] = children.filter(
			(child): child is SystemIndicator => child instanceof SystemIndicator,
		);
		const tail: SystemIndicator[] = [];
		let overNonOrdered: boolean = false;
		for (const item of this.order) {
			if (item.nonOrdered) {
				overNonOrdered = true;
				continue;
			}
			const middleIndex = middle.findIndex((toggle) =>
				SystemIndicatorOrderItem.indicatorMatch(item, toggle),
			);
			if (middleIndex === -1) continue;
			const toggle = middle[middleIndex];
			middle.splice(middleIndex, 1);
			(overNonOrdered ? tail : head).push(toggle);
		}
		let last: SystemIndicator | null = null;
		for (const item of [head, middle, tail].flat()) {
			if (last) Global.Indicators.set_child_above_sibling(item, last);
			last = item;
		}
	}

	/** Tracker monitoring `Global.Indicators` additions and layout updates. */
	tracker: SystemIndicatorTracker;

	/**
	 * Applies indicator style classes and starts the indicator tracker if ordering is enabled.
	 */
	override onLoad(): void {
		// Colored privacy indicator
		const privacyIndicatorStyle = new StyleClass(Global.Indicators.style_class);
		if (this.privacyIndicatorStyle === "accent") {
			privacyIndicatorStyle.add("QSTWEAKS-privacy-indicator-use-accent");
		} else if (this.privacyIndicatorStyle === "monochrome") {
			privacyIndicatorStyle.add("QSTWEAKS-privacy-indicator-use-monochrome");
		}
		if (privacyIndicatorStyle.modified) {
			Global.Indicators.style_class = privacyIndicatorStyle.stringify();
			this.maid.functionJob(() => {
				Global.Indicators.style_class = new StyleClass(
					Global.Indicators.style_class,
				)
					.remove("QSTWEAKS-privacy-indicator-use-accent")
					.remove("QSTWEAKS-privacy-indicator-use-monochrome")
					.stringify();
			});
		}

		const statusArea = Main.panel.statusArea as unknown as {
			screenSharing: St.Widget;
			screenRecording: St.Widget;
		};

		// Colored screen sharing indicator
		if (this.accentScreenSharingIndicator) {
			statusArea.screenSharing.style_class = new StyleClass(
				statusArea.screenSharing.style_class,
			)
				.add("QSTWEAKS-screen-sharing-indicator-use-accent")
				.stringify();
			this.maid.functionJob(() => {
				statusArea.screenSharing.style_class = new StyleClass(
					statusArea.screenSharing.style_class,
				)
					.remove("QSTWEAKS-screen-sharing-indicator-use-accent")
					.stringify();
			});
		}

		// Colored screen recording indicator
		if (this.accentScreenRecordingIndicator) {
			statusArea.screenRecording.style_class = new StyleClass(
				statusArea.screenRecording.style_class,
			)
				.add("QSTWEAKS-screen-recording-indicator-use-accent")
				.stringify();
			this.maid.functionJob(() => {
				statusArea.screenRecording.style_class = new StyleClass(
					statusArea.screenRecording.style_class,
				)
					.remove("QSTWEAKS-screen-recording-indicator-use-accent")
					.stringify();
			});
		}

		// Ordering
		if (!this.orderEnabled) return;
		this.tracker = new SystemIndicatorTracker();
		this.tracker.onIndicatorCreated = this.onIndicatorCreated.bind(this);
		this.tracker.onUpdate = this.onUpdate.bind(this);
		this.tracker.load();
	}
	/**
	 * Unloads the indicator tracker and clears its reference.
	 */
	override onUnload(): void {
		const tracker = this.tracker;
		if (tracker) {
			this.tracker = null;
			tracker.unload();
		}
	}
}
