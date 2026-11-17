/**
 * Logs an informational message with the configured header prefix.
 * Accepts a string or a lazy factory function to avoid formatting overhead when info logging is disabled.
 *
 * @param str - Message string or factory returning the message
 */
function Logger(str: string | (() => string)) {
	if (str instanceof Function) str = str();
	if (Logger.show_info) console.log(Logger.LOG_INFO_HEADER + str);
}
namespace Logger {
	export let LOG_HEADER_PREFIX: string = "";
	export let LOG_INFO_HEADER: string = "";
	export let LOG_DEBUG_HEADER: string = "";
	export let LOG_ERROR_HEADER: string = "";
	export let show_info: boolean = true;

	/**
	 * Sets the prefix header for all log levels.
	 * Call once during extension initialization to tag output with the extension name.
	 *
	 * @param header - Prefix string prepended to every log line
	 */
	export function setHeader(header: string) {
		LOG_HEADER_PREFIX = header;
		LOG_INFO_HEADER = `${header} (info) `;
		LOG_DEBUG_HEADER = `${header} (debug) `;
		LOG_ERROR_HEADER = `${header} (error) `;
	}

	/**
	 * Severity levels controlling which log messages are emitted.
	 */
	export enum LogLevel {
		none = -1,
		error = 0,
		info = 1,
		debug = 2,
	}

	const void_function = (() => {}) as (str: string) => void;
	/**
	 * Logs a debug message when the current log level is `LogLevel.debug` or higher.
	 */
	export let debug: (str: string | (() => string)) => void;
	function debug_internal(str: string | (() => string)) {
		if (str instanceof Function) str = str();
		console.log(LOG_DEBUG_HEADER + str);
	}
	/**
	 * Logs an error message with a stack trace when the current log level is `LogLevel.error` or higher.
	 */
	export let error: (str: string | (() => string)) => void;
	function error_internal(str: string | (() => string)) {
		if (str instanceof Function) str = str();
		console.log(`${LOG_ERROR_HEADER}${str}\n${new Error().stack}`);
	}

	export let currentLevel: number;

	/**
	 * Configures the active log level and binds level-specific logging functions.
	 * Messages below the configured level become no-ops.
	 *
	 * @param level - Minimum `LogLevel` to emit
	 */
	export function setLogLevel(level: number) {
		debug = level >= LogLevel.debug ? debug_internal : void_function;
		error = level >= LogLevel.error ? error_internal : void_function;
		show_info = level >= LogLevel.info;
		currentLevel = level;
	}
}
export default Logger;
