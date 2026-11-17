// Connection destroyer
type SignalObject = {
	connect: (
		signalName: string,
		callback: (...args: unknown[]) => never,
	) => number;
	disconnect: (id: number) => void;
};

type HideableObject = SignalObject & {
	hide: () => void;
	show: () => void;
	visible: boolean;
};

type HideUndoCallback<T> =
	| ((old: boolean, patchObject: T) => boolean | null | undefined)
	| ((old: boolean, patchObject: T) => void);

type TaskRecord =
	| [Maid.TaskType.Connect, number, SignalObject, number]
	| [Maid.TaskType.Function, number, () => unknown]
	| [Maid.TaskType.Dispose, number, { dispose: () => void }]
	| [Maid.TaskType.RunDispose, number, { run_dispose: () => void }]
	| [Maid.TaskType.Destroy, number, { destroy: () => void }]
	| [Maid.TaskType.Patch, number, Record<string, unknown>, string, unknown]
	| [
			Maid.TaskType.Hide,
			number,
			HideableObject,
			number,
			boolean,
			HideUndoCallback<HideableObject> | undefined,
	  ];

/**
 * Tracks cleanup tasks (signal connections, patches, hidden widgets, disposables) and tears them down together.
 * Use in GNOME Shell extensions to guarantee deterministic cleanup on `disable()` in priority order.
 */
class Maid {
	private records: TaskRecord[];

	/**
	 * Creates a new `Maid` instance with an empty task list.
	 */
	constructor() {
		this.records = [];
	}

	/**
	 * Connects a GObject signal and schedules it for automatic disconnection on cleanup.
	 *
	 * @param signalObject - Object emitting the signal
	 * @param signalName - Name of the signal to connect
	 * @param handleFunc - Signal handler callback
	 * @param priority - Cleanup priority (higher values run first)
	 * @returns Signal connection ID
	 */
	connectJob(
		signalObject: SignalObject,
		signalName: string,
		handleFunc: (...args: never[]) => unknown,
		priority: number = 0,
	): number {
		const id = signalObject.connect(
			signalName,
			handleFunc as (...args: unknown[]) => never,
		);
		this.getRecords().push([Maid.TaskType.Connect, priority, signalObject, id]);
		return id;
	}

	/**
	 * Registers an arbitrary callback to run during cleanup.
	 *
	 * @param func - Cleanup callback to invoke
	 * @param priority - Cleanup priority (higher values run first)
	 */
	functionJob(func: () => unknown, priority: number = 0) {
		this.getRecords().push([Maid.TaskType.Function, priority, func]);
	}

	/**
	 * Schedules `object.dispose()` to be called during cleanup.
	 *
	 * @param object - Disposable object
	 * @param priority - Cleanup priority (higher values run first)
	 * @returns The same `object` for chaining
	 */
	disposeJob<T extends { dispose: () => void }>(
		object: T,
		priority: number = 0,
	): T {
		this.getRecords().push([Maid.TaskType.Dispose, priority, object]);
		return object;
	}

	/**
	 * Schedules `object.run_dispose()` to be called during cleanup.
	 *
	 * @param object - Object implementing `run_dispose()`
	 * @param priority - Cleanup priority (higher values run first)
	 * @returns The same `object` for chaining
	 */
	runDisposeJob<T extends { run_dispose: () => void }>(
		object: T,
		priority: number = 0,
	): T {
		this.getRecords().push([Maid.TaskType.RunDispose, priority, object]);
		return object;
	}

	/**
	 * Schedules `object.destroy()` to be called during cleanup.
	 *
	 * @param object - Destroyable object (e.g., St/Clutter actor)
	 * @param priority - Cleanup priority (higher values run first)
	 * @returns The same `object` for chaining
	 */
	destroyJob<T extends { destroy: () => void }>(
		object: T,
		priority: number = 0,
	): T {
		this.getRecords().push([Maid.TaskType.Destroy, priority, object]);
		return object;
	}

	/**
	 * Runs all registered cleanup tasks and invalidates this `Maid` instance.
	 */
	destroy() {
		this.clear();
		this.records = null;
	}

