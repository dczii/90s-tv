package com.nostalgiabox.core

import com.nostalgiabox.core.model.Channel
import com.nostalgiabox.core.model.Lineup
import com.nostalgiabox.core.model.Manifest
import com.nostalgiabox.core.model.Slot

/**
 * Turns a declared channel into a timeline.
 *
 * Amendment A1, restated as code: the lineup is built from *every file the manifest
 * declares*, in declaration order, whatever their download status. Nothing in this
 * file may consult [com.nostalgiabox.core.model.FileStatus] or an availability set.
 * If it did, the divisor would change every time a download finished, the channel
 * would re-phase, and two boxes would stop agreeing on what is on screen.
 */
object LineupBuilder {

    /** Builds the timeline for one channel. Slot [Slot.startMs] values are cumulative. */
    fun build(channel: Channel): Lineup {
        var cursor = 0L
        val slots = ArrayList<Slot>(channel.files.size)
        channel.files.forEachIndexed { index, file ->
            slots += Slot(
                index = index,
                fileId = file.sha256,
                startMs = cursor,
                durationMs = file.durationMs,
            )
            cursor += file.durationMs
        }
        return Lineup(channelId = channel.id, slots = slots, totalMs = cursor)
    }

    /** Builds every channel's timeline, keyed by stable channel id. */
    fun buildAll(manifest: Manifest): Map<Int, Lineup> =
        manifest.channels.associate { it.id to build(it) }
}
