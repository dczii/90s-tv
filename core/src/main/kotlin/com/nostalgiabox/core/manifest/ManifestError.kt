package com.nostalgiabox.core.manifest

/**
 * Why a manifest was rejected.
 *
 * Every failure is named. A manifest that fails any check is rejected *whole* — we
 * never half-apply one, and the previous good manifest keeps serving
 * (ARCHITECTURE.md §5.1).
 */
sealed class ManifestError {
    /** Operator-facing description; this is what reaches the settings-screen log. */
    abstract val message: String

    /** The bytes were not valid JSON, or a field had the wrong type. */
    data class Malformed(val reason: String) : ManifestError() {
        override val message: String get() = "Manifest is not valid JSON: $reason"
    }

    /** A field the schema requires was absent. */
    data class MissingRequiredField(val fields: List<String>) : ManifestError() {
        override val message: String
            get() = "Manifest is missing required field(s): ${fields.joinToString()}"
    }

    /** A manifest with no channels is a box with no dial. */
    data object EmptyChannelList : ManifestError() {
        override val message: String get() = "Manifest declares no channels"
    }

    /** A channel with no files has no timeline to resolve against. */
    data class EmptyFileList(val channelId: Int) : ManifestError() {
        override val message: String get() = "Channel $channelId declares no files"
    }

    /** Zero or negative duration would collapse or invert the timeline. */
    data class NonPositiveDuration(
        val channelId: Int,
        val sha256: String,
        val durationMs: Long,
    ) : ManifestError() {
        override val message: String
            get() = "Channel $channelId file $sha256 has non-positive durationMs $durationMs"
    }

    /** Negative size makes the pre-download space check meaningless. */
    data class NonPositiveSize(
        val channelId: Int,
        val sha256: String,
        val sizeBytes: Long,
    ) : ManifestError() {
        override val message: String
            get() = "Channel $channelId file $sha256 has non-positive sizeBytes $sizeBytes"
    }

    /** `id` is the stable key across manifest versions; duplicates destroy that. */
    data class DuplicateChannelId(val channelId: Int) : ManifestError() {
        override val message: String get() = "Duplicate channel id $channelId"
    }

    /**
     * Content-addressed storage means one hash is one file on disk. The same hash
     * twice in a channel would be one file claiming two slots on the timeline.
     */
    data class DuplicateFileHash(val channelId: Int, val sha256: String) : ManifestError() {
        override val message: String get() = "Channel $channelId declares sha256 $sha256 twice"
    }

    /** A required string was present but empty. */
    data class BlankField(val path: String) : ManifestError() {
        override val message: String get() = "Required field is blank: $path"
    }
}

/**
 * A manifest is usable, but something in it was ignored.
 *
 * `:core` has no logger: it is pure Kotlin/JVM with no platform APIs and no I/O, so
 * warnings come back to the caller, which owns the ring-buffer log (ARCHITECTURE.md §9).
 */
sealed class ManifestWarning {
    abstract val message: String

    /** D5: schedules are parsed and reserved, never resolved, in this version. */
    data class ScheduleIgnored(val channelId: Int) : ManifestWarning() {
        override val message: String
            get() = "Channel $channelId declares a schedule; falling back to loop playback"
    }
}

/** All-or-nothing outcome of parsing or validating a manifest. */
sealed interface ManifestResult {
    data class Success(
        val manifest: com.nostalgiabox.core.model.Manifest,
        val warnings: List<ManifestWarning> = emptyList(),
    ) : ManifestResult

    data class Failure(val error: ManifestError) : ManifestResult
}
