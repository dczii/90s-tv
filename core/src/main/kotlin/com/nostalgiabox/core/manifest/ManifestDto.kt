package com.nostalgiabox.core.manifest

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Wire representation of manifest schema v1 (ARCHITECTURE.md §5.1).
 *
 * These types exist only at the parse boundary. Everything downstream works on the
 * validated domain model in `com.nostalgiabox.core.model`, so an unvalidated manifest
 * cannot be mistaken for a usable one.
 *
 * Fields have no defaults on purpose: a field the schema declares as required must
 * produce a named error when it is absent, not a silent zero.
 */
@Serializable
data class ManifestDto(
    val version: Int,
    val updatedAt: String,
    val minAppVersion: Int,
    val channels: List<ChannelDto>,
)

@Serializable
data class ChannelDto(
    val id: Int,
    val number: String,
    val name: String,
    val sortOrder: Int,
    val files: List<FileDto>,
    /**
     * Reserved (decision D5). Parsed so a future per-channel schedule lands without a
     * manifest version bump; a non-null value falls back to pure loop behaviour and
     * raises [ManifestWarning.ScheduleIgnored]. There is no scheduling resolver yet.
     */
    val schedule: JsonElement? = null,
)

@Serializable
data class FileDto(
    val url: String,
    @SerialName("sha256") val sha256: String,
    /** Milliseconds, not seconds (amendment A3). Declared duration is authoritative. */
    val durationMs: Long,
    /** Required (amendment A2): the low-space warning cannot wait for Content-Length. */
    val sizeBytes: Long,
    val mimeType: String,
)
