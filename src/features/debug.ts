import Config from "../config.js";
import Global from "../global.js";
import Logger from "../libs/shared/logger.js";
import { FeatureBase, type SettingLoader } from "../libs/shell/feature.js";

/**
 * Extension instance shape exposing loaded feature instances for debug inspection.
 */
type ExtensionWithFeatures = {
	/** Loaded feature instances registered on the extension. */
	features: FeatureBase[];
};

/**
 * Configures logging, global debug exposure, and layout border visualization.
 * Exists to aid development and troubleshooting without altering normal feature behavior.
 */
export class DebugFeature extends FeatureBase {
	/** Suppresses debug lifecycle messages for this feature itself. */
	disableDebugMessage = true;

	// #region settings
	/** Whether to expose `Global` and feature instances on `globalThis.qst`. */
	expose: boolean;
	/** Whether to add a CSS class highlighting Quick Settings layout borders. */
	showLayoutBorder: boolean;
	/** Numeric log verbosity level passed to the shared logger. */
	logLevel: number;

	/**
	 * Loads debug-related settings from GSettings.
	 *
	 * @param loader - Setting loader bound to the extension schema
	 */
	override loadSettings(loader: SettingLoader): void {
		this.expose = loader.loadBoolean("debug-expose");
		this.showLayoutBorder = loader.loadBoolean("debug-show-layout-border");
		this.logLevel = loader.loadInt("debug-log-level");
	}
	// #endregion settings

	/**
	 * Initializes the logger and optionally exposes globals or layout borders.
	 * Registers cleanup jobs on `this.maid` to revert global and style mutations on unload.
	 */
	override onLoad() {
		Logger.setHeader(Config.loggerPrefix);
		Logger.setLogLevel(this.logLevel);
		Logger.debug(() => `Logger initialized, LogLevel: ${this.logLevel}`);
		if (this.expose) {
			globalThis.qst = Global;
			const extension = Global.Extension as unknown as ExtensionWithFeatures;
			for (const feature of extension.features) {
				Global[feature.constructor.name] = feature;
			}
			this.maid.functionJob(() => {
				for (const feature of extension.features) {
					delete Global[feature.constructor.name];
				}
				delete globalThis.qst;
			});
			Logger.debug("Extension environment expose enabled");
		}
		if (this.showLayoutBorder) {
			Global.QuickSettingsMenu._boxPointer.style_class +=
				" QSTWEAKS-debug-show-layout";
			this.maid.functionJob(() => {
				Global.QuickSettingsMenu._boxPointer.style_class =
					Global.QuickSettingsMenu._boxPointer.style_class.replace(
						/ QSTWEAKS-debug-show-layout/,
						"",
					);
			});
			Logger.debug("Show layout border enabled");
		}
	}
	/**
	 * Performs no-op teardown; cleanup is handled by `this.maid` jobs.
	 */
	override onUnload(): void {}
}
