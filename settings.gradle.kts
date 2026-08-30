// Nostalgia Box — Phase 0 scaffold.
//
// The `google()` repositories below are content-filtered on purpose. `:core` is a plain
// Kotlin/JVM module (ARCHITECTURE.md §3) and none of its dependencies live on Google's
// Maven; restricting `google()` to Android/AndroidX/Google coordinates means resolving
// `:core` never touches it. Combined with `org.gradle.configureondemand` in
// gradle.properties, that is what lets `./gradlew :core:test` succeed on a machine with
// no Android SDK and no reachable `dl.google.com`.

pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

@Suppress("UnstableApiUsage")
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
    }
}

rootProject.name = "nostalgia-box"

include(":core")
include(":app")