	/**
	 * Returns the internal task record array, throwing if already destroyed.
	 *
	 * @returns Array of scheduled task records
	 */
	getRecords(): Maid["records"] {
		if (!this.records) Error("Maid object already destroyed");
		return this.records;
	}

	/**
	 * Monkey-patches a property or method on `patchObject` and restores the original on cleanup.
	 *
	 * @param patchObject - Target object to patch
	 * @param patchName - Property or method name to replace
	 * @param handleFunc - Factory receiving the original value and returning the replacement
	 * @param priority - Cleanup priority (higher values run first)
	 */
	patchJob(
		patchObject: object,
		patchName: string,
		handleFunc: (original: unknown) => unknown,
		priority: number = 0,
	) {
		// Check if patchObject is defined before accessing its properties
		if (!patchObject) {
			console.error("Maid.patchJob: patchObject is undefined");
			return;
		}
		const target = patchObject as Record<string, unknown>;
		const original = target[patchName];
		this.getRecords().push([
			Maid.TaskType.Patch,
			priority,
			target,
			patchName,
			original,
		]);
		target[patchName] = handleFunc(original);
	}

	// [ patchObject, connection, original, undo? ]
	/**
	 * Hides `patchObject`, suppresses subsequent `show` signals, and restores visibility on cleanup.
	 *
	 * @param patchObject - Hideable actor or widget
	 * @param undo - Optional callback to customize visibility restoration on cleanup
	 * @param priority - Cleanup priority (higher values run first)
	 */
	hideJob<T extends HideableObject>(
		patchObject: T,
		undo?: HideUndoCallback<T>,
		priority: number = 0,
	) {
		// Check if patchObject is defined
		if (!patchObject) {
			console.error("Maid.hideJob: patchObject is undefined");
			return;
		}
		const original = patchObject.visible;
		const connection = patchObject.connect("show", (() => {
			patchObject.hide();
		}) as (...args: unknown[]) => never);
		patchObject.hide();
		this.getRecords().push([
			Maid.TaskType.Hide,
			priority,
			patchObject,
			connection,
			original,
			undo as HideUndoCallback<HideableObject> | undefined,
		]);
	}

	/**
	 * Executes all scheduled cleanup tasks in descending priority order and resets the task list.
	 */
	clear() {
		const records = this.getRecords();
		records.sort((a, b) => b[1] - a[1]);
		for (const record of records) {
			switch (record[0]) {
				case Maid.TaskType.Connect:
					record[2].disconnect(record[3]);
					break;
				case Maid.TaskType.Function:
					record[2]();
					break;
				case Maid.TaskType.Dispose:
					record[2].dispose();
					break;
				case Maid.TaskType.RunDispose:
					record[2].run_dispose();
					break;
				case Maid.TaskType.Destroy:
					record[2].destroy();
					break;
				case Maid.TaskType.Patch:
					// Check if patchObject (record[2]) is defined
					if (record[2]) {
						record[2][record[3]] = record[4];
					}
					break;
				case Maid.TaskType.Hide:
					{
						const patchObject = record[2];
						// Check if patchObject is defined before using it
						if (!patchObject) break;

						const original = record[4];
						const undo = record[5];
						patchObject.disconnect(record[3]);
						if (undo) {
							const result = undo(original, patchObject);
							if (result === true) {
								patchObject.show();
							}
						} else {
							if (original) patchObject.show();
						}
					}
					break;
				default:
					throw Error("Unknown task type.");
			}
		}
		this.records = [];
	}
}
namespace Maid {
	/**
	 * Discriminator for cleanup task records stored by `Maid`.
	 */
	export enum TaskType {
		Connect,
		Function,
		Dispose,
		RunDispose,
		Destroy,
		Patch,
		Hide,
	}
	/**
	 * Standard cleanup priority presets (higher values execute earlier).
	 */
	export const Priority = {
		High: 2000,
		Default: 0,
		Low: -2000,
	};
}
export default Maid;
