package com.nostalgiabox.core.manifest

import com.nostalgiabox.core.model.FileStatus
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Parsing and validation are one gate from the caller's side: either a whole usable
 * manifest comes out, or a named error does. Nothing is ever half-applied, because the
 * previous good manifest has to keep serving.
 */
class ManifestParserTest {

    private fun fileJson(
        url: String = "https://cdn.example.com/ch1/toon-a.mp4",
        sha256: String = "3f7a",
        durationMs: Long = 640_000,
        sizeBytes: Long = 214_958_080,
        mimeType: String = "video/mp4",
    ) = """
        {"url":"$url","sha256":"$sha256","durationMs":$durationMs,
         "sizeBytes":$sizeBytes,"mimeType":"$mimeType"}
    """.trimIndent()

    private fun channelJson(
        id: Int = 1,
        number: String = "01",
        name: String = "Cartoons",
        sortOrder: Int = 1,
        files: String = fileJson(),
        schedule: String = "null",
    ) = """
        {"id":$id,"number":"$number","name":"$name","sortOrder":$sortOrder,
         "files":[$files],"schedule":$schedule}
    """.trimIndent()

    private fun manifestJson(
        channels: String = channelJson(),
        extra: String = "",
    ) = """
        {"version":3,"updatedAt":"2026-08-26T00:00:00Z","minAppVersion":1,
         $extra"channels":[$channels]}
    """.trimIndent()

    private fun failure(json: String): ManifestError =
        assertIs<ManifestResult.Failure>(ManifestParser.parse(json)).error

    private fun success(json: String): ManifestResult.Success =
        assertIs<ManifestResult.Success>(ManifestParser.parse(json))

    // --- the happy path, which is the schema in ARCHITECTURE.md §5.1 verbatim -------

    @Test
    fun `the documented schema parses into the domain model`() {
        val result = success(manifestJson())
        val manifest = result.manifest

        assertEquals(3, manifest.version)
        assertEquals("2026-08-26T00:00:00Z", manifest.updatedAt)
        assertEquals(1, manifest.minAppVersion)

        val channel = manifest.channels.single()
        assertEquals(1, channel.id)
        assertEquals("01", channel.number)
        assertEquals("Cartoons", channel.name)
        assertEquals(1, channel.sortOrder)
        assertEquals(null, channel.schedule)

        val file = channel.files.single()
        assertEquals("3f7a", file.sha256)
        assertEquals("https://cdn.example.com/ch1/toon-a.mp4", file.url)
        assertEquals(640_000L, file.durationMs)
        assertEquals(214_958_080L, file.sizeBytes)
        assertEquals("video/mp4", file.mimeType)
        assertEquals(FileStatus.PENDING, file.status, "the manifest never asserts what is on disk")
        assertTrue(result.warnings.isEmpty())
    }

    @Test
    fun `unknown fields do not break an installed box`() {
        // ignoreUnknownKeys is what stops one new manifest field bricking every client
        // already in the field. This test is the reason that flag exists.
        val withFutureFields = """
            {"version":4,"updatedAt":"2026-09-01T00:00:00Z","minAppVersion":1,
             "rating":"TV-Y7","channels":[
               {"id":1,"number":"01","name":"Cartoons","sortOrder":1,"logoUrl":"x.png",
                "files":[{"url":"https://e.example/a.mp4","sha256":"aa","durationMs":10,
                          "sizeBytes":10,"mimeType":"video/mp4","subtitles":["en"]}],
                "schedule":null}]}
        """.trimIndent()
        val manifest = success(withFutureFields).manifest
        assertEquals(4, manifest.version)
        assertEquals("aa", manifest.channels.single().files.single().sha256)
    }

    @Test
    fun `an omitted schedule is the same as a null one`() {
        val noScheduleKey = """
            {"version":1,"updatedAt":"t","minAppVersion":1,"channels":[
              {"id":1,"number":"01","name":"A","sortOrder":1,
               "files":[{"url":"u","sha256":"aa","durationMs":1,"sizeBytes":1,
                         "mimeType":"video/mp4"}]}]}
        """.trimIndent()
        assertEquals(null, success(noScheduleKey).manifest.channels.single().schedule)
    }

    @Test
    fun `a declared schedule is reserved, warned about, and falls back to loop playback`() {
        // Decision D5: parsed and kept, never resolved. A manifest that declares one is
        // valid and plays as a pure loop.
        val result = success(
            manifestJson(channels = channelJson(schedule = """{"kind":"timeOfDay","start":"18:00"}""")),
        )
        val warning = assertIs<ManifestWarning.ScheduleIgnored>(result.warnings.single())
        assertEquals(1, warning.channelId)
        assertTrue(warning.message.contains("loop"))
        assertTrue(result.manifest.channels.single().schedule!!.contains("timeOfDay"))
    }

    // --- rejection, one named error apiece -----------------------------------------

    @Test
    fun `rejects an empty channel list`() {
        val error = failure("""{"version":1,"updatedAt":"t","minAppVersion":1,"channels":[]}""")
        assertEquals(ManifestError.EmptyChannelList, error)
        assertTrue(error.message.isNotBlank())
    }

    @Test
    fun `rejects an empty file list`() {
        val error = failure(manifestJson(channels = """{"id":4,"number":"04","name":"A","sortOrder":1,"files":[],"schedule":null}"""))
        assertEquals(ManifestError.EmptyFileList(channelId = 4), error)
    }

    @Test
    fun `rejects a zero duration`() {
        val error = failure(manifestJson(channels = channelJson(files = fileJson(durationMs = 0))))
        assertEquals(ManifestError.NonPositiveDuration(1, "3f7a", 0L), error)
    }

