package com.nostalgiabox.core

import com.nostalgiabox.core.model.IdealSlot
import com.nostalgiabox.core.model.PlayableSlot
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs

/** ARCHITECTURE.md §6.3, and the §6.5 rule that off-clock playback is left alone. */
class DriftCorrectorTest {

    private fun at(index: Int, positionMs: Long, onClock: Boolean = true) =
        PlaybackPosition(index = index, positionMs = positionMs, onClock = onClock)

    @Test
    fun `drift inside the dead zone is left alone`() {
        // A micro-seek every 30 seconds is more visible than the drift it removes.
        for (drift in listOf(0L, 1L, 500L, 1_999L, 2_000L)) {
            assertEquals(
                DriftDecision.Hold,
                DriftCorrector.evaluate(IdealSlot(2, 30_000L), at(2, 30_000L - drift)),
                "drift of ${drift}ms should be held",
            )
            assertEquals(
                DriftDecision.Hold,
                DriftCorrector.evaluate(IdealSlot(2, 30_000L), at(2, 30_000L + drift)),
                "drift of ${drift}ms should be held",
            )
        }
    }

    @Test
    fun `drift past the dead zone is corrected, in both directions`() {
        assertEquals(
            DriftDecision.Correct(2, 30_000L),
            DriftCorrector.evaluate(IdealSlot(2, 30_000L), at(2, 27_999L)),
        )
        assertEquals(
            DriftDecision.Correct(2, 30_000L),
            DriftCorrector.evaluate(IdealSlot(2, 30_000L), at(2, 32_001L)),
        )
    }

    @Test
    fun `the dead zone is exactly two seconds and the boundary holds`() {
        assertEquals(2_000L, DriftCorrector.DEFAULT_DEAD_ZONE_MS)
        assertEquals(
            DriftDecision.Hold,
            DriftCorrector.evaluate(IdealSlot(0, 5_000L), at(0, 3_000L)),
            "exactly the dead zone is not past it",
        )
        assertIs<DriftDecision.Correct>(
            DriftCorrector.evaluate(IdealSlot(0, 5_000L), at(0, 2_999L)),
        )
    }

    @Test
    fun `a wrong index is corrected however small the offset difference`() {
        // Being on the wrong item is not jitter, so the dead zone does not apply.
        assertEquals(
            DriftDecision.Correct(3, 1_000L),
            DriftCorrector.evaluate(IdealSlot(3, 1_000L), at(2, 1_000L)),
        )
    }

    @Test
    fun `off-clock playback is never corrected, even on a different item`() {
        // This is the important one. We fell forward past a hole; §6.5 says we rejoin
        // at the next boundary. Correcting here would turn every completed download
        // into a visible jump — A1's symptom arriving by a different route.
        assertEquals(
            DriftDecision.Hold,
            DriftCorrector.evaluate(IdealSlot(3, 1_000L), at(0, 900_000L, onClock = false)),
        )
        assertEquals(
            DriftDecision.Hold,
            DriftCorrector.evaluate(IdealSlot(3, 1_000L), at(3, 999_999L, onClock = false)),
        )
    }

    @Test
    fun `the PlayableSlot overload agrees with the explicit one`() {
        val ideal = IdealSlot(1, 10_000L)
        val onClock = PlayableSlot(index = 1, offsetMs = 10_000L, fileId = "a", onClock = true)
        val offClock = onClock.copy(onClock = false)

        assertEquals(
            DriftCorrector.evaluate(ideal, at(1, 20_000L)),
            DriftCorrector.evaluate(ideal, onClock, positionMs = 20_000L),
        )
        assertEquals(
            DriftDecision.Hold,
            DriftCorrector.evaluate(ideal, offClock, positionMs = 20_000L),
        )
    }

    @Test
    fun `a custom dead zone is honoured and a negative one is rejected`() {
        assertEquals(
            DriftDecision.Hold,
            DriftCorrector.evaluate(IdealSlot(0, 0L), at(0, 9_000L), deadZoneMs = 10_000L),
        )
        assertIs<DriftDecision.Correct>(
            DriftCorrector.evaluate(IdealSlot(0, 0L), at(0, 9_000L), deadZoneMs = 8_000L),
        )
        assertEquals(
            DriftDecision.Correct(0, 0L),
            DriftCorrector.evaluate(IdealSlot(0, 0L), at(0, 1L), deadZoneMs = 0L),
        )
        assertFailsWith<IllegalArgumentException> {
            DriftCorrector.evaluate(IdealSlot(0, 0L), at(0, 0L), deadZoneMs = -1L)
        }
    }

    @Test
    fun `a resolved position is never corrected against itself`() {
        // The loop the player actually runs: resolve, project, compare. If the player
        // is exactly where resolve() just said, there is nothing to do — otherwise the
        // 30s ticker would seek forever.
        val lineup = LineupBuilder.build(unevenChannel())
        val random = seededRandom(seed = 2026)
        repeat(2_000) {
            val now = random.nextLong(-1_000_000_000L, 3_000_000_000_000L)
            val ideal = TuneInResolver.resolve(lineup, now)
            assertEquals(
                DriftDecision.Hold,
                DriftCorrector.evaluate(ideal, at(ideal.index, ideal.offsetMs)),
            )
        }
    }
}
