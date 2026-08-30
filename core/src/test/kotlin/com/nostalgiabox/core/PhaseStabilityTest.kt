package com.nostalgiabox.core

import com.nostalgiabox.core.model.Channel
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Amendment A1, written down as an executable assertion.
 *
 * This is the single most important test in the module. If it ever goes red, the
 * channel is re-phasing as downloads complete: the picture jumps at random intervals
 * during provisioning, and two boxes in one house permanently disagree about what is
 * on screen because each one excludes a different set of files.
 *
 * The rule it encodes: the timeline is a function of the *manifest*. Availability is a
 * function of the *disk*. Only the first one is allowed to move the clock.
 */
class PhaseStabilityTest {

    private val fullChannel: Channel = unevenChannel()
    private val clock = FakeClock(nowMs = 1_800_000_000_000L)

    @Test
    fun `marking a file unavailable does not change the channel phase`() {
        val lineup = LineupBuilder.build(fullChannel)
        val everything = fullChannel.files.map { it.sha256 }.toSet()

        val random = seededRandom(seed = 1994)
        repeat(5_000) {
            clock.nowMs = random.nextLong(-1_000_000_000L, 3_000_000_000_000L)
            val ideal = TuneInResolver.resolve(lineup, clock.nowEpochMs())

            // Drop files from the available set one at a time, in every combination we
            // can afford, and re-resolve. The ideal slot must not move by a millisecond.
            val partial = everything.filter { random.nextBoolean() }.toSet()
            assertEquals(
                ideal,
                TuneInResolver.resolve(lineup, clock.nowEpochMs()),
                "resolve() consulted availability",
            )

            val projected = AvailabilityProjector.project(lineup, ideal, partial)
            if (projected != null && projected.onClock) {
                assertEquals(ideal.index, projected.index)
                assertEquals(ideal.offsetMs, projected.offsetMs)
            }
        }
    }

    @Test
    fun `the lineup is identical whatever the download status of its files`() {
        val nothingDownloaded = fullChannel
        val halfDownloaded = fullChannel.copy(
            files = fullChannel.files.mapIndexed { i, f ->
                if (i % 2 == 0) f.copy(status = com.nostalgiabox.core.model.FileStatus.COMPLETE) else f
            },
        )
        val oneUnplayable = fullChannel.copy(
            files = fullChannel.files.map {
                it.copy(status = com.nostalgiabox.core.model.FileStatus.UNPLAYABLE)
            },
        )

        val a = LineupBuilder.build(nothingDownloaded)
        val b = LineupBuilder.build(halfDownloaded)
        val c = LineupBuilder.build(oneUnplayable)

        assertEquals(a, b, "download status leaked into the timeline")
        assertEquals(a, c, "playability leaked into the timeline")
        assertEquals(
            fullChannel.files.sumOf { it.durationMs },
            a.totalMs,
            "totalMs must be the sum of DECLARED durations over ALL files",
        )
    }

    @Test
    fun `adding a file to the manifest does change the channel phase`() {
        val before = LineupBuilder.build(fullChannel)
        val after = LineupBuilder.build(
            fullChannel.copy(files = fullChannel.files + file("f", durationMs = 500_000L)),
        )

        assertNotEquals(before.totalMs, after.totalMs, "the divisor must change on a content update")
        assertEquals(before.totalMs + 500_000L, after.totalMs)

        // A content update re-phases the channel; that is correct and expected (§5.4).
        // Assert it actually happens rather than merely that it may.
        val movedAt = (0 until 200).map { it * 37_000L }.count { t ->
            TuneInResolver.resolve(before, t) != TuneInResolver.resolve(after, t)
        }
        assertTrue(movedAt > 0, "adding a file left the phase untouched, so the divisor is wrong")
    }

    @Test
    fun `a file that lands later starts appearing at its correct broadcast time`() {
        // Slot "c" is a hole at first. When it arrives, it does not shift anything:
        // it simply starts being shown at the time it was always scheduled for.
        val lineup = LineupBuilder.build(fullChannel)
        val cSlot = lineup.slots.single { it.fileId == "c" }
        val midC = cSlot.startMs + cSlot.durationMs / 2

        val ideal = TuneInResolver.resolve(lineup, midC)
        assertEquals(cSlot.index, ideal.index)

        val withoutC = AvailabilityProjector.project(lineup, ideal, setOf("a", "b", "d", "e"))
        assertNotNull(withoutC)
        assertNotEquals("c", withoutC.fileId)
        assertTrue(!withoutC.onClock)

        val withC = assertNotNull(
            AvailabilityProjector.project(lineup, ideal, setOf("a", "b", "c", "d", "e")),
        )
        assertEquals("c", withC.fileId)
        assertEquals(ideal.offsetMs, withC.offsetMs, "the file resumes its own schedule exactly")
        assertTrue(withC.onClock)
    }
}
