plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kover)
}

// :core is a plain Kotlin/JVM module by design (ARCHITECTURE.md §3).
// The Android Gradle plugin is NOT applied and no androidx.*/android.* dependency is
// permitted here. That absence is the compiler-enforced module boundary the whole
// test strategy rests on, and it is why this module builds with no Android SDK present.

kotlin {
    jvmToolchain(21)
    compilerOptions {
        allWarningsAsErrors.set(true)
    }
}

dependencies {
    implementation(libs.kotlinx.serialization.json)

    testImplementation(kotlin("test"))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
    }
}

// The exit criterion for this phase is 100% BRANCH coverage on the two functions the
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
