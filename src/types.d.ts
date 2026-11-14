import "@girs/gnome-shell/ambient";
import "@girs/gnome-shell/extensions/global";
import "@girs/gjs/dom";
import "@girs/gjs";
import "./ambient";

declare module "@girs/clutter-17/clutter-17" {
	namespace Clutter {
		interface Actor {
			ease(params: EasingParamsWithProps): void;
			ease_property(
				propName: string,
				target: unknown,
				params: EasingParams,
			): void;
		}
	}
}
