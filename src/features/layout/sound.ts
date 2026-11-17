import GObject from "gi://GObject";
import { FeatureBase, type SettingLoader } from "../../libs/shell/feature.js";

/**
 * Placeholder feature for sound layout customization migrated from QST 1.8.
 * Exists as a stub until sound layout migration is implemented.
 */
// TODO: migration from qst 1.8
export class SoundLayoutFeature extends FeatureBase {
	// #region settings

	/**
	 * Loads sound layout settings from GSettings.
	 *
	 * @param _loader - Setting loader bound to the extension schema
	 * @throws {GObject.NotImplementedError} Always thrown until migration is complete
	 */
	override loadSettings(_loader: SettingLoader): void {
		throw GObject.NotImplementedError;
	}
	// #endregion settings

	/**
	 * Applies sound layout modifications on feature load.
	 *
	 * @throws {GObject.NotImplementedError} Always thrown until migration is complete
	 */
	override onLoad(): void {
		throw GObject.NotImplementedError;
	}

	/**
	 * Reverts sound layout modifications on feature unload.
	 *
	 * @throws {GObject.NotImplementedError} Always thrown until migration is complete
	 */
	override onUnload(): void {
		throw GObject.NotImplementedError;
	}
}
