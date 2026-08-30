// Plain Kotlin/JVM. The Android Gradle plugin is NOT applied and no `androidx.*` or
// `android.*` dependency may be added here — that absence is a compiler-enforced module
// boundary (ARCHITECTURE.md §3), not a convention. The Phase 1 test strategy rests on
// this module building and testing with no Android SDK present.

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kover)
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.fromTarget(libs.versions.jvmTarget.get()))
        allWarningsAsErrors.set(true)
    }
}

java {
    sourceCompatibility = JavaVersion.toVersion(libs.versions.jvmTarget.get())
    targetCompatibility = JavaVersion.toVersion(libs.versions.jvmTarget.get())
}

dependencies {
    implementation(libs.kotlinx.serialization.json)

    testImplementation(kotlin("test"))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
    }
}

// The exit criterion for Phase 1 is 100% BRANCH coverage on the two functions the
// broadcast illusion actually hangs on. Coverage reporting is deliberately filtered to
// exactly those two classes: a module-wide percentage is a number nobody acts on,
// whereas an unexercised branch in either of these is a picture that jumps on someone's
// TV. `./gradlew :core:test` runs the check and fails the build if one is uncovered.
kover {
    reports {
        filters {
            includes {
                classes(
                    "com.nostalgiabox.core.TuneInResolver",
                    "com.nostalgiabox.core.AvailabilityProjector",
                )
            }
        }
        verify {
            rule("100% branch and line coverage on TuneInResolver and AvailabilityProjector") {
                bound {
                    coverageUnits.set(kotlinx.kover.gradle.plugin.dsl.CoverageUnit.BRANCH)
                    minValue.set(100)
                }
                bound {
                    coverageUnits.set(kotlinx.kover.gradle.plugin.dsl.CoverageUnit.LINE)
                    minValue.set(100)
                }
            }
        }
    }
}

tasks.named("test") {
    finalizedBy(tasks.named("koverVerify"))
}
