import Clutter from "gi://Clutter";
import Cogl from "gi://Cogl";
import GObject from "gi://GObject";
import Shell from "gi://Shell";
import Config from "../../config.js";
import Global from "../../global.js";

type ShellGLSLEffect = Clutter.ShaderEffect & {
	add_glsl_snippet(
		hook: Cogl.SnippetHook,
		declarations: string,
		code: string,
		is_replace: boolean,
	): void;
	get_uniform_location(name: string): number;
	set_uniform_float(
		location: number,
		n_components: number,
		value: number[],
	): void;
};

type Clutter51ShaderEffect = Clutter.ShaderEffect & {
	set_uniform_float(name: string, n_components: number, value: number[]): void;
};

const ShellLegacy = Shell as typeof Shell & {
	GLSLEffect?: typeof Clutter.ShaderEffect;
};
const HasShellGLSLEffect = Boolean(ShellLegacy.GLSLEffect);
const EffectBase =
	ShellLegacy.GLSLEffect ??
	(Clutter.ShaderEffect as typeof Clutter.ShaderEffect);

// #region RoundClipEffect
/**
 * Clutter shader effect that clips an actor to a squircle-smoothed rounded rectangle with an optional border.
 * Uses the `media/rounded_corners.frag` fragment shader to render smooth anti-aliased corners
 * that `St.Widget` CSS `border-radius` cannot clip for child textures such as album art.
 */
export class RoundClipEffect extends EffectBase {
	private _uniformLocations?: Record<string, number>;

	/**
	 * Resets the pipeline blend mode to default alpha blending before painting the target.
	 *
	 * @param node - Clutter paint node for the current frame
	 * @param ctx - Clutter paint context
	 */
	vfunc_paint_target(node: Clutter.PaintNode, ctx: Clutter.PaintContext) {
		// Reset to default blend string.
		this.get_pipeline()?.set_blend(
			"RGBA = ADD(SRC_COLOR, DST_COLOR*(1-SRC_COLOR[A]))",
		);
		super.vfunc_paint_target(node, ctx);
	}

	private _setUniformFloat(name: string, value: number | number[]) {
		const floats = Array.isArray(value) ? value : [value];
		if (HasShellGLSLEffect) {
			const legacy = this as unknown as ShellGLSLEffect;
			this._uniformLocations ??= {};
			let location = this._uniformLocations[name];
			if (location === undefined) {
				location = legacy.get_uniform_location(name);
				this._uniformLocations[name] = location;
			}
			legacy.set_uniform_float(location, floats.length, floats);
			return;
		}
		(this as unknown as Clutter51ShaderEffect).set_uniform_float(
			name,
			floats.length,
			floats,
		);
	}

	/**
	 * Updates shader uniforms for bounds, corner radius, smoothing, and border styling, then queues a repaint.
	 * Call this whenever the actor's allocation, scale factor, or corner configuration changes.
	 *
	 * @param scale_factor - Display scale factor used to convert logical pixels to physical pixels
	 * @param corners_cfg - Corner radius, squircle smoothing factor, and optional padding
	 * @param outer_bounds - Actor bounding box in local coordinates
	 * @param border - Optional border width and RGBA color
	 * @param pixel_step - Optional inverse actor dimensions `[1/width, 1/height]`; derived from `this.actor` if omitted
	 */
	updateUniforms(
		scale_factor: number,
		corners_cfg: {
			padding?: { left: number; right: number; top: number; bottom: number };
			border_radius: number;
			smoothing: number;
		},
		outer_bounds: { x1: number; x2: number; y1: number; y2: number },
		border?: {
			width: number;
			color: [number, number, number, number];
		},
		pixel_step?: [number, number],
	) {
		if (!pixel_step) {
			const actor = this.actor;
			const width = actor?.get_width() ?? 0;
			const height = actor?.get_height() ?? 0;
			if (width <= 0 || height <= 0) return;
			pixel_step = [1 / width, 1 / height];
		}

		const border_width = (border?.width ?? 0) * scale_factor;
		const border_color = border?.color ?? [0, 0, 0, 0];

		const outer_radius = corners_cfg.border_radius * scale_factor;
		const { padding, smoothing } = corners_cfg;

		const bounds = [
			outer_bounds.x1 + (padding ? padding.left * scale_factor : 0),
			outer_bounds.y1 + (padding ? padding.top * scale_factor : 0),
			outer_bounds.x2 - (padding ? padding.right * scale_factor : 0),
			outer_bounds.y2 - (padding ? padding.bottom * scale_factor : 0),
		];

		const inner_bounds = [
			bounds[0] + border_width,
			bounds[1] + border_width,
			bounds[2] - border_width,
			bounds[3] - border_width,
		];

		let inner_radius = outer_radius - border_width;
		if (inner_radius < 0.001) {
			inner_radius = 0.0;
		}

		// Setup with squircle shape
		let exponent = smoothing * 10.0 + 2.0;
		let radius = outer_radius * 0.5 * exponent;
		const max_radius = Math.max(
			0,
			Math.min(bounds[2] - bounds[0], bounds[3] - bounds[1]),
		);
		if (radius > max_radius) {
			exponent *= max_radius / radius;
			radius = max_radius;
		}
		inner_radius =
			outer_radius > 0 ? inner_radius * (radius / outer_radius) : 0.0;

		this._setUniformFloat("bounds", bounds);
		this._setUniformFloat("inner_bounds", inner_bounds);
		this._setUniformFloat("pixel_step", pixel_step);
		this._setUniformFloat("border_width", border_width);
		this._setUniformFloat("exponent", exponent);
		this._setUniformFloat("clip_radius", radius);
		this._setUniformFloat("border_color", border_color);
		this._setUniformFloat("inner_clip_radius", inner_radius);
		this.queue_repaint();
	}
}
// Attach only the active GNOME version's shader hook before GObject registration
if (HasShellGLSLEffect) {
	Object.defineProperty(RoundClipEffect.prototype, "vfunc_build_pipeline", {
		value: function (this: ShellGLSLEffect) {
			const [declarations, code] = Global.GetShader(
				"media/rounded_corners.frag",
			);
			this.add_glsl_snippet(
				Cogl.SnippetHook.FRAGMENT,
				declarations,
				code,
				false,
			);
		},
		configurable: true,
		writable: true,
	});
} else {
	Object.defineProperty(RoundClipEffect.prototype, "vfunc_get_static_snippet", {
		value: () => {
			const [declarations, code] = Global.GetShader(
				"media/rounded_corners.frag",
			);
			return Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, declarations, code);
		},
		configurable: true,
		writable: true,
	});
}
GObject.registerClass(
	{ GTypeName: `${Config.baseGTypeName}RoundClipEffect` },
	RoundClipEffect,
);
// #endregion RoundClipEffect
