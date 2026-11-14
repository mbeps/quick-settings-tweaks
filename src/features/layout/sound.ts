import GObject from "gi://GObject";
import { FeatureBase, type SettingLoader } from "../../libs/shell/feature.js";

// TODO: migration from qst 1.8
export class SoundLayoutFeature extends FeatureBase {
	// #region settings

	override loadSettings(_loader: SettingLoader): void {
		throw GObject.NotImplementedError;
	}
	// #endregion settings

	override onLoad(): void {
		throw GObject.NotImplementedError;
	}
	override onUnload(): void {
		throw GObject.NotImplementedError;
	}
}
