package com.nostalgiabox.core

import com.nostalgiabox.core.model.FileStatus
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The §5.3/§5.4 reconciliation: storage is globally content-addressed, so one hash is
 * exactly one file on disk no matter how many channels declare it.
 */
class MediaPathsTest {

    @Test
    fun `a path is the content address, with no channel in it`() {
        assertEquals("media/abc123.mp4", MediaPaths.relativePath(file("abc123")))
        assertEquals("media/abc123.mp4.part", MediaPaths.partialPath(file("abc123")))
    }

    @Test
    fun `the same hash in two channels is one path`() {
        // This is the case §5.3 and §5.4 disagreed about. One download, one file.
        val shared = file("shared")
        val a = channel(id = 1, files = listOf(shared, file("a")))
        val b = channel(id = 2, files = listOf(shared, file("b")))
        val m = manifest(channels = listOf(a, b))

        assertEquals(
            MediaPaths.relativePath(shared),
            MediaPaths.relativePath(shared.copy(url = "https://elsewhere.example.com/x.mp4")),
            "the path is a function of content, not of URL or channel",
        )
        assertEquals(
            setOf("media/shared.mp4", "media/a.mp4", "media/b.mp4"),
            MediaPaths.declaredPaths(m),
            "a shared file must be declared once, not once per channel",
        )
    }

    @Test
    fun `moving a file between channels does not move it on disk`() {
        val f = file("moved")
        val before = manifest(channels = listOf(channel(id = 1, files = listOf(f))))
        val after = manifest(version = 2, channels = listOf(channel(id = 2, files = listOf(f))))
        assertEquals(MediaPaths.declaredPaths(before), MediaPaths.declaredPaths(after))
        assertTrue(ManifestDiffer.diff(before, after).additions.isEmpty(), "nothing to re-download")
    }

    @Test
    fun `extensions follow the declared container and default to mp4`() {
        assertEquals("mp4", MediaPaths.extensionFor("video/mp4"))
        assertEquals("webm", MediaPaths.extensionFor("video/webm"))
        assertEquals("mkv", MediaPaths.extensionFor("video/x-matroska"))
        assertEquals("mp4", MediaPaths.extensionFor("VIDEO/MP4"), "case is not significant")
        assertEquals("mp4", MediaPaths.extensionFor("video/mp4; codecs=avc1.640028"))
        assertEquals("mp4", MediaPaths.extensionFor("application/octet-stream"))
        assertEquals("mp4", MediaPaths.extensionFor(""))
    }

    @Test
    fun `per-channel footprint counts complete files only, by default`() {
        val ch = channel(
            id = 1,
            files = listOf(
                file("a", sizeBytes = 100).copy(status = FileStatus.COMPLETE),
                file("b", sizeBytes = 200).copy(status = FileStatus.PENDING),
                file("c", sizeBytes = 400).copy(status = FileStatus.UNPLAYABLE),
            ),
        )
        assertEquals(100L, MediaPaths.footprintBytes(ch))
        assertEquals(700L, MediaPaths.footprintBytes(ch, completeOnly = false))
    }
}
