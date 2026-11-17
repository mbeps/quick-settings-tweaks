import type Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import type St from "gi://St";
import type { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import type { CalendarMessageList } from "resource:///org/gnome/shell/ui/calendar.js";
import type { DateMenuButton } from "resource:///org/gnome/shell/ui/dateMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import type { MessageTray } from "resource:///org/gnome/shell/ui/messageTray.js";
import type * as Panel from "resource:///org/gnome/shell/ui/panel.js";
import type { PopupMenu } from "resource:///org/gnome/shell/ui/popupMenu.js";
import type {
	QuickSettingsMenu,
	QuickSlider,
} from "resource:///org/gnome/shell/ui/quickSettings.js";
import type {
	Indicator as SystemIndicator,
	SystemItem,
} from "resource:///org/gnome/shell/ui/status/system.js";
import type * as VolumeStatus from "resource:///org/gnome/shell/ui/status/volume.js";
import Logger from "./libs/shared/logger.js";

type StreamSlider = {
	VolumeInput: VolumeStatus.InputIndicator;
	InputStreamSlider: QuickSlider;
	OutputStreamSlider: QuickSlider;
};

type DateMenuWithIndicator = DateMenuButton & {
	_indicator: Clutter.Actor;
};

let DBusFiles: Map<string, Gio.DBusNodeInfo> = null;
let Decoder: TextDecoder = null;
let Shaders: Map<string, [string, string]> = null;

function StreamSliderGetter(): StreamSlider | null {
	if (!Global.QuickSettings._volumeInput) return null;
	return {
		VolumeInput: Global.QuickSettings._volumeInput,
		InputStreamSlider: Global.QuickSettings._volumeInput._input,
		OutputStreamSlider: Global.QuickSettings._volumeOutput._output,
	};
}

/**
 * Shared global registry holding references to GNOME Shell UI internals,
 * extension settings, and cached D-Bus/shader resources.
 * Initialized on extension enable via `Global.load` and cleared on disable via `Global.unload`.
 */
const Global = {
	QuickSettings: null as Panel.QuickSettings,
	QuickSettingsMenu: null as QuickSettingsMenu,
	QuickSettingsGrid: null as St.Widget,
	QuickSettingsBox: null as St.BoxLayout,
	QuickSettingsActor: null as St.Widget,
	/**
	 * Resolves the GNOME Shell system indicator once it is available on the Quick Settings panel.
	 *
	 * @returns Promise resolving to the SystemIndicator instance
	 */
	get QuickSettingsSystemIndicator(): Promise<SystemIndicator> {
		return new Promise((resolve) => {
			let system = Global.QuickSettings._system;
			if (system) {
				resolve(system);
				return;
			}
			GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
				system = Global.QuickSettings._system;
				if (!system) return GLib.SOURCE_CONTINUE;
				resolve(system);
				return GLib.SOURCE_REMOVE;
			});
		});
	},
	/**
	 * Resolves the GNOME Shell system item from the Quick Settings system indicator.
	 *
	 * @returns Promise resolving to the SystemItem instance
	 */
	get QuickSettingsSystemItem(): Promise<SystemItem> {
		return Global.QuickSettingsSystemIndicator.then(
			(system) => system._systemItem,
		).catch(Logger.error) as Promise<SystemItem>;
	},
	Indicators: null as St.BoxLayout,

	DateMenu: null as DateMenuButton,
	DateMenuMenu: null as PopupMenu,
	DateMenuBox: null as Clutter.Actor,
	DateMenuHolder: null as Clutter.Actor,

	MessageTray: null as MessageTray,

	Extension: null as Extension,
	Settings: null as Gio.Settings,

	get MessageList(): CalendarMessageList {
		return Global.DateMenu._messageList;
	},
	get DateMenuIndicator(): Clutter.Actor {
		return (Global.DateMenu as DateMenuWithIndicator)._indicator;
	},

	/**
	 * Resolves the shutdown menu box actor once the system indicator is initialized.
	 *
	 * @returns Promise resolving to the system item menu box actor
	 */
	GetShutdownMenuBox(): Promise<Clutter.Actor> {
		// To prevent freeze, priority should be PRIORITY_DEFAULT_IDLE instead of PRIORITY_DEFAULT
		return new Promise((resolve) => {
			GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
				if (!Global.QuickSettings._system) return GLib.SOURCE_CONTINUE;
				resolve(Global.QuickSettings._system._systemItem.menu.box);
				return GLib.SOURCE_REMOVE;
			});
		});
	},

	/**
	 * Resolves the volume input/output stream sliders once initialized in Quick Settings.
	 *
	 * @returns Promise resolving to the StreamSlider references
	 */
	GetStreamSlider(): Promise<StreamSlider> {
		return new Promise((resolve) => {
			let streamSlider = StreamSliderGetter();
			if (streamSlider) {
				resolve(streamSlider);
				return;
			}
			GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
				streamSlider = StreamSliderGetter();
				if (!streamSlider) return GLib.SOURCE_CONTINUE;
				resolve(streamSlider);
				return GLib.SOURCE_REMOVE;
			});
		});
	},

	/**
	 * Loads and caches a D-Bus interface definition from an XML file in the extension directory.
	 *
	 * @param path - Relative path to the D-Bus introspection XML file
	 * @param interfaceName - Name of the D-Bus interface to look up
	 * @returns Parsed D-Bus interface info, or null if not found
	 */
	GetDbusInterface(path: string, interfaceName: string) {
		let cachedInfo = DBusFiles.get(path);
		if (!cachedInfo) {
			const DbusFile = Gio.File.new_for_path(
				`${Global.Extension.path}/${path}`,
			);
			cachedInfo = Gio.DBusNodeInfo.new_for_xml(
				Decoder.decode(DbusFile.load_contents(null)[1]),
			);
			DBusFiles.set(path, cachedInfo);
		}
		return cachedInfo.lookup_interface(interfaceName);
	},

	/**
	 * Loads, parses, and caches a GLSL shader file into declarations and main body segments.
	 *
	 * @param path - Relative path to the shader file within the extension directory
	 * @returns Tuple containing `[declarations, mainBody]`
	 */
	GetShader(path: string): [string, string] {
		let cachedInfo = Shaders.get(path);
		if (!cachedInfo) {
			const shaderFile = Gio.File.new_for_path(
				`${Global.Extension.path}/${path}`,
			);
			const [declarations, main] = Decoder.decode(
				shaderFile.load_contents(null)[1],
			).split(/^.*?main\(\s?\)\s?/m) as [string, string];
			cachedInfo = [
				declarations.trim(),
				main.trim().replace(/^[{}]/gm, "").trim(),
			];
			Shaders.set(path, cachedInfo);
		}
		return cachedInfo;
	},

	/**
	 * Clears all cached GNOME Shell references, settings, and resource maps on extension disable.
	 */
	unload() {
		Global.QuickSettings = null;
		Global.QuickSettingsMenu = null;
		Global.QuickSettingsGrid = null;
		Global.QuickSettingsBox = null;
		Global.QuickSettingsActor = null;
		Global.Indicators = null;
		Global.DateMenu = null;
		Global.DateMenuMenu = null;
		Global.DateMenuBox = null;
		Global.DateMenuHolder = null;
		Global.MessageTray = null;
		Global.Extension = null;
		Global.Settings = null;
		DBusFiles = null;
		Shaders = null;
		Decoder = null;
	},
	/**
	 * Initializes global references to GNOME Shell UI components, settings, and resource caches.
	 *
	 * @param extension - Active extension instance
	 */
	load(extension: Extension) {
		Global.Extension = extension;
		Global.Settings = extension.getSettings();
		Shaders = new Map();
		DBusFiles = new Map();
		Decoder = new TextDecoder("utf-8");

		// Quick Settings Items
		const QuickSettings = Main.panel.statusArea.quickSettings;
		Global.QuickSettings = QuickSettings;
		Global.QuickSettingsMenu = QuickSettings.menu;
		Global.QuickSettingsGrid = QuickSettings.menu._grid;
		Global.QuickSettingsBox = QuickSettings.menu.box;
		Global.QuickSettingsActor = QuickSettings.menu.actor;
		Global.Indicators = QuickSettings._indicators;

		// Date Menu
		const DateMenu = Main.panel.statusArea.dateMenu;
		Global.DateMenu = DateMenu;
		const DateMenuMenu = DateMenu.menu as PopupMenu;
		Global.DateMenuMenu = DateMenuMenu;
		Global.DateMenuBox = DateMenuMenu.box;
		Global.DateMenuHolder = DateMenuMenu.box.first_child.first_child;

		// Message
		Global.MessageTray = Main.messageTray;
	},
};

export default Global;
