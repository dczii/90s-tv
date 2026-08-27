// Plain Kotlin/JVM. The Android Gradle plugin is NOT applied and no `androidx.*` or
// `android.*` dependency may be added here — that absence is a compiler-enforced module
// boundary (ARCHITECTURE.md §3), not a convention. The Phase 1 test strategy rests on
// this module building and testing with no Android SDK present.

plugins {
    alias(libs.plugins.kotlin.jvm)
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.fromTarget(libs.versions.jvmTarget.get()))
    }
}

java {
    sourceCompatibility = JavaVersion.toVersion(libs.versions.jvmTarget.get())
    targetCompatibility = JavaVersion.toVersion(libs.versions.jvmTarget.get())
}

dependencies {
    testImplementation(libs.junit)
}

tasks.withType<Test>().configureEach {
    testLogging {
        events("passed", "skipped", "failed")
    }
}
