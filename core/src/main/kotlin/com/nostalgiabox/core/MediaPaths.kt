package com.nostalgiabox.core

import com.nostalgiabox.core.model.Channel
import com.nostalgiabox.core.model.Manifest
import com.nostalgiabox.core.model.MediaFile

/**
 * Where a file lives on disk, as a pure function of its content address.
 *
 * ## The decision this file records
 *
 * ARCHITECTURE.md §5.3 puts media under `channels/<channelId>/<sha256>.mp4`, while
 * §5.4 diffs updates by `sha256` alone. Those two disagree the moment one hash is
 * declared by two channels, or moves between channels on an update: the diff sees one
 * file to fetch, the layout wants two copies of it, and P3 is left inventing a
 * copy-or-link rule under deadline.
 *
 * **Storage is therefore globally content-addressed: one hash is exactly one file,
 * at `media/<sha256>.<ext>`, whatever set of channels declares it.** The per-channel
 * directory is dropped.
 *
 * This is the smaller change of the two available. §5.3's own stated rationale for
 * content addressing — "a file changed at the same URL is a different name, so there
 * is no stale-cache case to reason about" — is fully served without the directory,
 * and the directory is the only thing that reintroduces duplicate state. Deduplication
 * across channels comes free, and the update flow's "delete orphans only after their
 * replacements are COMPLETE" (§5.4) becomes a plain set difference over hashes with no
 * per-channel bookkeeping to get wrong.
 *
 * What this costs: per-channel storage footprint (§5.3, surfaced in P5's settings) can
 * no longer be a directory size. It is the sum of `sizeBytes` over the channel's
 * complete files — see [footprintBytes] — and a file shared by two channels counts
 * against both. That is the honest reading of "what this channel needs on disk", and
 * it is what the setup progress screen (§10.1) already displays per channel anyway.
 *
 * Paths are returned relative. `:core` has no notion of `getExternalFilesDir()` and
 * must not acquire one; `:app` joins these onto its own base directory.
 */
object MediaPaths {

    /** Single directory holding every downloaded file, keyed by content address. */
    const val MEDIA_DIR: String = "media"

    /** Suffix for an in-flight download. Renamed onto the target atomically (§5.5). */
    const val PARTIAL_SUFFIX: String = ".part"

    /**
     * Container extensions we may be handed. The transcode pipeline (§8) normalises
     * everything to H.264 in MP4, so `video/mp4` is the realistic case; the others are
     * here so a hand-built manifest degrades to something sane rather than to `.mp4`
     * on a file that is not one. Extensions are cosmetic to us but some players sniff
     * the container from them, which is reason enough not to lie.
     */
    private val extensionsByMimeType: Map<String, String> = mapOf(
        "video/mp4" to "mp4",
        "video/webm" to "webm",
        "video/x-matroska" to "mkv",
        "video/quicktime" to "mov",
    )

    private const val DEFAULT_EXTENSION = "mp4"

    /** Extension for [mimeType], falling back to `mp4` for anything unrecognised. */
    fun extensionFor(mimeType: String): String =
        extensionsByMimeType[mimeType.substringBefore(';').trim().lowercase()] ?: DEFAULT_EXTENSION

    /** Relative path of the completed download for [file]. */
    fun relativePath(file: MediaFile): String = relativePath(file.sha256, file.mimeType)

    /** Relative path of the completed download for a content address and container. */
    fun relativePath(sha256: String, mimeType: String): String =
        "$MEDIA_DIR/$sha256.${extensionFor(mimeType)}"

    /** Relative path of the partial download for [file], before the atomic rename. */
    fun partialPath(file: MediaFile): String = relativePath(file) + PARTIAL_SUFFIX

    /** Relative path of the partial download for a content address and container. */
    fun partialPath(sha256: String, mimeType: String): String =
        relativePath(sha256, mimeType) + PARTIAL_SUFFIX

    /**
     * Every relative path [manifest] declares, deduplicated by content address.
     *
     * This is the set P3 reconciles against the directory listing: anything on disk
     * and not in here is an orphan.
     */
    fun declaredPaths(manifest: Manifest): Set<String> =
        manifest.channels.flatMapTo(mutableSetOf()) { channel ->
            channel.files.map { relativePath(it) }
        }

    /**
     * Bytes [channel] needs on disk, counting only files that are [MediaFile.status]
     * complete when [completeOnly] is true.
     *
     * A file shared with another channel is counted against both; see the class note.
     */
    fun footprintBytes(channel: Channel, completeOnly: Boolean = true): Long =
        channel.files
            .filter { !completeOnly || it.status.isPlayable }
            .sumOf { it.sizeBytes }
}
