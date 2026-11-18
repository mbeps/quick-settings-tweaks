import { FeatureBase, type SettingLoader } from "../libs/shell/feature.js";
import { OverlayMenu } from "./overlayMenu.js";
import { PageMenu } from "./pageMenu.js";

/**
 * Coordinates mutually exclusive Quick Settings submenu presentation modes
 * (`"default"`, `"overlay"`, or `"page"`), ensuring the previous mode completes
 * `unload()` before the next mode runs `load()`.
 */
export class SubmenuModeFeature extends FeatureBase {
	/** Active submenu mode from GSettings (`"default"`, `"overlay"`, or `"page"`). */
	submenuMode: string;

	private activeHandler: OverlayMenu | PageMenu | null = null;

	/**
	 * Loads the active submenu mode from GSettings.
	 *
	 * @param loader - Setting loader bound to the extension schema
	 */
	override loadSettings(loader: SettingLoader): void {
		this.submenuMode = loader.loadString("submenu-mode");
	}

	/**
	 * Instantiates and loads the handler matching `submenuMode`.
	 */
	override onLoad(): void {
		if (this.submenuMode === "overlay") {
			this.activeHandler = new OverlayMenu();
		} else if (this.submenuMode === "page") {
			this.activeHandler = new PageMenu();
		} else {
			this.activeHandler = null;
			return;
		}
		this.activeHandler.load();
	}

	/**
	 * Unloads the currently active submenu mode handler, if any.
	 */
	override onUnload(): void {
		const handler = this.activeHandler;
		if (!handler) return;
		this.activeHandler = null;
		handler.unload();
	}
}
