package com.nostalgiabox.core

import com.nostalgiabox.core.model.IdealSlot
import com.nostalgiabox.core.model.Lineup
import com.nostalgiabox.core.model.PlayableSlot

/**
 * The second, separate step: what can actually be shown right now.
 *
 * A missing file is a hole we skip over, not a slot we delete. This is the only place
 * availability is allowed to matter — the timeline it projects onto was built without
 * any knowledge of it.
 */
object AvailabilityProjector {

    /**
     * Projects [ideal] onto what is on disk.
     *
     * If the ideal slot's file is available, the result is that slot at its true
     * broadcast offset and [PlayableSlot.onClock] is true. If it is not, we fall
     * forward — wrapping — to the next available slot and start it from zero, with
     * [PlayableSlot.onClock] false: the player is knowingly off the broadcast clock
     * and will re-sync at the next boundary where the ideal slot is available.
     *
     * @param availableIds sha256s of files that are on disk and playable.
     * @return null when nothing on the channel can be played — the "no signal" state.
     *   We stay there rather than auto-advancing to another channel; choosing content
     *   for the user is the one thing this product does not do (ARCHITECTURE.md §6.5).
     */
    fun project(lineup: Lineup, ideal: IdealSlot, availableIds: Set<String>): PlayableSlot? {
        val slots = lineup.slots
        if (slots.isEmpty()) return null
        require(ideal.index in slots.indices) {
            "IdealSlot index ${ideal.index} is not a slot of channel ${lineup.channelId}"
        }

        val onClockSlot = slots[ideal.index]
        if (onClockSlot.fileId in availableIds) {
            return PlayableSlot(
                index = onClockSlot.index,
                offsetMs = ideal.offsetMs,
                fileId = onClockSlot.fileId,
                onClock = true,
            )
        }

        for (step in 1 until slots.size) {
            val candidate = slots[Math.floorMod(ideal.index + step, slots.size)]
            if (candidate.fileId in availableIds) {
                return PlayableSlot(
                    index = candidate.index,
                    offsetMs = 0L,
                    fileId = candidate.fileId,
                    onClock = false,
                )
            }
        }
        return null
    }
}
