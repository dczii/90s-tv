package com.nostalgiabox.core

import com.nostalgiabox.core.model.Channel
import com.nostalgiabox.core.model.Manifest
import com.nostalgiabox.core.model.MediaFile
import kotlin.random.Random

/**
 * A clock the test owns.
 *
 * The whole product is a pure function of this value, so being able to set it to a
 * pre-1970 instant, to exactly zero, or to a million random instants is the entire
 * test strategy.
 */
class FakeClock(var nowMs: Long = 0L) : BroadcastClock {
    override fun nowEpochMs(): Long = nowMs

    fun advance(ms: Long) {
        nowMs += ms
    }
}

/** Seeded so a failure is reproducible; property tests that cannot be replayed are noise. */
fun seededRandom(seed: Int = 0x90_5F_7A): Random = Random(seed)

fun file(
    id: String,
    durationMs: Long = 60_000L,
    sizeBytes: Long = 1_000_000L,
    url: String = "https://cdn.example.com/$id.mp4",
): MediaFile = MediaFile(
    sha256 = id,
    url = url,
    durationMs = durationMs,
    sizeBytes = sizeBytes,
    mimeType = "video/mp4",
)

fun channel(
    id: Int = 1,
    number: String = id.toString().padStart(2, '0'),
    name: String = "Channel $id",
    sortOrder: Int = id,
    files: List<MediaFile>,
    schedule: String? = null,
): Channel = Channel(
    id = id,
    number = number,
    name = name,
    sortOrder = sortOrder,
    files = files,
    schedule = schedule,
)

fun manifest(
    version: Int = 1,
    channels: List<Channel>,
): Manifest = Manifest(
    version = version,
    updatedAt = "2026-08-26T00:00:00Z",
    minAppVersion = 1,
    channels = channels,
)

/** Durations chosen to be uneven, so an off-by-one cannot hide behind round numbers. */
fun unevenChannel(id: Int = 1): Channel = channel(
    id = id,
    files = listOf(
        file("a", durationMs = 640_123L),
        file("b", durationMs = 1_000L),
        file("c", durationMs = 2_400_999L),
        file("d", durationMs = 7L),
        file("e", durationMs = 183_456L),
    ),
)
