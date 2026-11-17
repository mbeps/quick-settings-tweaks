import type Adw from "gi://Adw";
import Gdk from "gi://Gdk";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import {
	gettext as _,
	ExtensionPreferences,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import Config from "./config.js";
import type { ContributorsRow, LicenseRow } from "./libs/prefs/components.js";
import { AboutPage } from "./prefPages/about.js";
import { LayoutPage } from "./prefPages/layout.js";
import { MenuPage } from "./prefPages/menu.js";
import { WidgetsPage } from "./prefPages/widgets.js";

var pageList = [WidgetsPage, LayoutPage, MenuPage, AboutPage];

/**
 * Preferences window entry point for the Quick Settings Tweaks extension.
 * Registers icon paths, loads metadata assets, and populates Adwaita preference pages.
 */
export default class QstExtensionPreferences extends ExtensionPreferences {
	/**
	 * Adds a directory to the default GTK icon theme search path if not already present.
	 *
	 * @param path - Absolute filesystem path to the icon directory
	 */
	appendIconPath(path: string) {
		const iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
		if (!iconTheme.get_search_path().includes(path))
			iconTheme.add_search_path(path);
	}

	/**
	 * Reads and UTF-8 decodes a file relative to the extension root directory.
	 *
	 * @param path - Relative path to the file within the extension directory
	 * @returns Decoded text contents of the file
	 */
	readExtensionFile(path: string) {
		const decoder = new TextDecoder();
		const file = Gio.File.new_for_path(`${this.path}/${path}`);
		const content = file.load_contents(null)[1];
		return decoder.decode(content);
	}

	/**
	 * Loads contributor metadata and groups entries into rows of up to four items.
	 *
	 * @returns Two-dimensional array of contributor rows for the About page
	 */
	getContributorRows(): ContributorsRow.Contributor[][] {
		const contributors = JSON.parse(
			this.readExtensionFile("media/contributors/data.json"),
		) as ContributorsRow.Contributor[];
		if (!contributors.length) return [];
		const rows: ContributorsRow.Contributor[][] = [[]];
		contributors.reduce(
			(
				currentRow: ContributorsRow.Contributor[],
				obj: ContributorsRow.Contributor,
			) => {
				if (currentRow.length >= 4) {
					currentRow = [];
					rows.push(currentRow);
				}
				currentRow.push(obj);
				return currentRow;
			},
			rows[0],
		);
		return rows;
	}

	/**
	 * Loads third-party license metadata and attaches lazy file loaders for license texts.
	 *
	 * @returns Array of license entries with optional async content loaders
	 */
	getLicenses(): LicenseRow.License[] {
		const licenses = JSON.parse(
			this.readExtensionFile("media/licenses.json"),
		) as LicenseRow.License[];
		for (const item of licenses) {
			if (item.file) {
				item.content = async () => this.readExtensionFile(item.file);
			}
		}
		return licenses;
	}

	/**
	 * Formats the human-readable extension version and build channel string.
	 *
	 * @returns Formatted version string including release channel and build origin
	 */
	getVersionString(): string {
		let version = Config.version.toUpperCase().replace(/-.*?$/, "");
		if (this.metadata.version) {
			version += `.${this.metadata.version}`;
		}
		version += "   —   ";
		if (Config.isReleaseBuild) {
			version += _("Stable");
		} else if (Config.isDevelopmentBuild) {
			version += _("Development");
		} else {
			version += _("Preview");
		}
		if (Config.isGithubBuild) {
			version += `  ${_("(Github Release)")}`;
		} else if (!this.metadata.version) {
			version += `  ${_("(Built from source)")}`;
		}
		return version;
	}

	/**
	 * Reads the extension changelog markdown file.
	 *
	 * @returns Raw markdown contents of `media/Changelog.md`
	 */
	getChangelog(): string {
		return this.readExtensionFile("media/Changelog.md");
	}

	/**
	 * Populates the Adwaita preferences window with all extension preference pages.
	 *
	 * @param window - Adwaita preferences window instance to populate
	 */
	async fillPreferencesWindow(window: Adw.PreferencesWindow) {
		const settings = this.getSettings();

		// Window options
		window.set_search_enabled(true);
		window.set_default_size(690, 680);

		// Register icon path
		this.appendIconPath(`${this.path}/media`);
		this.appendIconPath(`${this.path}/media/contributors`);

		for (const page of pageList) {
			window.add(new page(settings, this, window));
		}
	}
}
