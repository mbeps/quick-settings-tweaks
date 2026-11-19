# Quick Settings Tweaks

Quick Settings Tweaks is a GNOME Shell extension that customises the Quick Settings panel. It adds media controls and a volume mixer to the menu. Users can also reorder or hide toggles, restyle the date menu, and enable an overlay layout.

# Features

## Widgets

- Add media controls to the Quick Settings menu
- Control per-application audio streams with a volume mixer

## Layout

- Enable an overlay layout for the Quick Settings panel
- Restyle the date menu and adjust menu animations
- Reorder widgets and sections within the panel

## Quick Toggles

- Reorder existing Quick Settings toggles
- Hide unused or unwanted toggles from the menu
- Add custom toggles for quick actions

# Requirements

- GNOME Shell 48, 49, or 50
- Node.js 18 or higher
- `glib-compile-schemas` and `gnome-extensions` CLI
- `gettext` (Optional, for updating translations)
- Docker (Optional, for running the development container)

# Stack

## Extension

- [TypeScript](https://www.typescriptlang.org/docs/): Typed superset of JavaScript compiled to ESM for GNOME Shell.
- [GJS](https://gjs.guide/): GNOME JavaScript runtime providing bindings to Clutter, St, Gio, GLib, and GObject.
- [Adwaita](https://gnome.pages.gitlab.gnome.org/libadwaita-docs/): UI library used for the GTK4 preferences window.
- [GSettings](https://docs.gtk.org/gio/class.Settings.html): Configuration storage system backed by compiled XML schemas.

## Tooling

- [Sass](https://sass-lang.com/documentation/): CSS preprocessor used to compile extension stylesheets.
- [gettext](https://www.gnu.org/software/gettext/manual/gettext.html): Internationalisation toolkit used to extract and compile translation files.

# Setting Up Project

## 1. Clone the Project Locally

```bash
git clone https://github.com/mbeps/quick-settings-tweaks.git
cd quick-settings-tweaks
```

## 2. Install Dependencies

```bash
pnpm install
```

## 3. Build and Install the Extension

```bash
bash install.sh install
```

# Run Application

Install and enable the extension in your current GNOME session:

```bash
bash install.sh install-enable
```

Alternatively, you can build the distributable `.shell-extension.zip` package using the following command:

```bash
bash install.sh build
```

To view live extension logs during development:

```bash
bash install.sh log
```

# References

- [GNOME Shell Extensions Guide](https://gjs.guide/extensions/) 
- [GJS Documentation](https://gjs.guide/guides/) 
- [Libadwaita Documentation](https://gnome.pages.gitlab.gnome.org/libadwaita-docs/) 
- [GNOME Shell Source](https://gitlab.gnome.org/GNOME/gnome-shell)
- [jstockdale/Quick Settings Tweaker](https://github.com/jstockdale/quick-settings-tweaks)
- [qwreey/Quick Settings Tweaker](https://github.com/qwreey/quick-settings-tweaks) 
