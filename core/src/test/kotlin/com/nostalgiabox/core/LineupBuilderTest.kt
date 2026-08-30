package com.nostalgiabox.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class LineupBuilderTest {

    @Test
    fun `start times are cumulative in declaration order`() {
        val lineup = LineupBuilder.build(
            channel(id = 3, files = listOf(file("a", 1_000), file("b", 2_500), file("c", 7))),
        )
        assertEquals(3, lineup.channelId)
        assertEquals(listOf(0L, 1_000L, 3_500L), lineup.slots.map { it.startMs })
        assertEquals(listOf("a", "b", "c"), lineup.slots.map { it.fileId })
        assertEquals(listOf(0, 1, 2), lineup.slots.map { it.index })
        assertEquals(3_507L, lineup.totalMs)
        assertTrue(!lineup.isEmpty)
    }

    @Test
    fun `manifest order is the broadcast order`() {
        // Reversing the declared files must reverse the timeline. The manifest is the
        // schedule; nothing here re-sorts it.
        val files = listOf(file("a", 10), file("b", 20), file("c", 30))
        val forward = LineupBuilder.build(channel(files = files))
        val backward = LineupBuilder.build(channel(files = files.reversed()))

        assertEquals(listOf("a", "b", "c"), forward.slots.map { it.fileId })
        assertEquals(listOf("c", "b", "a"), backward.slots.map { it.fileId })
        assertEquals(forward.totalMs, backward.totalMs)
    }

    @Test
    fun `a channel with no files yields an empty timeline rather than throwing`() {
        val lineup = LineupBuilder.build(channel(files = emptyList()))
        assertTrue(lineup.isEmpty)
        assertEquals(0L, lineup.totalMs)
    }

    @Test
    fun `buildAll keys lineups by stable channel id`() {
        val lineups = LineupBuilder.buildAll(
            manifest(channels = listOf(unevenChannel(id = 1), unevenChannel(id = 5))),
        )
        assertEquals(setOf(1, 5), lineups.keys)
        assertEquals(lineups.getValue(1).totalMs, lineups.getValue(5).totalMs)
    }
}
