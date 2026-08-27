package com.nostalgiabox.tv

import android.app.Activity
import android.os.Bundle
import android.view.WindowManager

/**
 * The app's single Activity (ARCHITECTURE.md §7).
 *
 * At Phase 0 it is deliberately empty: it exists to prove the app installs, appears in
 * the Google TV apps row with its banner, and launches to black without crashing. No
 * playback, no networking, no persistence, no UI. Fullscreen, landscape and the absent
 * action bar all come from the theme; the only thing that cannot be declared in XML is
 * [WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON] — a broadcast that switches itself
 * off after fifteen minutes is not a broadcast.
 */
class TvActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
}
