package com.nostalgiabox.core

import com.nostalgiabox.core.model.IdealSlot
import com.nostalgiabox.core.model.Lineup
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * The broadcast clock's own tests. These are properties over many instants, not one
 * example apiece: an off-by-one here is invisible in a single case and shows up on a
 * customer's TV three weeks later.
 */
class TuneInResolverTest {

    private val lineup = LineupBuilder.build(unevenChannel())

    @Test
    fun `resolved slot always contains the cycle position`() {
        val random = seededRandom()
        val clock = FakeClock()
        repeat(20_000) {
            clock.nowMs = random.nextLong(-4L * 365 * 86_400_000L, 4L * 365 * 86_400_000L)
            val ideal = TuneInResolver.resolve(lineup, clock.nowEpochMs())
            val slot = lineup.slots[ideal.index]
            val cycle = Math.floorMod(clock.nowEpochMs(), lineup.totalMs)

            assertTrue(
                slot.startMs <= cycle && cycle < slot.endMs,
                "now=${clock.nowEpochMs()} cycle=$cycle fell outside slot ${slot.index} " +
                    "[${slot.startMs}, ${slot.endMs})",
            )
            assertEquals(cycle - slot.startMs, ideal.offsetMs)
            assertTrue(ideal.offsetMs in 0 until slot.durationMs)
        }
    }

    @Test
    fun `slots tile the whole cycle with no gap and no overlap`() {
        var expectedStart = 0L
        lineup.slots.forEachIndexed { index, slot ->
            assertEquals(index, slot.index)
            assertEquals(expectedStart, slot.startMs, "gap or overlap before slot $index")
            expectedStart = slot.endMs
        }
        assertEquals(lineup.totalMs, expectedStart)

        // And exhaustively: every millisecond of a short cycle maps to exactly one slot.
        val tiny = LineupBuilder.build(
            channel(files = listOf(file("a", 3), file("b", 1), file("c", 5))),
        )
        val covered = IntArray(tiny.totalMs.toInt()) { -1 }
        for (t in 0 until tiny.totalMs) {
            val ideal = TuneInResolver.resolve(tiny, t)
            assertEquals(-1, covered[t.toInt()], "ms $t resolved twice")
            covered[t.toInt()] = ideal.index
        }
        assertTrue(covered.none { it == -1 }, "a millisecond in [0, totalMs) resolved to nothing")
        assertEquals(listOf(0, 0, 0, 1, 2, 2, 2, 2, 2), covered.toList())
    }

    @Test
    fun `resolve is periodic in totalMs`() {
        val random = seededRandom(seed = 1997)
        repeat(5_000) {
            val t = random.nextLong(-2_000_000_000L, 2_000_000_000L)
            assertEquals(
                TuneInResolver.resolve(lineup, t),
                TuneInResolver.resolve(lineup, t + lineup.totalMs),
                "phase moved across one full cycle at t=$t",
            )
            assertEquals(
                TuneInResolver.resolve(lineup, t),
                TuneInResolver.resolve(lineup, t + lineup.totalMs * 1_000L),
                "phase moved across a thousand cycles at t=$t",
            )
        }
    }

    @Test
    fun `the end of the last slot wraps to slot zero offset zero`() {
        assertEquals(IdealSlot(0, 0L), TuneInResolver.resolve(lineup, lineup.totalMs))
        assertEquals(IdealSlot(0, 0L), TuneInResolver.resolve(lineup, 0L))

        val last = lineup.slots.last()
        assertEquals(
            IdealSlot(last.index, last.durationMs - 1),
            TuneInResolver.resolve(lineup, lineup.totalMs - 1),
        )
    }

    @Test
    fun `every slot boundary resolves to the start of that slot`() {
        lineup.slots.forEach { slot ->
            assertEquals(
                IdealSlot(slot.index, 0L),
                TuneInResolver.resolve(lineup, slot.startMs),
                "boundary of slot ${slot.index} did not land on its own start",
            )
            assertEquals(
                IdealSlot(slot.index, slot.durationMs - 1),
                TuneInResolver.resolve(lineup, slot.endMs - 1),
                "last millisecond of slot ${slot.index} leaked into the next slot",
            )
        }
    }

    @Test
    fun `now at exactly zero is the origin of every channel`() {
        assertEquals(IdealSlot(0, 0L), TuneInResolver.resolve(lineup, 0L))
        assertEquals(
            IdealSlot(0, 0L),
            TuneInResolver.resolve(LineupBuilder.build(unevenChannel(id = 4)), 0L),
        )
    }

    @Test
    fun `a pre-1970 clock resolves forwards, never to a negative index`() {
        // This is the floorMod-not-percent test. `%` returns a negative remainder here
        // and the binary search would hand back index -1.
        val random = seededRandom(seed = 1969)
        repeat(5_000) {
            val t = -random.nextLong(1L, 50L * 365 * 86_400_000L)
            val ideal = TuneInResolver.resolve(lineup, t)
            assertTrue(ideal.index in lineup.slots.indices, "negative now produced index ${ideal.index}")
            assertTrue(ideal.offsetMs >= 0, "negative now produced offset ${ideal.offsetMs}")
        }

        // One worked example, so the intent survives a refactor of the generator above.
        assertEquals(
            TuneInResolver.resolve(lineup, lineup.totalMs - 1),
            TuneInResolver.resolve(lineup, -1L),
        )
        assertEquals(IdealSlot(0, 0L), TuneInResolver.resolve(lineup, -lineup.totalMs))
    }

    @Test
    fun `a single file channel is always slot zero`() {
        val single = LineupBuilder.build(channel(files = listOf(file("only", 5_000L))))
        assertEquals(5_000L, single.totalMs)
        listOf(0L, 1L, 4_999L, 5_000L, 12_345L, -1L, -5_000L, Long.MAX_VALUE, Long.MIN_VALUE)
            .forEach { t ->
                val ideal = TuneInResolver.resolve(single, t)
                assertEquals(0, ideal.index, "single-file channel left slot 0 at t=$t")
                assertTrue(ideal.offsetMs in 0 until 5_000L, "offset out of range at t=$t")
            }
    }

    @Test
    fun `extreme clock values do not overflow`() {
        listOf(Long.MAX_VALUE, Long.MIN_VALUE, Long.MAX_VALUE - 1, Long.MIN_VALUE + 1).forEach { t ->
            val ideal = TuneInResolver.resolve(lineup, t)
            val slot = lineup.slots[ideal.index]
            assertTrue(ideal.offsetMs in 0 until slot.durationMs, "offset out of range at t=$t")
        }
    }

    @Test
    fun `an empty lineup is rejected rather than dividing by zero`() {
        val empty = Lineup(channelId = 9, slots = emptyList(), totalMs = 0L)
        val failure = assertFailsWith<IllegalArgumentException> { TuneInResolver.resolve(empty, 0L) }
        assertTrue(failure.message!!.contains("channel 9"), "error should name the channel")
    }
}
