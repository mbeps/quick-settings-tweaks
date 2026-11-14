// Lerp number
export function lerp(init: number, target: number, ratio: number) {
	return (target - init) * ratio + init;
}

// Perform a deep equal operation between too any js value
export function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b || (a == null && b == null)) return true;
	const typeA = typeof a;
	if (typeof b !== typeA) return false;
	if (typeA === "number" && Number.isNaN(a) && Number.isNaN(b)) return true;
	if (a instanceof RegExp && b instanceof RegExp)
		return a.toString() === b.toString();
	if (Array.isArray(a) && Array.isArray(b)) {
		const aLength = a.length;
		if (aLength !== b.length) return false;
		if (aLength === 0) return true;
		return a.every((value, index) => deepEqual(value, b[index]));
	}
	if (a instanceof Object && b instanceof Object) {
		const objB = b as Record<string, unknown>;
		for (const [key, value] of Object.entries(a)) {
			if (!deepEqual(objB[key], value)) return false;
		}
		return true;
	}
	return false;
}
