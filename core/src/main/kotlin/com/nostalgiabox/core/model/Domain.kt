package com.nostalgiabox.core.model

/**
 * Download/decode state of a single media file.
 *
 * [UNPLAYABLE] is set by the player, not by the downloader: a file can verify against
 * its sha256 and still fail to decode on a given device (ARCHITECTURE.md §5.2).
 *
 * Only [COMPLETE] files are considered available by the availability projection. The
 * status never influences the timeline — see [Lineup.totalMs].
 */
enum class FileStatus {
    PENDING,
    DOWNLOADING,
    COMPLETE,
    UNPLAYABLE,
    ;

    /** True only for files that may be handed to a player. */
    val isPlayable: Boolean get() = this == COMPLETE
}

/**
 * One declared media file on a channel.
 *
 * [sha256] is the identity: it is the content address used for the on-disk filename
 * (ARCHITECTURE.md §5.3) and the key that update diffing works over (§5.4).
 *
 * [durationMs] is the *declared* duration and it is authoritative for the timeline.
 * The real media file never influences it (amendment A3) — if it did, two boxes with
 * slightly different files would drift apart and the cross-device sync property in §1
 * would be lost.
 */
data class MediaFile(
    val sha256: String,
    val url: String,
    val durationMs: Long,
    val sizeBytes: Long,
    val mimeType: String,
    val status: FileStatus = FileStatus.PENDING,
)

/**
 * A channel as declared by the manifest.
 *
 * [id] is the stable key across manifest versions; [number] is display only.
 * Renumbering a channel must not re-download it (ARCHITECTURE.md §2.8).
 *
 * [schedule] is parsed and reserved but unused in this phase: a non-null value falls
 * back to pure loop behaviour (decision D5). Reserving the field now means per-channel
 * schedules land later without a manifest version bump.
 */
data class Channel(
    val id: Int,
    val number: String,
    val name: String,
    val sortOrder: Int,
    val files: List<MediaFile>,
    val schedule: String? = null,
)

/** A validated manifest. Only ever produced whole, never half-applied. */
data class Manifest(
    val version: Int,
    val updatedAt: String,
    val minAppVersion: Int,
    val channels: List<Channel>,
)

/**
 * One file's placement on a channel's timeline.
 *
 * [startMs] is the cumulative offset from the channel origin, which is Unix epoch 0.
 * Anchoring there is what makes two correctly-clocked boxes show the same frame.
 */
data class Slot(
    val index: Int,
    val fileId: String,
    val startMs: Long,
    val durationMs: Long,
) {
    /** Exclusive end of this slot on the channel timeline. */
    val endMs: Long get() = startMs + durationMs
}

/**
 * A channel's complete timeline, built from every file the manifest declares.
 *
 * [totalMs] is the sum of *declared* durations over *all* files — downloaded or not,
 * playable or not (amendment A1). An unavailable file is a hole the projector skips,
 * never a slot the builder omits. If availability changed [totalMs], the divisor would
 * change on every completed download and the whole channel would re-phase.
 */
data class Lineup(
    val channelId: Int,
    val slots: List<Slot>,
    val totalMs: Long,
) {
    val isEmpty: Boolean get() = slots.isEmpty()
}

/**
 * Where the wall clock says the channel is, ignoring availability entirely.
 *
 * Produced by `TuneInResolver.resolve`. Pure, manifest-derived and stable: the same
 * `now` against the same manifest yields the same [IdealSlot] on every device forever.
 */
data class IdealSlot(val index: Int, val offsetMs: Long)

/**
 * What can actually be put on screen right now.
 *
 * Produced by `AvailabilityProjector.project` — a separate, later step. [onClock] is
 * false when the ideal slot's file was missing and we fell forward to a later one; the
 * player is then knowingly off the broadcast clock and re-syncs at the next boundary
 * where the ideal slot *is* available (ARCHITECTURE.md §6.5).
 */
data class PlayableSlot(
    val index: Int,
    val offsetMs: Long,
    val fileId: String,
    val onClock: Boolean,
)
