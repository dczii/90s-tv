package expo.modules.youtubeplayer

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicInteger

/**
 * Custom YouTube IFrame host (YT-D20 / RN-D8 / RN-D20).
 * Origin: https://appassets.androidplatform.net/ via WebViewAssetLoader.
 * Do not use react-native-webview, file://, or loadDataWithBaseURL(youtube.com).
 */
@SuppressLint("ViewConstructor", "SetJavaScriptEnabled")
class YoutubePlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  companion object {
    private const val ASSET_URL =
      "https://appassets.androidplatform.net/assets/youtube_player.html"

    /** Navigations only — do not list media CDN hosts (Step 5 grep). */
    private val ALLOWED_HOST_SUFFIXES = listOf(
      "appassets.androidplatform.net",
      "youtube.com",
      "youtu.be",
      "google.com",
      "ytimg.com",
      "gstatic.com",
    )
  }

  private val generation = AtomicInteger(0)
  private val mainHandler = Handler(Looper.getMainLooper())
  private var webView: WebView? = null
  private var attached = false
  private var pendingVideoId: String? = null
  private var pageReady = false

  private val onPlayerEvent by EventDispatcher()

  override val shouldUseAndroidLayout: Boolean = true

  init {
    orientation = VERTICAL
  }

  fun attach() {
    mainHandler.post {
      if (attached && webView != null) return@post
      generation.incrementAndGet()
      pageReady = false
      ensureWebView()
      val wv = webView ?: return@post
      attached = true
      wv.loadUrl(ASSET_URL)
      // attachSession is sent from onPageFinished with current generation.
      requestFocusForPlayback()
    }
  }

  fun loadVideo(videoId: String) {
    mainHandler.post {
      pendingVideoId = videoId
      if (!attached || webView == null) {
        attach()
        return@post
      }
      if (pageReady) {
        evalJs("loadVideo(${JSONObject.quote(videoId)})")
      }
    }
  }

  fun pausePlayer() {
    mainHandler.post { evalJs("pause()") }
  }

  fun stopPlayer() {
    mainHandler.post { evalJs("stop()") }
  }

  /** YT-D22: main thread, idempotent. Generation bump kills in-flight events. */
  fun detachAndDestroy() {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      mainHandler.post { detachAndDestroy() }
      return
    }
    generation.incrementAndGet()
    pageReady = false
    pendingVideoId = null
    attached = false
    val wv = webView ?: return
    try {
      evalJs("destroyPlayer()")
    } catch (_: Exception) {
    }
    val parent = wv.parent as? ViewGroup
    parent?.removeView(wv)
    try {
      wv.loadUrl("about:blank")
    } catch (_: Exception) {
    }
    try {
      wv.destroy()
    } catch (_: Exception) {
    }
    webView = null
  }

  fun onHostPause() {
    mainHandler.post {
      try {
        webView?.onPause()
        evalJs("pause()")
      } catch (_: Exception) {
      }
    }
  }

  fun onHostResume() {
    mainHandler.post {
      try {
        webView?.onResume()
        requestFocusForPlayback()
      } catch (_: Exception) {
      }
    }
  }

  fun currentGeneration(): Int = generation.get()

  private fun ensureWebView() {
    if (webView != null) return
    val assetLoader = WebViewAssetLoader.Builder()
      .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
      .build()

    val wv = WebView(context)
    wv.settings.javaScriptEnabled = true
    wv.settings.domStorageEnabled = true
    wv.settings.mediaPlaybackRequiresUserGesture = false
    wv.isFocusable = true
    wv.isFocusableInTouchMode = true
    wv.addJavascriptInterface(JsBridge(), "NativeBridge")
    wv.webViewClient = object : WebViewClient() {
      override fun shouldInterceptRequest(
        view: WebView,
        request: WebResourceRequest,
      ) = assetLoader.shouldInterceptRequest(request.url)

      override fun onPageFinished(view: WebView, url: String) {
        if (!attached || webView !== view) return
        if (url.startsWith("about:")) return
        val g = generation.get()
        pageReady = true
        view.evaluateJavascript("attachSession($g)", null)
        pendingVideoId?.let { id ->
          view.evaluateJavascript("loadVideo(${JSONObject.quote(id)})", null)
        }
      }

      override fun shouldOverrideUrlLoading(
        view: WebView,
        request: WebResourceRequest,
      ): Boolean {
        val host = request.url.host ?: return true
        return !isAllowedHost(host)
        // true = block. Never ACTION_VIEW / Intent to YouTube app.
      }
    }

    addView(
      wv,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
    )
    webView = wv
  }

  private fun isAllowedHost(host: String): Boolean {
    val h = host.lowercase()
    return ALLOWED_HOST_SUFFIXES.any { suffix ->
      h == suffix || h.endsWith(".$suffix")
    }
  }

  private fun evalJs(script: String) {
    webView?.evaluateJavascript(script, null)
  }

  private fun requestFocusForPlayback() {
    webView?.requestFocus()
  }

  private inner class JsBridge {
    @JavascriptInterface
    fun onPlayerEvent(json: String) {
      // Binder thread → main before emitting / reading generation.
      mainHandler.post {
        try {
          val obj = JSONObject(json)
          val eventGen = obj.optInt("generation", -1)
          if (eventGen != generation.get()) return@post
          onPlayerEvent(
            mapOf(
              "type" to obj.optString("type"),
              "generation" to eventGen,
              "state" to obj.optString("state", ""),
              "code" to obj.optInt("code", -1),
              "raw" to json,
            ),
          )
        } catch (_: Exception) {
        }
      }
    }
  }
}
