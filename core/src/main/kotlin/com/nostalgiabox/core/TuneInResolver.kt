package com.nostalgiabox.core

import com.nostalgiabox.core.model.IdealSlot
import com.nostalgiabox.core.model.Lineup

/**
 * The broadcast clock itself: where a channel is at a given instant.
 *
 * This function knows nothing about downloads, availability or playability, and it
 * must stay that way. Fusing it with [AvailabilityProjector.project] is amendment A1's
 * failure mode.
 */
object TuneInResolver {

    /**
     * Resolves the ideal position on [lineup] at [nowEpochMs].
     *
     * Pure: same manifest and same instant give the same answer on every device, for
     * all time. The cycle is anchored at Unix epoch 0, which is what makes two boxes
     * in one house show the same frame with no coordination.
     *
     * @throws IllegalArgumentException if the lineup has no duration to resolve
     *   against — an empty channel has no timeline, and is caught by validation long
     *   before it gets here.
     */
    fun resolve(lineup: Lineup, nowEpochMs: Long): IdealSlot {
        require(lineup.totalMs > 0L) {
            "Cannot resolve against an empty lineup (channel ${lineup.channelId})"
        }

        // floorMod, not %. A device whose clock has not yet been set by NTP can report
        // a pre-1970 instant; `%` would hand back a negative index and crash tune-in.
        val cycle = Math.floorMod(nowEpochMs, lineup.totalMs)

        // Binary search, not a linear scan: this runs on every drift tick (§6.3), not
        // just on channel change.
        val hit = lineup.slots.binarySearch { it.startMs.compareTo(cycle) }
        // An exact hit is a slot boundary. Otherwise binarySearch returns
        // -(insertionPoint) - 1, and the slot we want is the one before that point.
        // Slot 0 always starts at 0 and cycle >= 0, so this is never negative.
        val index = if (hit >= 0) hit else -hit - 2

        return IdealSlot(index = index, offsetMs = cycle - lineup.slots[index].startMs)
    }
}
