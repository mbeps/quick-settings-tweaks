/**
 * Mutable builder for space-separated CSS class strings.
 * Batches class additions and removals so St widgets only re-layout and repaint once.
 */
export class StyleClass {
	/**
	 * Individual class names currently in the list.
	 */
	classArray: string[];
	/**
	 * Whether `add` or `remove` has changed the class list since construction.
	 */
	modified: boolean;

	/**
	 * Creates a `StyleClass` instance from an existing space-separated class string.
	 *
	 * @param classString - Initial space-separated CSS class names
	 */
	constructor(classString: string) {
		this.modified = false;
		this.classArray = classString.split(" ");
	}

	/**
	 * Removes a class name if present and marks the list as modified.
	 *
	 * @param className - CSS class name to remove
	 * @returns This `StyleClass` instance for chaining
	 */
	remove(className: string): StyleClass {
		const lastLen = this.classArray.length;
		this.classArray = this.classArray.filter((i) => i !== className);
		if (this.classArray.length !== lastLen) {
			this.modified = true;
		}
		return this;
	}

	/**
	 * Adds a class name if not already present and marks the list as modified.
	 *
	 * @param className - CSS class name to add
	 * @returns This `StyleClass` instance for chaining
	 */
	add(className: string): StyleClass {
		if (this.classArray.includes(className)) return this;
		this.classArray.push(className);
		this.modified = true;
		return this;
	}

	/**
	 * Joins the class list back into a space-separated string.
	 *
	 * @returns Space-separated CSS class string
	 */
	stringify(): string {
		return this.classArray.join(" ");
	}
}
