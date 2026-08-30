package com.nostalgiabox.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The §5.5 pre-download space check, without the StatFs call. */
class StorageBudgetTest {

    @Test
    fun `the headroom is the documented ten percent, rounded up`() {
        assertEquals(10, StorageBudget.HEADROOM_PERCENT)
        assertEquals(110L, StorageBudget.requiredBytes(100L))
        assertEquals(0L, StorageBudget.requiredBytes(0L))
        assertEquals(2L, StorageBudget.requiredBytes(1L), "never round a requirement down")

        // Exactly, for every input — not "110.00000000000001 rounded up to 111".
        // A 6 GB provisioning is the real case (decision D3).
        assertEquals(6_600_000_000L, StorageBudget.requiredBytes(6_000_000_000L))
        for (n in 0L..200L) {
            assertEquals(
                (n * 110L + 99L) / 100L,
                StorageBudget.requiredBytes(n),
                "requiredBytes($n)",
            )
        }
    }

    @Test
    fun `the check fails when free space only just covers the raw size`() {
        // The bug this exists to prevent: comparing against sum(sizeBytes) with no
        // headroom, filling the device, and failing on the last file's .part.
        assertFalse(StorageBudget.hasRoomFor(freeBytes = 1_000L, bytes = 1_000L))
        assertTrue(StorageBudget.hasRoomFor(freeBytes = 1_100L, bytes = 1_000L))
    }

    @Test
    fun `budgets are computed over a channel, a manifest and a diff`() {
        val a = channel(id = 1, files = listOf(file("a", sizeBytes = 1_000L)))
        val b = channel(id = 2, files = listOf(file("b", sizeBytes = 3_000L)))
        val before = manifest(channels = listOf(a))
        val after = manifest(version = 2, channels = listOf(a, b))

        assertEquals(1_100L, StorageBudget.requiredBytes(a))
        assertEquals(4_400L, StorageBudget.requiredBytes(after))
        assertEquals(
            3_300L,
            StorageBudget.requiredBytes(ManifestDiffer.diff(before, after)),
            "an update budgets for the additions, not for what is already on disk",
        )
    }

    @Test
    fun `a negative size is a programming error, not a small budget`() {
        assertFailsWith<IllegalArgumentException> { StorageBudget.requiredBytes(-1L) }
    }
}
