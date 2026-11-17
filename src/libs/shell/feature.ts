import Global from "../../global.js";
import type { Rgb, Rgba } from "../shared/colors.js";
import Logger from "../shared/logger.js";
import Maid from "../shared/maid.js";

/**
 * Tracks GSettings keys read by a feature and automatically triggers a reload when any of them change.
 * Passed to `FeatureBase.loadSettings()` so features only subscribe to the settings they actually use.
 */
export class SettingLoader {
	/** Set of GSettings keys currently subscribed to. */
	records: Set<string>;
	/** Active GSettings signal handler IDs. */
	listeners: number[];
	/** Callback invoked when any tracked setting changes. */
	onChange: (key: string) => void;
	/** Owning feature instance used for debug logging. */
	parent: FeatureBase;

	/**
	 * Creates a new `SettingLoader` bound to a feature.
	 *
	 * @param onChange - Callback invoked with the changed key when a tracked setting updates
	 * @param parent - Owning `FeatureBase` instance
	 */
	constructor(onChange: SettingLoader["onChange"], parent: FeatureBase) {
		this.parent = parent;
		this.records = new Set();
		this.listeners = [];
		this.onChange = onChange;
	}

	private push(key: string) {
		if (this.records.has(key)) return;
		this.records.add(key);
		this.listeners.push(
			Global.Settings.connect(`changed::${key}`, () => this.onChange(key)),
		);
		if (!this.parent.disableDebugMessage)
			Logger.debug(
				() =>
					`Setting listener for key '${key}' added for feature ${this.parent.constructor.name}`,
			);
	}

	/**
	 * Disconnects all active GSettings listeners and clears tracked keys.
	 */
	clear() {
		for (const source of this.listeners) {
			Global.Settings.disconnect(source);
		}
		this.listeners = [];
		this.records.clear();
		if (!this.parent.disableDebugMessage) {
			Logger.debug(
				() =>
					`Disconnected setting listeners for feature ${this.parent.constructor.name}`,
			);
		}
	}

	/**
	 * Reads a boolean setting and subscribes to future changes.
	 *
	 * @param key - GSettings key name
	 * @returns Current boolean value
	 */
	loadBoolean(key: string): boolean {
		this.push(key);
		return Global.Settings.get_boolean(key);
	}

	/**
	 * Reads a string setting and subscribes to future changes.
	 *
	 * @param key - GSettings key name
	 * @returns Current string value
	 */
	loadString(key: string): string {
		this.push(key);
		return Global.Settings.get_string(key);
	}

	/**
	 * Reads an integer setting and subscribes to future changes.
	 *
	 * @param key - GSettings key name
	 * @returns Current integer value
	 */
	loadInt(key: string): number {
		this.push(key);
		return Global.Settings.get_int(key);
	}

	/**
	 * Reads a string-array (`as`) setting and subscribes to future changes.
	 *
	 * @param key - GSettings key name
	 * @returns Current array of strings
	 */
	loadStrv(key: string): string[] {
		this.push(key);
		return Global.Settings.get_strv(key);
	}

	/**
	 * Reads and unpacks an arbitrary `GLib.Variant` setting and subscribes to future changes.
	 *
	 * @param key - GSettings key name
	 * @returns Unpacked setting value cast to `T`
	 */
	loadValue<T>(key: string): T {
		this.push(key);
		return Global.Settings.get_value(key).recursiveUnpack() as T;
	}

	/**
	 * Reads an RGB tuple setting and subscribes to future changes.
	 *
	 * @param key - GSettings key name
	 * @returns RGB tuple, or `null` if the stored array is empty
	 */
	loadRgb(key: string): Rgb | null {
		this.push(key);
		const color = Global.Settings.get_value(key).recursiveUnpack() as number[];
		if (!color.length) return null;
		return color as Rgb;
	}

	/**
	 * Reads an RGBA tuple setting and subscribes to future changes.
	 *
	 * @param key - GSettings key name
	 * @returns RGBA tuple, or `null` if the stored array is empty
	 */
	loadRgba(key: string): Rgba | null {
		this.push(key);
		const color = Global.Settings.get_value(key).recursiveUnpack() as number[];
		if (!color.length) return null;
		return color as Rgba;
	}
}

/**
 * Base class for all extension features, managing lifecycle (`load`/`unload`/`reload`),
 * automatic `Maid` resource cleanup, and reactive GSettings tracking via `SettingLoader`.
 */
export abstract class FeatureBase {
	/** When true, suppresses debug logs from `SettingLoader`. */
	disableDebugMessage: boolean = false;
	/** Reactive settings loader for this feature. */
	loader: SettingLoader;
	/** Cleanup manager cleared automatically on `unload()`. */
	maid: Maid;

	/**
	 * Initializes the feature's `Maid` and `SettingLoader` with automatic reload on setting changes.
	 */
	constructor() {
		this.maid = new Maid();
		this.loader = new SettingLoader((key: string) => {
			this.loader.clear();
			this.loadSettings(this.loader);
			this.reload(key);
		}, this);
	}

	/**
	 * Loads settings (unless `noSettingsLoad` is true) and invokes `onLoad()`.
	 *
	 * @param noSettingsLoad - Skip calling `loadSettings()` when reloading after settings were already refreshed
	 */
	load(noSettingsLoad?: boolean): void {
		if (!noSettingsLoad) this.loadSettings(this.loader);
		this.onLoad();
	}

	/**
	 * Clears tracked settings (unless `noSettingsUnload` is true), invokes `onUnload()`, and clears `maid`.
	 *
	 * @param noSettingsUnload - Skip clearing `SettingLoader` listeners when reloading
	 */
	unload(noSettingsUnload?: boolean): void {
		if (!noSettingsUnload) this.loader.clear();
		this.onUnload();
		this.maid.clear();
	}

	/**
	 * Called when the feature is enabled or reloaded. Subclasses must implement setup logic here.
	 */
	abstract onLoad(): void;

	/**
	 * Called when the feature is disabled or reloaded. Subclasses must implement teardown logic here.
	 */
	abstract onUnload(): void;

	/**
	 * Reloads the feature by unloading and re-loading without re-subscribing to settings.
	 *
	 * @param _changedKey - GSettings key that triggered the reload, if any
	 */
	reload(_changedKey?: string): void {
		this.unload(true);
		this.load(true);
	}

	/**
	 * Reads all GSettings keys required by this feature using the provided `SettingLoader`.
	 *
	 * @param loader - `SettingLoader` instance to read and subscribe to settings
	 */
	abstract loadSettings(loader: SettingLoader): void;
}
