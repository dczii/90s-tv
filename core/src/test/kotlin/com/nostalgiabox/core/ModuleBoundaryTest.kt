package com.nostalgiabox.core

import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards the one structural property the rest of the test strategy depends on: `:core`
 * must not have Android on its classpath (ARCHITECTURE.md §3).
 *
 * The Android Gradle plugin not being applied to this module already makes an Android
 * import a compile error. This test catches the subtler regression — someone adding an
 * `androidx.*` or `android.*` artifact as a plain JVM dependency, which would compile
 * here and then fail on a machine with no SDK.
 */
class ModuleBoundaryTest {

    @Test
    fun `no android framework classes on the core classpath`() {
        for (className in ANDROID_CLASSES) {
            val found = runCatching { Class.forName(className, false, javaClass.classLoader) }
            assertTrue(
                "$className resolved from :core — an Android dependency has leaked into a " +
                    "module that must build without an Android SDK.",
                found.isFailure,
            )
        }
    }

    private companion object {
        val ANDROID_CLASSES = listOf(
            "android.os.Bundle",
            "android.content.Context",
            "androidx.annotation.NonNull",
        )
    }
}
