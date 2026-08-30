package com.nostalgiabox.core

/**
 * The only source of time in the system.
 *
 * Playback position is a pure function of the wall clock (ARCHITECTURE.md §1). It is
 * never stored, never restored and never advanced by us, so this interface has exactly
 * one method and no way to write to it.
 *
 * Tests substitute a fake; production uses [SystemBroadcastClock].
 */
fun interface BroadcastClock {
    /** Milliseconds since the Unix epoch. May legitimately be negative or wrong. */
    fun nowEpochMs(): Long
}

/** The device wall clock. Wrong until NTP corrects it; correct thereafter. */
object SystemBroadcastClock : BroadcastClock {
    override fun nowEpochMs(): Long = System.currentTimeMillis()
}
