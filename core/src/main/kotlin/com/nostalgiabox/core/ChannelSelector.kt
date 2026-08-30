package com.nostalgiabox.core

import com.nostalgiabox.core.model.Channel

/**
 * Turning the dial (FR5, FR6).
 *
 * Channels are held in display order — [Channel.sortOrder], then [Channel.id] as a
 * stable tiebreak — and every movement wraps. There is no "end of the dial"; an
 * antenna set had none either.
 *
 * Selection is pure. Switching channels does not touch the clock: the caller re-asks
 * `TuneInResolver.resolve` for the new channel's lineup, which is all FR6 is.
 */
class ChannelSelector(channels: List<Channel>) {

    /** The dial, in display order. */
    val channels: List<Channel> = channels.sortedWith(compareBy({ it.sortOrder }, { it.id }))

    private val byId: Map<Int, Int> = this.channels.withIndex().associate { (i, c) -> c.id to i }
    private val byNumber: Map<String, Channel> =
        this.channels.associateBy { normalizeNumber(it.number) }

    init {
        require(this.channels.isNotEmpty()) { "A dial with no channels cannot be tuned" }
    }

    /** The channel the box starts on when nothing was last watched (FR1). */
    val firstChannel: Channel get() = channels.first()

    /** Looks up by stable id. Null if this manifest no longer declares it. */
    fun byId(id: Int): Channel? = byId[id]?.let { channels[it] }

    /**
     * Direct tune by the number on the remote (`"3"` and `"03"` are the same channel).
     * Null if no such channel — the caller should stay where it is rather than guess.
     */
    fun byNumber(number: String): Channel? = byNumber[normalizeNumber(number)]

    /**
     * Next channel down the dial, wrapping past the last back to the first.
     * An unknown [currentId] — the last-watched channel was removed by an update —
     * lands on the first channel rather than throwing.
     */
    fun next(currentId: Int): Channel = step(currentId, +1)

    /** Previous channel up the dial, wrapping past the first back to the last. */
    fun previous(currentId: Int): Channel = step(currentId, -1)

    private fun step(currentId: Int, delta: Int): Channel {
        val current = byId[currentId] ?: return firstChannel
        return channels[Math.floorMod(current + delta, channels.size)]
    }

    private companion object {
        /** `"03"`, `"3"` and `" 3 "` are all channel three. */
        fun normalizeNumber(raw: String): String {
            val trimmed = raw.trim()
            val stripped = trimmed.trimStart('0')
            return stripped.ifEmpty { if (trimmed.isEmpty()) trimmed else "0" }
        }
    }
}
