package com.nostalgiabox.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ManifestDifferTest {

    private val v1 = manifest(
        version = 1,
        channels = listOf(
            channel(id = 1, files = listOf(file("aaa"), file("bbb"))),
            channel(id = 2, files = listOf(file("ccc"))),
        ),
    )

    @Test
    fun `an unchanged manifest produces no work`() {
        val diff = ManifestDiffer.diff(v1, v1.copy(version = 2))
        assertTrue(diff.additions.isEmpty())
        assertTrue(diff.orphans.isEmpty())
        assertEquals(listOf("aaa", "bbb", "ccc"), diff.unchanged.map { it.sha256 })
        assertTrue(!diff.hasChanges)
        assertEquals(0L, diff.bytesToDownload)
    }

    @Test
    fun `an added file is an addition and nothing else`() {
        val v2 = v1.copy(
            channels = listOf(
                v1.channels[0].copy(files = v1.channels[0].files + file("ddd", sizeBytes = 4_096L)),
                v1.channels[1],
            ),
        )
        val diff = ManifestDiffer.diff(v1, v2)

        assertEquals(listOf("ddd"), diff.additions.map { it.sha256 })
        assertEquals(listOf(1), diff.additions.map { it.channelId }, "P3 needs the storage path")
        assertTrue(diff.orphans.isEmpty())
        assertEquals(4_096L, diff.bytesToDownload)
        assertTrue(diff.hasChanges)
    }

    @Test
    fun `a removed file is an orphan and nothing else`() {
        val v2 = v1.copy(
            channels = listOf(
                v1.channels[0].copy(files = listOf(file("aaa"))),
                v1.channels[1],
            ),
        )
        val diff = ManifestDiffer.diff(v1, v2)

        assertTrue(diff.additions.isEmpty())
        assertEquals(listOf("bbb"), diff.orphans.map { it.sha256 })
        assertEquals(listOf(1), diff.orphans.map { it.channelId }, "we need to know what to delete")
        assertEquals(listOf("aaa", "ccc"), diff.unchanged.map { it.sha256 })
    }

    @Test
    fun `a file replaced at the same URL is both an addition and an orphan`() {
        // The whole point of content addressing: same URL, new bytes, new name. There
        // is no stale-cache case to reason about, because nothing is overwritten.
        val sameUrl = "https://cdn.example.com/ch1/episode.mp4"
        val old = manifest(channels = listOf(channel(id = 1, files = listOf(file("old", url = sameUrl)))))
        val new = manifest(channels = listOf(channel(id = 1, files = listOf(file("new", url = sameUrl)))))

        val diff = ManifestDiffer.diff(old, new)
        assertEquals(listOf("new"), diff.additions.map { it.sha256 })
        assertEquals(listOf("old"), diff.orphans.map { it.sha256 })
        assertTrue(diff.unchanged.isEmpty())
        assertEquals(sameUrl, diff.additions.single().file.url)
        assertEquals(sameUrl, diff.orphans.single().file.url)
    }

    @Test
    fun `first run treats every declared file as an addition`() {
        val diff = ManifestDiffer.diff(null, v1)
        assertEquals(listOf("aaa", "bbb", "ccc"), diff.additions.map { it.sha256 })
        assertTrue(diff.orphans.isEmpty())
        assertTrue(diff.unchanged.isEmpty())
        assertEquals(3_000_000L, diff.bytesToDownload)
    }

    @Test
    fun `reordering a channel's files changes nothing to download`() {
        // Reordering re-phases the channel — that is the lineup's business, not the
        // downloader's. No bytes should move.
        val reordered = v1.copy(
            channels = listOf(
                v1.channels[0].copy(files = v1.channels[0].files.reversed()),
                v1.channels[1],
            ),
        )
        val diff = ManifestDiffer.diff(v1, reordered)
        assertTrue(!diff.hasChanges)
    }

    @Test
    fun `a hash declared by two channels is downloaded once`() {
        val shared = manifest(
            channels = listOf(
                channel(id = 1, files = listOf(file("shared"))),
                channel(id = 2, files = listOf(file("shared"))),
            ),
        )
        val diff = ManifestDiffer.diff(null, shared)
        assertEquals(1, diff.additions.size)
        assertEquals(1, diff.additions.single().channelId, "first declaring channel wins")
    }

    @Test
    fun `a channel removed wholesale orphans all of its files`() {
        val v2 = v1.copy(channels = listOf(v1.channels[0]))
        val diff = ManifestDiffer.diff(v1, v2)
        assertEquals(listOf("ccc"), diff.orphans.map { it.sha256 })
        assertEquals(listOf(2), diff.orphans.map { it.channelId })
    }
}