    @Test
    fun `rejects a negative duration`() {
        val error = failure(manifestJson(channels = channelJson(files = fileJson(durationMs = -1))))
        assertEquals(ManifestError.NonPositiveDuration(1, "3f7a", -1L), error)
    }

    @Test
    fun `rejects a non-positive size, which the space check depends on`() {
        assertEquals(
            ManifestError.NonPositiveSize(1, "3f7a", 0L),
            failure(manifestJson(channels = channelJson(files = fileJson(sizeBytes = 0)))),
        )
    }

    @Test
    fun `rejects a duplicate channel id`() {
        val error = failure(
            manifestJson(channels = channelJson(id = 1) + "," + channelJson(id = 1, number = "02")),
        )
        assertEquals(ManifestError.DuplicateChannelId(1), error)
    }

    @Test
    fun `rejects a duplicate sha256 within a channel`() {
        val error = failure(
            manifestJson(channels = channelJson(files = fileJson(sha256 = "dup") + "," + fileJson(sha256 = "dup", url = "https://e.example/b.mp4"))),
        )
        assertEquals(ManifestError.DuplicateFileHash(1, "dup"), error)
    }

    @Test
    fun `rejects a missing required field by name`() {
        val noDuration = """
            {"version":1,"updatedAt":"t","minAppVersion":1,"channels":[
              {"id":1,"number":"01","name":"A","sortOrder":1,
               "files":[{"url":"u","sha256":"aa","sizeBytes":1,"mimeType":"video/mp4"}],
               "schedule":null}]}
        """.trimIndent()
        val error = assertIs<ManifestError.MissingRequiredField>(failure(noDuration))
        assertEquals(listOf("durationMs"), error.fields)
        assertTrue(error.message.contains("durationMs"))

        val noChannels = """{"version":1,"updatedAt":"t","minAppVersion":1}"""
        assertEquals(
            listOf("channels"),
            assertIs<ManifestError.MissingRequiredField>(failure(noChannels)).fields,
        )

        val noSha = """
            {"version":1,"updatedAt":"t","minAppVersion":1,"channels":[
              {"id":1,"number":"01","name":"A","sortOrder":1,
               "files":[{"url":"u","durationMs":1,"sizeBytes":1,"mimeType":"video/mp4"}]}]}
        """.trimIndent()
        assertEquals(
            listOf("sha256"),
            assertIs<ManifestError.MissingRequiredField>(failure(noSha)).fields,
        )
    }

    @Test
    fun `rejects a blank required string`() {
        assertEquals(
            ManifestError.BlankField("channels[1].files[].sha256"),
            failure(manifestJson(channels = channelJson(files = fileJson(sha256 = "")))),
        )
        assertEquals(
            ManifestError.BlankField("channels[1].files[3f7a].url"),
            failure(manifestJson(channels = channelJson(files = fileJson(url = "")))),
        )
        assertEquals(
            ManifestError.BlankField("channels[1].files[3f7a].mimeType"),
            failure(manifestJson(channels = channelJson(files = fileJson(mimeType = " ")))),
        )
        assertEquals(
            ManifestError.BlankField("channels[1].number"),
            failure(manifestJson(channels = channelJson(number = ""))),
        )
        assertEquals(
            ManifestError.BlankField("channels[1].name"),
            failure(manifestJson(channels = channelJson(name = " "))),
        )
    }

    @Test
    fun `rejects bytes that are not JSON at all`() {
        assertIs<ManifestError.Malformed>(failure("not json"))
        assertIs<ManifestError.Malformed>(failure(""))
        assertIs<ManifestError.Malformed>(failure("{"))
        // A 404 page from a misconfigured host is the realistic version of this.
        assertIs<ManifestError.Malformed>(failure("<html><body>404</body></html>"))
    }

    @Test
    fun `rejects a field of the wrong type`() {
        val stringDuration = """
            {"version":1,"updatedAt":"t","minAppVersion":1,"channels":[
              {"id":1,"number":"01","name":"A","sortOrder":1,
               "files":[{"url":"u","sha256":"aa","durationMs":"ten","sizeBytes":1,
                         "mimeType":"video/mp4"}],"schedule":null}]}
        """.trimIndent()
        assertIs<ManifestError.Malformed>(failure(stringDuration))
    }

    @Test
    fun `a rejected manifest yields nothing at all, not a partial one`() {
        // All-or-nothing: the second channel is fine, but one bad channel rejects the
        // whole document. Half-applying would leave a channel worse than it was.
        val oneBadChannel = manifestJson(
            channels = channelJson(id = 1, files = fileJson(durationMs = -5)) + "," +
                channelJson(id = 2, number = "02"),
        )
        val result = ManifestParser.parse(oneBadChannel)
        assertIs<ManifestResult.Failure>(result)
        assertEquals(ManifestError.NonPositiveDuration(1, "3f7a", -5L), result.error)
    }

    @Test
    fun `validation runs on a DTO built in code, not only on parsed JSON`() {
        // ManifestValidator is public so P2 can re-validate a manifest it read back out
        // of storage without a round trip through JSON.
        val dto = ManifestDto(
            version = 1,
            updatedAt = "t",
            minAppVersion = 1,
            channels = listOf(
                ChannelDto(
                    id = 1,
                    number = "01",
                    name = "A",
                    sortOrder = 1,
                    files = listOf(FileDto("u", "aa", 10, 20, "video/mp4")),
                ),
            ),
        )
        val manifest = assertIs<ManifestResult.Success>(ManifestValidator.validate(dto)).manifest
        assertEquals(10L, manifest.channels.single().files.single().durationMs)
    }
}
