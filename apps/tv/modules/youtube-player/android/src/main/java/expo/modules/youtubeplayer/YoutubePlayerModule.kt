package expo.modules.youtubeplayer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class YoutubePlayerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("YoutubePlayer")

    Function("moveTaskToBack") {
      val activity = appContext.currentActivity ?: return@Function false
      activity.moveTaskToBack(true)
      true
    }

    View(YoutubePlayerView::class) {
      Events("onPlayerEvent")

      AsyncFunction("attach") { view: YoutubePlayerView ->
        view.attach()
      }

      AsyncFunction("loadVideo") { view: YoutubePlayerView, videoId: String ->
        view.loadVideo(videoId)
      }

      AsyncFunction("pause") { view: YoutubePlayerView ->
        view.pausePlayer()
      }

      AsyncFunction("stop") { view: YoutubePlayerView ->
        view.stopPlayer()
      }

      AsyncFunction("detachAndDestroy") { view: YoutubePlayerView ->
        view.detachAndDestroy()
      }

      AsyncFunction("onHostPause") { view: YoutubePlayerView ->
        view.onHostPause()
      }

      AsyncFunction("onHostResume") { view: YoutubePlayerView ->
        view.onHostResume()
      }

      AsyncFunction("currentGeneration") { view: YoutubePlayerView ->
        view.currentGeneration()
      }

      // Fast Refresh / unexpected unmount safety (RN-D21 / YT-D22).
      OnViewDestroys { view: YoutubePlayerView ->
        view.detachAndDestroy()
      }
    }
  }
}
