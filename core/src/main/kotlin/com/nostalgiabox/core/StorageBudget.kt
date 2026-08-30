package com.nostalgiabox.core

import com.nostalgiabox.core.model.Channel
import com.nostalgiabox.core.model.Manifest

/**
 * The pre-download space check from ARCHITECTURE.md §5.5, minus the platform call.
 *
 * §5.5 requires comparing free space against `sum(sizeBytes) * 1.1` *before* enqueueing
 * anything — this is the whole reason `sizeBytes` is a required field (amendment A2):
 * `Content-Length` only arrives once a request is in flight, which is already too late
 * to warn. The 1.1 belongs in one place rather than being retyped at each call site,
 * and `StatFs` stays on the `:app` side of the boundary.
 */
object StorageBudget {

    /**
     * The §5.5 headroom, as a percentage. Covers filesystem overhead and the `.part`
     * file that exists alongside the target until the atomic rename.
     *
     * Integer percent rather than a `1.1` multiplier, and the arithmetic below is
     * integer too, because `100 * 1.1` is `110.00000000000001` in binary floating
     * point — `ceil` of which is 111. A space check that overstates its requirement by
     * a byte for most inputs is a space check nobody can write an exact test for.
     */
    const val HEADROOM_PERCENT: Int = 10

    /** [bytes] plus the §5.5 headroom, rounded up. Exact: no floating point involved. */
    fun requiredBytes(bytes: Long): Long {
        require(bytes >= 0L) { "bytes must not be negative: $bytes" }
        val scale = 100L + HEADROOM_PERCENT
        // multiplyExact so an absurd manifest throws instead of silently wrapping
        // negative and reporting that there is plenty of room.
        return ceilDiv(Math.multiplyExact(bytes, scale), 100L)
    }

    private fun ceilDiv(numerator: Long, denominator: Long): Long =
        (numerator + denominator - 1L) / denominator

    /** Bytes still to fetch for [diff], with headroom. */
    fun requiredBytes(diff: ManifestDiff): Long = requiredBytes(diff.bytesToDownload)

    /** Bytes a full provisioning of [manifest] needs, with headroom. */
    fun requiredBytes(manifest: Manifest): Long =
        requiredBytes(manifest.channels.sumOf { channel -> channel.files.sumOf { it.sizeBytes } })

    /** Bytes [channel] needs to provision in full, with headroom. */
    fun requiredBytes(channel: Channel): Long =
        requiredBytes(channel.files.sumOf { it.sizeBytes })

    /**
     * Whether [freeBytes] covers [bytes] plus headroom.
     *
     * False is the §8 low-space warning: surface it and do not enqueue.
     */
    fun hasRoomFor(freeBytes: Long, bytes: Long): Boolean = freeBytes >= requiredBytes(bytes)
}
