/**
 * Build-time configuration and metadata constants for the extension.
 * Populated during build/packaging or left at defaults when running from source.
 */
export default {
	/** Whether the extension was built in development mode. */
	isDevelopmentBuild: false,
	/** Whether the extension was built as a release package. */
	isReleaseBuild: false,
	/** Whether the extension was built from a GitHub release workflow. */
	isGithubBuild: false,
	/** Extension version string, or "unknown" if unpopulated. */
	version: "unknown",
	/** Numeric build identifier. */
	buildNumber: 0,
	/** Prefix used when registering custom GObject type names. */
	baseGTypeName: "quick-settings-tweaks_",
	/** Prefix prepended to all extension log messages. */
	loggerPrefix: "[quick-settings-tweaks]",
};
