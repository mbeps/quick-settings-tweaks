import GObject from 'gi://GObject'
import Cogl from 'gi://Cogl'
import Clutter from 'gi://Clutter'
import Global from '../../global.js'

// #region RoundClipEffect
export class RoundClipEffect extends Clutter.ShaderEffect {
	vfunc_get_static_snippet (): Cogl.Snippet {
		const [declarations, code] = Global.GetShader("media/rounded_corners.frag")
		return Cogl.Snippet.new(
			Cogl.SnippetHook.FRAGMENT,
			declarations,
			code
		)
	}

	vfunc_paint_target (node: Clutter.PaintNode, ctx: Clutter.PaintContext) {
		// Reset to default blend string.
		this.get_pipeline()?.set_blend(
			'RGBA = ADD(SRC_COLOR, DST_COLOR*(1-SRC_COLOR[A]))'
		)
		super.vfunc_paint_target(node, ctx)
	}

	private _setUniformFloat (name: string, value: number | number[]) {
		const gvalue = new GObject.Value()
		if (Array.isArray(value)) {
			gvalue.init(Clutter.ShaderFloat.$gtype)
			Clutter.value_set_shader_float(gvalue, value)
		} else {
			gvalue.init(GObject.TYPE_FLOAT)
			gvalue.set_float(value)
		}
		this.set_uniform_value(name, gvalue)
	}

	updateUniforms (
		scale_factor: number,
		corners_cfg: {
			padding?: { left: number, right: number, top: number, bottom: number },
			border_radius: number,
			smoothing: number,
		},
		outer_bounds: { x1: number, x2: number, y1: number, y2: number },
		border?: {
			width: number
			color: [number, number, number, number]
		},
		pixel_step?: [number, number]
	) {
		const border_width = (border?.width ?? 0) * scale_factor
		const border_color = border?.color ?? [0, 0, 0, 0]

		const outer_radius = corners_cfg.border_radius * scale_factor
		const { padding, smoothing } = corners_cfg

		const bounds = [
			outer_bounds.x1 + (padding ? (padding.left * scale_factor) : 0),
			outer_bounds.y1 + (padding ? (padding.top * scale_factor) : 0),
			outer_bounds.x2 - (padding ? (padding.right * scale_factor) : 0),
			outer_bounds.y2 - (padding ? (padding.bottom * scale_factor) : 0),
		]

		const inner_bounds = [
			bounds[0] + border_width,
			bounds[1] + border_width,
			bounds[2] - border_width,
			bounds[3] - border_width,
		]

		let inner_radius = outer_radius - border_width
		if (inner_radius < 0.001) {
			inner_radius = 0.0
		}

		if (!pixel_step) {
			const actor = this.actor
			pixel_step = [1 / actor.get_width (), 1 / actor.get_height ()]
		}

		// Setup with squircle shape
		let exponent = smoothing * 10.0 + 2.0
		let radius = outer_radius * 0.5 * exponent
		const max_radius = Math.min (bounds[2] - bounds[0], bounds[3] - bounds[1])
		if (radius > max_radius) {
			exponent *= max_radius / radius
			radius = max_radius
		}
		inner_radius = outer_radius > 0 ? inner_radius * (radius / outer_radius) : 0.0

		this._setUniformFloat('bounds', bounds)
		this._setUniformFloat('inner_bounds', inner_bounds)
		this._setUniformFloat('pixel_step', pixel_step)
		this._setUniformFloat('border_width', border_width)
		this._setUniformFloat('exponent', exponent)
		this._setUniformFloat('clip_radius', radius)
		this._setUniformFloat('border_color', border_color)
		this._setUniformFloat('inner_clip_radius', inner_radius)
		this.queue_repaint()
	}
}
GObject.registerClass(RoundClipEffect)
// #endregion RoundClipEffect
