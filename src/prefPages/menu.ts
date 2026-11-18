import Adw from "gi://Adw";
import type Gio from "gi://Gio";
import GObject from "gi://GObject";
import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import Config from "../config.js";
import {
	AdjustmentRow,
	DialogRow,
	DropdownRow,
	fixPageScrollIssue,
	Group,
	SwitchRow,
} from "../libs/prefs/components.js";
import type QstExtensionPreferences from "../prefs.js";

// #region AdvancedAnimationStyleGroup
/**
 * Builds the preferences group for fine-tuning menu open/close animation and background effects.
 * All rows are bound to `menu-animation-enabled` sensitivity.
 *
 * @param settings - GSettings instance for reading and writing animation preferences
 * @returns Configured Adwaita preferences group for advanced animation settings
 */
function AdvancedAnimationStyleGroup(
	settings: Gio.Settings,
): Adw.PreferencesGroup {
	return Group(
		{
			title: _("Advanced animation style"),
		},
		[
			AdjustmentRow({
				settings,
				title: _("Open Duration"),
				subtitle: _("Open animation duration in microseconds"),
				sensitiveBind: "menu-animation-enabled",
				bind: "menu-animation-open-duration",
				max: 4000,
			}),
			AdjustmentRow({
				settings,
				title: _("Close Duration"),
				subtitle: _("Close animation duration in microseconds"),
				sensitiveBind: "menu-animation-enabled",
				bind: "menu-animation-close-duration",
				max: 4000,
			}),
			AdjustmentRow({
				settings,
				title: _("Grid Content Opacity"),
				subtitle: _(
					"Adjust grid content opacity.\nSet this to 255 to make opaque, and 0 to make transparent",
				),
				sensitiveBind: "menu-animation-enabled",
				bind: "menu-animation-grid-content-opacity",
				max: 255,
			}),
			AdjustmentRow({
				settings,
				title: _("Background Blur Radius"),
				subtitle: _(
					"Adjust background blur radius.\nSet this to 0 to disable blur effect",
				),
				sensitiveBind: "menu-animation-enabled",
				bind: "menu-animation-background-blur-radius",
				max: 32,
			}),
			AdjustmentRow({
				settings,
				title: _("Background Brightness"),
				subtitle: _(
					"Adjust background brightness.\nSet this to 1000 to disable brightness control effect.\nNot impacts on gnome-shell's default dim effect.",
				),
				sensitiveBind: "menu-animation-enabled",
				bind: "menu-animation-background-brightness",
				max: 2000,
			}),
			AdjustmentRow({
				settings,
				title: _("Background Opacity"),
				subtitle: _(
					"Adjust background opacity.\nSet this to 255 to make opaque, and 0 to make transparent",
				),
				sensitiveBind: "menu-animation-enabled",
				bind: "menu-animation-background-opacity",
				max: 255,
			}),
			AdjustmentRow({
				settings,
				title: _("Background X Scale"),
				subtitle: _("Adjust background x scale, 1000 means 1.0 scale"),
				sensitiveBind: "menu-animation-enabled",
				bind: "menu-animation-background-scale-x",
				max: 4000,
			}),
			AdjustmentRow({
				settings,
				title: _("Background Y Scale"),
				subtitle: _("Adjust background y scale, 1000 means 1.0 scale"),
				sensitiveBind: "menu-animation-enabled",
				bind: "menu-animation-background-scale-y",
				max: 4000,
			}),
		],
	);
}
// #endregion AdvancedAnimationStyleGroup

/**
 * Preferences page for Quick Settings menu behaviour, overlay mode, and animation settings.
 * Registered with GObject and added to the Adwaita preferences window.
 */
