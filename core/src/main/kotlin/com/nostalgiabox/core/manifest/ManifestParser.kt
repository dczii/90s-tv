package com.nostalgiabox.core.manifest

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.MissingFieldException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

/**
 * Parses manifest JSON, then validates it. The two steps are never separable from the
 * caller's point of view: what comes out is either a whole usable manifest or a named
 * error.
 */
object ManifestParser {

    /**
     * `ignoreUnknownKeys = true` is load-bearing: an installed box must keep working
     * when a later manifest adds a field it has never heard of. Without it, one new
     * key bricks every client in the field.
     */
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = false
    }

    // MissingFieldException is the only way to distinguish "field absent" from
    // "field malformed", and that distinction is what makes the error named.
    @OptIn(ExperimentalSerializationApi::class)
    fun parse(raw: String): ManifestResult {
        val dto = try {
            json.decodeFromString(ManifestDto.serializer(), raw)
        } catch (e: MissingFieldException) {
            return ManifestResult.Failure(
                ManifestError.MissingRequiredField(e.missingFields),
            )
        } catch (e: SerializationException) {
            return ManifestResult.Failure(
                ManifestError.Malformed(e.message ?: e::class.simpleName ?: "unknown"),
            )
        } catch (e: IllegalArgumentException) {
            return ManifestResult.Failure(
                ManifestError.Malformed(e.message ?: e::class.simpleName ?: "unknown"),
            )
        }
        return ManifestValidator.validate(dto)
    }
}
