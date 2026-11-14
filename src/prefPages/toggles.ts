import Adw from "gi://Adw";
import type Gio from "gi://Gio";
import GObject from "gi://GObject";
import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import Config from "../config.js";
import {
	fixPageScrollIssue,
	Group,
	SwitchRow,
} from "../libs/prefs/components.js";
import type QstExtensionPreferences from "../prefs.js";

export const TogglesPage = GObject.registerClass(
	{
		GTypeName: `${Config.baseGTypeName}TogglesPage`,
	},
	class TogglesPage extends Adw.PreferencesPage {
		constructor(
			settings: Gio.Settings,
			_prefs: QstExtensionPreferences,
			_window: Adw.PreferencesWindow,
		) {
			super({
				name: "Toggles",
				title: _("Toggles"),
				iconName: "view-grid-symbolic",
			});
			fixPageScrollIssue(this);

			// Unsafe Mode Toggle
			Group(
				{
					parent: this,
					title: _("Unsafe Mode Quick Toggle"),
					description: _(
						"Turn on to add the unsafe quick toggle on the Quick Settings panel",
					),
					headerSuffix: SwitchRow({
						settings,
						bind: "unsafe-quick-toggle-enabled",
					}),
				},
				[
					SwitchRow({
						settings,
						title: _("Save last session state"),
						subtitle: _("Turn on to save last session unsafe state"),
						bind: "unsafe-quick-toggle-save-last-state",
						sensitiveBind: "unsafe-quick-toggle-enabled",
					}),
				],
			);
		}
	},
);
