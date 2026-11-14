import Clutter from "gi://Clutter";
import Graphene from "gi://Graphene";

// Gnome base ease function params
export interface EasingParams {
	repeatCount?: number;
	autoReverse?: boolean;
	animationRequired?: boolean;
	duration?: number;
	delay?: number;
	mode?: Clutter.AnimationMode | AdvAnimationMode | ModeDefine;
	[key: string]: unknown;
}

// AdvAni ease function params
export interface AdvEasingParams extends EasingParams {
	mode: Clutter.AnimationMode | AdvAnimationMode | ModeDefine;
}

// AdvAni ease mode define type
export interface ModeDefineIface {
	mode: Clutter.AnimationMode;
	getCubicBezierProgress?: () => [Graphene.Point, Graphene.Point];
	cubicBezierProgress?: [Graphene.Point, Graphene.Point];
}
export class ModeDefine implements ModeDefineIface {
	mode: Clutter.AnimationMode;
	getCubicBezierProgress?: () => [Graphene.Point, Graphene.Point];
	cubicBezierProgress?: [Graphene.Point, Graphene.Point];
	constructor(params: ModeDefineIface) {
		this.mode = params.mode;
		Object.assign(this, params);
	}
}

// Utility functions
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

// Template AdvAni animations
export enum AdvAnimationMode {
	LowBackover = 2000,
	MiddleBackover = 2001,
}
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

// Main AdvAni ease function
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
