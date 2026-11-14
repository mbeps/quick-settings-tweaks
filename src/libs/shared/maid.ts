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

class Maid {
	private records: TaskRecord[];

	constructor() {
		this.records = [];
	}

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

	functionJob(func: () => unknown, priority: number = 0) {
		this.getRecords().push([Maid.TaskType.Function, priority, func]);
	}

	disposeJob<T extends { dispose: () => void }>(
		object: T,
		priority: number = 0,
	): T {
		this.getRecords().push([Maid.TaskType.Dispose, priority, object]);
		return object;
	}

	runDisposeJob<T extends { run_dispose: () => void }>(
		object: T,
		priority: number = 0,
	): T {
		this.getRecords().push([Maid.TaskType.RunDispose, priority, object]);
		return object;
	}

	destroyJob<T extends { destroy: () => void }>(
		object: T,
		priority: number = 0,
	): T {
		this.getRecords().push([Maid.TaskType.Destroy, priority, object]);
		return object;
	}

	destroy() {
		this.clear();
		this.records = null;
	}

	getRecords(): Maid["records"] {
		if (!this.records) Error("Maid object already destroyed");
		return this.records;
	}

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
	export enum TaskType {
		Connect,
		Function,
		Dispose,
		RunDispose,
		Destroy,
		Patch,
		Hide,
	}
	export const Priority = {
		High: 2000,
		Default: 0,
		Low: -2000,
	};
}
export default Maid;
