package com.nostalgiabox.core

import com.nostalgiabox.core.model.IdealSlot
import com.nostalgiabox.core.model.Lineup
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The second, separate step. Everything here is about holes in the picture; nothing
 * here is allowed to change where the clock says we are.
 */
class AvailabilityProjectorTest {

    private val lineup = LineupBuilder.build(unevenChannel())
    private val allIds = lineup.slots.map { it.fileId }.toSet()

    @Test
    fun `a downloaded ideal slot plays at its true broadcast offset`() {
        val ideal = TuneInResolver.resolve(lineup, 700_000L)
        val playable = assertNotNull(AvailabilityProjector.project(lineup, ideal, allIds))

        assertEquals(ideal.index, playable.index)
        assertEquals(ideal.offsetMs, playable.offsetMs)
        assertEquals(lineup.slots[ideal.index].fileId, playable.fileId)
        assertTrue(playable.onClock, "a fully provisioned channel is always on the clock")
    }

    @Test
    fun `a missing file is skipped forward and marked off clock`() {
        val ideal = IdealSlot(index = 1, offsetMs = 500L)
        val playable = assertNotNull(AvailabilityProjector.project(lineup, ideal, setOf("c", "e")))

        assertEquals(2, playable.index, "should fall forward to the next available slot")
        assertEquals("c", playable.fileId)
        assertEquals(0L, playable.offsetMs, "a skipped-to slot starts from the beginning")
        assertTrue(!playable.onClock, "we are knowingly off the broadcast clock here")
    }

    @Test
    fun `the skip wraps around the end of the channel`() {
        val ideal = IdealSlot(index = 4, offsetMs = 10L)
        val playable = assertNotNull(AvailabilityProjector.project(lineup, ideal, setOf("b")))

        assertEquals(1, playable.index, "skip should wrap past the last slot back to the front")
        assertEquals("b", playable.fileId)
        assertEquals(0L, playable.offsetMs)
        assertTrue(!playable.onClock)
    }

    @Test
    fun `the skip always finds the nearest available slot going forward`() {
        val random = seededRandom(seed = 5150)
        repeat(2_000) {
            val available = allIds.filter { random.nextBoolean() }.toSet()
            val ideal = IdealSlot(index = random.nextInt(lineup.slots.size), offsetMs = 0L)
            val playable = AvailabilityProjector.project(lineup, ideal, available)

            if (available.isEmpty()) {
                assertNull(playable, "nothing available must be no signal, not a guess")
                return@repeat
            }

            val chosen = assertNotNull(playable)
            assertTrue(chosen.fileId in available, "projected an unavailable file")

            val distance = Math.floorMod(chosen.index - ideal.index, lineup.slots.size)
            for (step in 0 until distance) {
                val skipped = lineup.slots[Math.floorMod(ideal.index + step, lineup.slots.size)]
                assertTrue(
                    skipped.fileId !in available,
                    "skipped over slot ${skipped.index}, which was available",
                )
            }
            assertEquals(distance == 0, chosen.onClock, "onClock must mean exactly 'did not skip'")
        }
    }

    @Test
    fun `a channel with nothing downloaded is no signal`() {
        val ideal = TuneInResolver.resolve(lineup, 12_345L)
        assertNull(AvailabilityProjector.project(lineup, ideal, emptySet()))
        assertNull(AvailabilityProjector.project(lineup, ideal, setOf("not-on-this-channel")))
    }

    @Test
    fun `a single file channel is either on the clock or no signal`() {
        val single = LineupBuilder.build(channel(files = listOf(file("only", 5_000L))))
        val ideal = TuneInResolver.resolve(single, 1_234L)

        val playing = assertNotNull(AvailabilityProjector.project(single, ideal, setOf("only")))
        assertTrue(playing.onClock)
        assertEquals(1_234L, playing.offsetMs)

        // One slot, unavailable: there is nowhere to skip to, so there is no picture.
        assertNull(AvailabilityProjector.project(single, ideal, emptySet()))
    }

    @Test
    fun `an empty lineup is no signal, not a crash`() {
        val empty = Lineup(channelId = 7, slots = emptyList(), totalMs = 0L)
        assertNull(AvailabilityProjector.project(empty, IdealSlot(0, 0L), setOf("a")))
    }

    @Test
    fun `an ideal slot from a different channel is a programming error`() {
        val failure = assertFailsWith<IllegalArgumentException> {
            AvailabilityProjector.project(lineup, IdealSlot(index = 99, offsetMs = 0L), allIds)
        }
        assertTrue(failure.message!!.contains("99"))
        assertFailsWith<IllegalArgumentException> {
            AvailabilityProjector.project(lineup, IdealSlot(index = -1, offsetMs = 0L), allIds)
        }
    }
}
