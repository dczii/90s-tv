package com.nostalgiabox.core.manifest

import com.nostalgiabox.core.model.Channel
import com.nostalgiabox.core.model.Manifest
import com.nostalgiabox.core.model.MediaFile

/**
 * The all-or-nothing gate between the wire and the domain.
 *
 * The only way to obtain a [Manifest] is through here. Validation stops at the first
 * failure and returns it named; nothing is ever partially applied, because a
 * half-applied manifest is a channel that is worse than the one it replaced.
 */
object ManifestValidator {

    /**
     * Validates [dto] against the schema and against this build.
     *
     * [appVersion] is required rather than defaulted on purpose. `minAppVersion` is in
     * the schema precisely so an operator can publish a manifest that old boxes must
     * refuse, and a default would let a call site silently opt out of that refusal.
     * Every caller is made to say what it is.
     */
    fun validate(dto: ManifestDto, appVersion: Int): ManifestResult {
        // Checked before anything else: if this build cannot honour the manifest at
        // all, a complaint about some channel's blank name is noise on top of it.
        if (dto.minAppVersion > appVersion) {
            return ManifestResult.Failure(
                ManifestError.AppTooOld(requiredVersion = dto.minAppVersion, appVersion = appVersion),
            )
        }
        if (dto.channels.isEmpty()) return ManifestResult.Failure(ManifestError.EmptyChannelList)

        val warnings = mutableListOf<ManifestWarning>()
        val seenChannelIds = mutableSetOf<Int>()
        val channels = ArrayList<Channel>(dto.channels.size)

        for (channel in dto.channels) {
            if (!seenChannelIds.add(channel.id)) {
                return ManifestResult.Failure(ManifestError.DuplicateChannelId(channel.id))
            }
            if (channel.number.isBlank()) {
                return ManifestResult.Failure(
                    ManifestError.BlankField("channels[${channel.id}].number"),
                )
            }
            if (channel.name.isBlank()) {
                return ManifestResult.Failure(
                    ManifestError.BlankField("channels[${channel.id}].name"),
                )
            }
            if (channel.files.isEmpty()) {
                return ManifestResult.Failure(ManifestError.EmptyFileList(channel.id))
            }

            val seenHashes = mutableSetOf<String>()
            val files = ArrayList<MediaFile>(channel.files.size)
            for (file in channel.files) {
                if (file.sha256.isBlank()) {
                    return ManifestResult.Failure(
                        ManifestError.BlankField("channels[${channel.id}].files[].sha256"),
                    )
                }
                if (file.url.isBlank()) {
                    return ManifestResult.Failure(
                        ManifestError.BlankField("channels[${channel.id}].files[${file.sha256}].url"),
                    )
                }
                if (file.mimeType.isBlank()) {
                    return ManifestResult.Failure(
                        ManifestError.BlankField(
                            "channels[${channel.id}].files[${file.sha256}].mimeType",
                        ),
                    )
                }
                if (file.durationMs <= 0L) {
                    return ManifestResult.Failure(
                        ManifestError.NonPositiveDuration(channel.id, file.sha256, file.durationMs),
                    )
                }
                if (file.sizeBytes <= 0L) {
                    return ManifestResult.Failure(
                        ManifestError.NonPositiveSize(channel.id, file.sha256, file.sizeBytes),
                    )
                }
                if (!seenHashes.add(file.sha256)) {
                    return ManifestResult.Failure(
                        ManifestError.DuplicateFileHash(channel.id, file.sha256),
                    )
                }
                files += MediaFile(
                    sha256 = file.sha256,
                    url = file.url,
                    durationMs = file.durationMs,
                    sizeBytes = file.sizeBytes,
                    mimeType = file.mimeType,
                )
            }

            // D5: reserved, parsed, deliberately not resolved. Loop playback wins.
            if (channel.schedule != null) {
                warnings += ManifestWarning.ScheduleIgnored(channel.id)
            }

            channels += Channel(
                id = channel.id,
                number = channel.number,
                name = channel.name,
                sortOrder = channel.sortOrder,
                files = files,
                schedule = channel.schedule?.toString(),
            )
        }

        return ManifestResult.Success(
            manifest = Manifest(
                version = dto.version,
                updatedAt = dto.updatedAt,
                minAppVersion = dto.minAppVersion,
                channels = channels,
            ),
            warnings = warnings,
        )
    }
}