export const MenuPage = GObject.registerClass(
	{
		GTypeName: `${Config.baseGTypeName}MenuPage`,
	},
	class MenuPage extends Adw.PreferencesPage {
		/**
		 * Constructs the Menu preferences page with overlay mode and menu animation groups.
		 *
		 * @param settings - GSettings instance for reading and writing menu preferences
		 * @param _prefs - Extension preferences controller (unused)
		 * @param window - Parent preferences window used to present nested animation dialogs
		 */
		constructor(
			settings: Gio.Settings,
			_prefs: QstExtensionPreferences,
			window: Adw.PreferencesWindow,
		) {
			super({
				name: "Menu",
				title: _("Menu"),
				iconName: "user-available-symbolic",
			});
			fixPageScrollIssue(this);

			// Submenu Mode
			const overlayRows = [
				AdjustmentRow({
					settings,
					title: _("Overlay Width"),
					subtitle: _(
						"Adjust overlay menu width\nSet this to 0 to disable adjusting",
					),
					bind: "overlay-menu-width",
					max: 2048,
				}),
				AdjustmentRow({
					settings,
					title: _("Overlay Animation Duration"),
					subtitle: _(
						"Custom menu open animation duration in microseconds\nSet this to 0 to disable custom animation",
					),
					bind: "overlay-menu-animate-duration",
					max: 4000,
				}),
				DropdownRow({
					settings,
					title: _("Overlay Animation Style"),
					subtitle: _("Custom menu open animation style"),
					items: [
						{ name: _("Flyout"), value: "flyout" },
						{ name: _("Dialog"), value: "dialog" },
					],
					bind: "overlay-menu-animate-style",
				}),
				DropdownRow({
					settings,
					title: _("Overlay overflow anchor"),
					subtitle: _(
						"When the menu box is taller than Quick Settings, determines where in Quick Settings the menu box will be fixed",
					),
					items: [
						{ name: _("Top"), value: "top" },
						{ name: _("Center"), value: "center" },
						{ name: _("Bottom"), value: "bottom" },
					],
					bind: "overlay-menu-overflow-anchor",
				}),
			];

			const pageDurationRow = AdjustmentRow({
				settings,
				title: _("Page Animation Duration"),
				subtitle: _(
					"Slide transition duration in milliseconds\nSet this to 0 to disable transition animation",
				),
				bind: "page-menu-animate-duration",
				max: 2000,
			});

			const submenuGroup = Group(
				{
					parent: this,
					title: _("Submenu"),
					description: _(
						"Customize how toggle, power, and sound submenus are presented",
					),
					experimental: true,
				},
				[
					DropdownRow({
						settings,
						title: _("Submenu Mode"),
						subtitle: _("Choose how Quick Settings submenus open"),
						items: [
							{ name: _("Default"), value: "default" },
							{ name: _("Overlay"), value: "overlay" },
							{ name: _("Page"), value: "page" },
						],
						bind: "submenu-mode",
					}),
					...overlayRows,
					pageDurationRow,
				],
			);

			// Animation
			const animationGroup = Group(
				{
					parent: this,
					title: _("Animation"),
					description: _(
						"Add menu animation on toggle menu opening and closing (Default / Overlay modes)\nTo get the best feel, turn on overlay mode",
					),
					headerSuffix: SwitchRow({
						settings,
						bind: "menu-animation-enabled",
					}),
					experimental: true,
				},
				[
					DialogRow({
						window,
						settings,
						title: _("Advanced animation style"),
						subtitle: _("Adjust speed, blur, scale, and opacity"),
						dialogTitle: _("Animation"),
						sensitiveBind: "menu-animation-enabled",
						childrenRequest: () => [AdvancedAnimationStyleGroup(settings)],
					}),
				],
			);

			const updateModeVisibility = () => {
				const mode = settings.get_string("submenu-mode");
				for (const row of overlayRows) row.visible = mode === "overlay";
				pageDurationRow.visible = mode === "page";
				animationGroup.sensitive = mode !== "page";
			};
			const submenuModeConn = settings.connect(
				"changed::submenu-mode",
				updateModeVisibility,
			);
			updateModeVisibility();
			submenuGroup.connect("destroy", () => {
				settings.disconnect(submenuModeConn);
			});
		}
	},
);
