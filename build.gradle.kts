// Deliberately empty of a `plugins { ... }` block.
//
// Declaring the Android Gradle plugin here — even with `apply false` — resolves it onto
// the root project's classpath, which would make every task in the build, `:core:test`
// included, depend on Google's Maven being reachable. Each module declares and applies
// its own plugins via the version catalog instead. See PLAN.md P0 non-negotiable 2.
