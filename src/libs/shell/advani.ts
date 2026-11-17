import Clutter from "gi://Clutter";
import Graphene from "gi://Graphene";

/**
 * Parameters for GNOME Shell's base `actor.ease()` animation function.
 * Extends standard Clutter easing options with support for custom `AdvAnimationMode`
 * and `ModeDefine` cubic-bezier definitions.
 */
export interface EasingParams {
	/** Number of times the animation should repeat. */
	repeatCount?: number;
	/** Whether the animation should reverse on alternate repetitions. */
	autoReverse?: boolean;
	/** Whether the animation runs even when animations are globally disabled. */
	animationRequired?: boolean;
	/** Duration of the animation in milliseconds. */
	duration?: number;
	/** Delay before the animation starts in milliseconds. */
	delay?: number;
	/** Easing mode, either a built-in Clutter mode, an `AdvAnimationMode`, or a `ModeDefine`. */
	mode?: Clutter.AnimationMode | AdvAnimationMode | ModeDefine;
	[key: string]: unknown;
}

/**
 * Parameters for `advani.ease()`, requiring an explicit `mode`.
 * Ensures callers specify how the transition curve should be interpolated.
 */
export interface AdvEasingParams extends EasingParams {
	/** Easing mode, either a built-in Clutter mode, an `AdvAnimationMode`, or a `ModeDefine`. */
	mode: Clutter.AnimationMode | AdvAnimationMode | ModeDefine;
}

/**
 * Definition of a custom easing mode with optional cubic-bezier control points.
 * Used to configure `ModeDefine` instances for `advani.ease()`.
 */
export interface ModeDefineIface {
	/** Underlying Clutter animation mode (typically `Clutter.AnimationMode.CUBIC_BEZIER`). */
	mode: Clutter.AnimationMode;
	/** Factory returning the two cubic-bezier control points on demand. */
	getCubicBezierProgress?: () => [Graphene.Point, Graphene.Point];
	/** Static pair of cubic-bezier control points. */
	cubicBezierProgress?: [Graphene.Point, Graphene.Point];
}

/**
 * Encapsulates a custom animation mode and its cubic-bezier control points.
 * Allows passing reusable custom easing curves to `advani.ease()`.
 */
export class ModeDefine implements ModeDefineIface {
	mode: Clutter.AnimationMode;
	getCubicBezierProgress?: () => [Graphene.Point, Graphene.Point];
	cubicBezierProgress?: [Graphene.Point, Graphene.Point];

	/**
	 * Creates a new `ModeDefine` from the given mode configuration.
	 *
	 * @param params - Mode and optional cubic-bezier control point configuration
	 */
	constructor(params: ModeDefineIface) {
		this.mode = params.mode;
		Object.assign(this, params);
	}
}

/**
 * Creates a pair of `Graphene.Point` control points for a cubic-bezier curve.
 * Use this helper when defining custom `ModeDefine` easing curves.
 *
 * @param x1 - X coordinate of the first control point
 * @param y1 - Y coordinate of the first control point
 * @param x2 - X coordinate of the second control point
 * @param y2 - Y coordinate of the second control point
 * @returns Tuple of two `Graphene.Point` control points
 */
export function createBezier(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
): [Graphene.Point, Graphene.Point] {
	return [
		new Graphene.Point({ x: x1, y: y1 }),
		new Graphene.Point({ x: x2, y: y2 }),
	];
}

/**
 * Built-in custom easing modes provided by AdvAni.
 * Values start above `Clutter.AnimationMode.ANIMATION_LAST` to avoid collisions.
 */
export enum AdvAnimationMode {
	LowBackover = 2000,
	MiddleBackover = 2001,
}

/**
 * Predefined `ModeDefine` instances corresponding to `AdvAnimationMode` enum values.
 */
export const AdvAnimationModeDefines = [
	new ModeDefine({
		mode: Clutter.AnimationMode.CUBIC_BEZIER,
		getCubicBezierProgress: () => createBezier(0.225, 1.2, 0.45, 1),
	}),
	new ModeDefine({
		mode: Clutter.AnimationMode.CUBIC_BEZIER,
		getCubicBezierProgress: () => createBezier(0.4, 1.35, 0.55, 1),
	}),
] as ModeDefine[];

/**
 * Animates a `Clutter.Actor` using standard or custom AdvAni cubic-bezier easing modes.
 * Resolves `AdvAnimationMode` or `ModeDefine` values to `Clutter.AnimationMode`, runs `actor.ease()`,
 * and applies custom cubic-bezier progress points to each created property transition.
 *
 * @param actor - Target Clutter actor to animate
 * @param params - Animation properties, duration, and easing mode
 */
export function ease(actor: Clutter.Actor, params: AdvEasingParams) {
	// Get mode defines
	let modeDefine: ModeDefine | null = null;
	if (
		typeof params.mode === "number" &&
		params.mode > Clutter.AnimationMode.ANIMATION_LAST
	) {
		modeDefine =
			AdvAnimationModeDefines[params.mode - AdvAnimationMode.LowBackover];
		params.mode = modeDefine.mode;
	} else if (
		typeof params.mode === "object" &&
		params.mode instanceof ModeDefine
	) {
		modeDefine = params.mode;
		params.mode = modeDefine.mode;
	}

	// Run gnome ease function
	actor.ease(params as Parameters<Clutter.Actor["ease"]>[0]);
	if (!modeDefine) return;

	// Adjust bezier progress if option exist
	let { getCubicBezierProgress, cubicBezierProgress } = modeDefine;
	if (getCubicBezierProgress) cubicBezierProgress = getCubicBezierProgress();
	if (cubicBezierProgress) {
		for (const key in params) {
			const transition = actor.get_transition(key.replace(/_/g, "-"));
			if (!transition) continue;
			transition.set_cubic_bezier_progress(...cubicBezierProgress);
		}
	}
}
