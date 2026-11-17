/**
 * Viewer Note:
 * stylesheet and javascript files are compiled from scss and typescript.
 * To modify this extension, please check original source-codes from repository
 * https://github.com/qwreey/quick-settings-tweaks
 */
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import Config from "./config.js";
import { DebugFeature } from "./features/debug.js";
import { SystemIndicatorLayoutFeature } from "./features/layout/systemIndicator.js";
import { SystemItemsLayoutFeature } from "./features/layout/systemItems.js";
import { TogglesLayoutFeature } from "./features/layout/toggles.js";
import { MenuAnimation } from "./features/menuAnimation.js";
import { OverlayMenu } from "./features/overlayMenu.js";
import { MediaWidgetFeature } from "./features/widget/media.js";
import { VolumeMixerWidgetFeature } from "./features/widget/volumeMixer.js";
import Global from "./global.js";
import Logger from "./libs/shared/logger.js";
import type { FeatureBase } from "./libs/shell/feature.js";

/**
 * Main entry point for the Quick Settings Tweaks GNOME Shell extension.
 * Manages the lifecycle of all extension features and the shared global context.
 */
export default class QstExtension extends Extension {
	private features: FeatureBase[];
	private debug: DebugFeature;

	/**
	 * Disables the extension and tears down all active features and global references.
	 * Called by GNOME Shell when the extension is disabled or the session locks/ends.
	 */
	disable() {
		Logger(`Extension ${this.metadata.name} deactivation started`);
		const start = +Date.now();

		// Unload debug feature
		this.debug.unload();
		this.debug = null;

		// Unload features
		for (const feature of this.features) {
			Logger(`Unload feature '${feature.constructor.name}'`);
			feature.unload();
		}
		this.features = null; // Null-out all features, loaded objects, arrays should be GC'd

		// Unload global context
		Global.unload();

		Logger(`Diabled. ${Date.now() - start}ms taken`);
	}

	/**
	 * Enables the extension, initializes the global context, and loads all features.
	 * Called by GNOME Shell when the extension is enabled.
	 */
	enable() {
		// Load global context
		Global.load(this);

		// Create features
		this.features = [
			// new InputOutputFeature(),
			new MediaWidgetFeature(),
			new VolumeMixerWidgetFeature(),
			new OverlayMenu(),
			new MenuAnimation(),
			new SystemItemsLayoutFeature(),
			new TogglesLayoutFeature(),
			new SystemIndicatorLayoutFeature(),
		];

		// Load debug feature
		this.debug = new DebugFeature();
		this.debug.load();
		Logger(`Extension activation started, version: ${Config.version}`);

		// Load features
		Logger.debug("Initializing features ...");
		const start = +Date.now();
		for (const feature of this.features) {
			Logger.debug(() => `Loading feature '${feature.constructor.name}'`);
			feature.load();
		}
		Logger(`Extension Loaded, ${+Date.now() - start}ms taken`);
	}
}
