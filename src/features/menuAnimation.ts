import Clutter from "gi://Clutter";
import Shell from "gi://Shell";
import type { QuickSettingsMenu } from "resource:///org/gnome/shell/ui/quickSettings.js";
import Global from "../global.js";
import type Maid from "../libs/shared/maid.js";
import { FeatureBase, type SettingLoader } from "../libs/shell/feature.js";
import { QuickSettingsMenuTracker } from "../libs/shell/quickSettingsUtils.js";

/**
 * Animates and blurs the Quick Settings background when a submenu opens or closes.
 * Exists to provide visual depth and focus when overlay or submenus are active.
 */
export class MenuAnimation extends FeatureBase {
	// #region settings
	/** Whether menu open/close background animation is enabled. */
	enabled: boolean;
	/** Blur radius in pixels applied to the Quick Settings box pointer, or `0` to disable blur. */
	backgroundBlurRadius: number;
	/** Normalized brightness factor (`0`–`1`) for the blur effect. */
	bakgroundBrightness: number;
	/** Target opacity (`0`–`255`) for `QuickSettingsBox` while a submenu is open. */
	backgroundOpacity: number;
	/** Target horizontal scale factor for `QuickSettingsBox` while a submenu is open. */
	backgroundScaleX: number;
	/** Target vertical scale factor for `QuickSettingsBox` while a submenu is open. */
	backgroundScaleY: number;
	/** Target opacity (`0`–`255`) for `QuickSettingsGrid` while a submenu is open. */
	gridContentOpacity: number;
	/** Animation duration in milliseconds when opening a submenu. */
	openDuration: number;
	/** Animation duration in milliseconds when closing a submenu. */
	closeDuration: number;

	/**
	 * Loads menu animation and blur settings from GSettings.
	 *
	 * @param loader - Setting loader bound to the extension schema
	 */
	override loadSettings(loader: SettingLoader): void {
		this.enabled = loader.loadBoolean("menu-animation-enabled");
		this.backgroundBlurRadius = loader.loadInt(
			"menu-animation-background-blur-radius",
		);
		this.bakgroundBrightness =
			loader.loadInt("menu-animation-background-brightness") / 1000;
		this.backgroundOpacity = loader.loadInt(
			"menu-animation-background-opacity",
		);
		this.backgroundScaleX =
			loader.loadInt("menu-animation-background-scale-x") / 1000;
		this.backgroundScaleY =
			loader.loadInt("menu-animation-background-scale-y") / 1000;
		this.openDuration = loader.loadInt("menu-animation-open-duration");
		this.closeDuration = loader.loadInt("menu-animation-close-duration");
		this.gridContentOpacity = loader.loadInt(
			"menu-animation-grid-content-opacity",
		);
	}
	// #endregion settings

	/**
	 * Animates `QuickSettingsBox`, `QuickSettingsGrid`, and the blur effect on submenu open/close.
	 *
	 * @param _maid - Cleanup maid for the open state
	 * @param _menu - Submenu whose open state changed
	 * @param isOpen - Whether the submenu is opening (`true`) or closing (`false`)
	 */
	onOpen(_maid: Maid, _menu: QuickSettingsMenu, isOpen: boolean) {
		if (this.blur) this.blur.enabled = isOpen;
		if (isOpen) {
			Global.QuickSettingsBox.set_pivot_point(0.5, 0.5);
			Global.QuickSettingsBox.ease({
				duration: this.openDuration,
				mode: Clutter.AnimationMode.EASE_OUT_QUINT,
				scaleX: this.backgroundScaleX,
				scaleY: this.backgroundScaleY,
				opacity: this.backgroundOpacity,
			});
			Global.QuickSettingsGrid.ease({
				duration: this.openDuration,
				mode: Clutter.AnimationMode.EASE_OUT_QUINT,
				opacity: this.gridContentOpacity,
			});
		} else {
			Global.QuickSettingsBox.ease({
				duration: this.closeDuration,
				mode: Clutter.AnimationMode.EASE_OUT_QUINT,
				scaleX: 1,
				scaleY: 1,
				opacity: 255,
				onComplete: () => {
					Global.QuickSettingsBox.set_pivot_point(0, 0);
				},
			});
			Global.QuickSettingsGrid.ease({
				duration: this.openDuration,
				mode: Clutter.AnimationMode.EASE_OUT_QUINT,
				opacity: 255,
			});
		}
	}

	/** Blur effect attached to `QuickSettingsMenu._boxPointer`, if enabled. */
	blur: Shell.BlurEffect;
	/** Tracker monitoring Quick Settings submenu open/close events. */
	tracker: QuickSettingsMenuTracker;

	/**
	 * Attaches the optional blur effect and starts the submenu tracker.
	 */
	override onLoad(): void {
		if (!this.enabled) return;

		if (this.backgroundBlurRadius) {
			this.blur = new Shell.BlurEffect({
				enabled: false,
				mode: Shell.BlurMode.ACTOR,
				radius: this.backgroundBlurRadius,
				brightness: this.bakgroundBrightness,
			});
			Global.QuickSettingsMenu._boxPointer.add_effect_with_name(
				"blur",
				this.blur,
			);
		}

		this.tracker = new QuickSettingsMenuTracker();
		this.tracker.onMenuOpen = this.onOpen.bind(this);
		this.tracker.load();
	}
	/**
	 * Unloads the tracker, removes the blur effect, and resets box transforms.
	 */
	override onUnload(): void {
		const tracker = this.tracker;
		if (!tracker) return;
		this.tracker = null;
		tracker.unload();
		if (this.blur) {
			Global.QuickSettingsMenu._boxPointer.remove_effect(this.blur);
			this.blur = null;
		}
		Global.QuickSettingsBox.remove_all_transitions();
		Global.QuickSettingsBox.scaleX = 1;
		Global.QuickSettingsBox.scaleY = 1;
		Global.QuickSettingsBox.opacity = 255;
		Global.QuickSettingsBox.set_pivot_point(0, 0);
	}
}
