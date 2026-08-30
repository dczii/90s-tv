package com.nostalgiabox.core

import com.nostalgiabox.core.model.Manifest
import com.nostalgiabox.core.model.MediaFile

/** One file, plus the channel that declares it — the channel id is its storage path. */
data class ManifestFileRef(val channelId: Int, val file: MediaFile) {
    val sha256: String get() = file.sha256
}

/**
 * What an update changes, as a set difference over content hashes.
 *
 * [orphans] must not be deleted until their replacements are `COMPLETE`, so a failed
 * update never leaves a channel emptier than it started (ARCHITECTURE.md §5.4).
 */
data class ManifestDiff(
    val additions: List<ManifestFileRef>,
    val orphans: List<ManifestFileRef>,
    val unchanged: List<ManifestFileRef>,
) {
    val hasChanges: Boolean get() = additions.isNotEmpty() || orphans.isNotEmpty()

    /** Bytes the update will pull down — for the §8 free-space check before enqueueing. */
    val bytesToDownload: Long get() = additions.sumOf { it.file.sizeBytes }
}

/**
 * Diffs two manifests by `sha256`, for the P3 update flow.
 *
 * Content addressing is what makes this a set difference rather than a merge: a file
 * changed at the same URL has a different hash, so it is simultaneously an addition
 * and an orphan, and there is no stale-cache case to reason about.
 */
object ManifestDiffer {

    /** [old] is null on first run, where every declared file is an addition. */
    fun diff(old: Manifest?, new: Manifest): ManifestDiff {
        val oldFiles = refsByHash(old)
        val newFiles = refsByHash(new)

        val additions = newFiles.filterKeys { it !in oldFiles }.values.toList()
        val orphans = oldFiles.filterKeys { it !in newFiles }.values.toList()
        val unchanged = newFiles.filterKeys { it in oldFiles }.values.toList()

        return ManifestDiff(additions = additions, orphans = orphans, unchanged = unchanged)
    }

    /**
     * Hash -> first declaring channel, preserving manifest order.
     *
     * A hash declared by two channels keeps its first reference: the file only needs
     * downloading once. P3 owns the (cheap) copy or link into the second channel's
     * directory.
     */
    private fun refsByHash(manifest: Manifest?): Map<String, ManifestFileRef> {
        val out = LinkedHashMap<String, ManifestFileRef>()
        manifest?.channels?.forEach { channel ->
            channel.files.forEach { file ->
                out.putIfAbsent(file.sha256, ManifestFileRef(channel.id, file))
            }
        }
        return out
    }
}
