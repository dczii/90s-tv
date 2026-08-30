package com.nostalgiabox.core

import com.nostalgiabox.core.model.IdealSlot
import com.nostalgiabox.core.model.PlayableSlot
import kotlin.math.abs

/** Where the player actually is, as reported by it. */
data class PlaybackPosition(
    /** Index into the channel's timeline, not into the playable subset. */
    val index: Int,
    val positionMs: Long,
    /**
     * False when the projector fell forward past a hole to get here — the player is
     * knowingly off the broadcast clock (see [PlayableSlot.onClock]).
     */
    val onClock: Boolean,
)

/** What to do about the gap between the clock and the player. */
sealed interface DriftDecision {
    /** Leave it alone. Either the gap is inside the dead zone, or it is deliberate. */
    data object Hold : DriftDecision

    /** Seek to [index] at [offsetMs]. */
    data class Correct(val index: Int, val offsetMs: Long) : DriftDecision {
        constructor(ideal: IdealSlot) : this(ideal.index, ideal.offsetMs)
    }
}

/**
 * Decides whether the player has drifted far enough from the broadcast clock to be
 * worth a seek (ARCHITECTURE.md §6.3).
 *
 * This lives in `:core` rather than in the player because it is arithmetic, and
 * arithmetic in the player is arithmetic that needs a television to test. The player's
 * job is to call this on every `onMediaItemTransition`, on the 30s ticker, on `onStart`
 * and on `ACTION_TIME_CHANGED` / `ACTION_TIMEZONE_CHANGED`, and to do what it says.
 */
object DriftCorrector {

    /**
     * The dead zone from §6.3. Correcting drift smaller than this produces a visible
     * micro-seek every 30 seconds, which is worse than the drift it removes.
     */
    const val DEFAULT_DEAD_ZONE_MS: Long = 2_000L

    /**
     * Compares where the clock says we should be against where the player is.
     *
     * Two things make this more than the one-line comparison in §6.3:
     *
     * 1. **Off-clock playback is never corrected mid-item.** When the projector fell
     *    forward past a missing file, the index *is* expected to differ from the ideal
     *    one, and §6.5 says we re-sync at the next boundary — not by yanking the
     *    picture back the instant a download lands. Correcting here would make every
     *    completed download a visible jump, which is the same symptom amendment A1
     *    exists to prevent, arriving by a different route.
     * 2. **A wrong index is corrected regardless of the dead zone.** The dead zone is
     *    about sub-second jitter within one item; being on the wrong item is not
     *    jitter.
     *
     * @param ideal the clock's answer, from [TuneInResolver.resolve].
     * @param current where the player reports itself to be.
     * @param deadZoneMs override only for tests.
     */
    fun evaluate(
        ideal: IdealSlot,
        current: PlaybackPosition,
        deadZoneMs: Long = DEFAULT_DEAD_ZONE_MS,
    ): DriftDecision {
        require(deadZoneMs >= 0L) { "deadZoneMs must not be negative: $deadZoneMs" }

        // Deliberately off-clock: the next boundary re-resolves and re-projects, and
        // that is where we rejoin. Nothing to correct.
        if (!current.onClock) return DriftDecision.Hold

        if (ideal.index != current.index) return DriftDecision.Correct(ideal)

        val drift = abs(ideal.offsetMs - current.positionMs)
        return if (drift > deadZoneMs) DriftDecision.Correct(ideal) else DriftDecision.Hold
    }

    /**
     * Convenience for the common call site, which holds a [PlayableSlot] from the
     * projector and a position from the player.
     */
    fun evaluate(
        ideal: IdealSlot,
        playing: PlayableSlot,
        positionMs: Long,
        deadZoneMs: Long = DEFAULT_DEAD_ZONE_MS,
    ): DriftDecision = evaluate(
        ideal = ideal,
        current = PlaybackPosition(playing.index, positionMs, playing.onClock),
        deadZoneMs = deadZoneMs,
    )
}
