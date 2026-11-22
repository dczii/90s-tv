package expo.modules.phonelink

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

class PhoneLinkModule : Module() {
  private val pending = ConcurrentHashMap<String, CompletableFuture<PhoneLinkResponse>>()
  private val mainHandler = Handler(Looper.getMainLooper())
  private var server: PhoneLinkServer? = null
  private var runningToken: String? = null

  override fun definition() = ModuleDefinition {
    Name("PhoneLink")

    Events("onHttpRequest")

    Function("start") { token: String ->
      if (token.isEmpty()) {
        throw IllegalArgumentException("Phone link token is empty")
      }
      val current = server
      val port = if (current != null && runningToken == token && current.port > 0) {
        current.port
      } else {
        stopServer()
        val html = loadHtml()
        val next = PhoneLinkServer(token, html, ::dispatch)
        val bound = next.start()
        server = next
        runningToken = token
        bound
      }
      mapOf("port" to port)
    }

    Function("stop") {
      stopServer()
    }

    Function("lanIpv4") {
      lanIpv4()
    }

    Function("respond") { id: String, status: Int, body: String ->
      pending.remove(id)?.complete(PhoneLinkResponse(status, body)) == true
    }
  }

  private fun dispatch(
    method: String,
    route: String,
    body: String,
    entryId: String,
  ): PhoneLinkResponse {
    val id = UUID.randomUUID().toString()
    val future = CompletableFuture<PhoneLinkResponse>()
    pending[id] = future
    val payload = mapOf(
      "id" to id,
      "method" to method,
      "route" to route,
      "body" to body,
      "entryId" to entryId,
    )
    mainHandler.post {
      sendEvent("onHttpRequest", payload)
    }
    return try {
      future.get(8, TimeUnit.SECONDS)
    } catch (_: TimeoutException) {
      pending.remove(id)
      PhoneLinkResponse(504, """{"error":"The TV took too long."}""")
    } catch (_: Exception) {
      pending.remove(id)
      PhoneLinkResponse(500, """{"error":"Could not update the list."}""")
    }
  }

  private fun stopServer() {
    val waiting = pending.values.toList()
    pending.clear()
    val closed = PhoneLinkResponse(503, """{"error":"LittlePlay is not in the foreground."}""")
    waiting.forEach { it.complete(closed) }
    server?.close()
    server = null
    runningToken = null
  }

  private fun loadHtml(): String {
    val context = appContext.reactContext
      ?: throw IllegalStateException("React context lost")
    val html = context.assets.open("phone-link.html").bufferedReader().use { it.readText() }
    return html.replace("{{APP_VERSION}}", htmlEscape(appVersionLabel(context)))
  }

  /** Same shape as Parent settings: versionName and versionCode, e.g. "1.2.9 (17)". */
  @Suppress("DEPRECATION")
  private fun appVersionLabel(context: Context): String {
    val info = context.packageManager.getPackageInfo(context.packageName, 0)
    val name = info.versionName?.trim().orEmpty().ifEmpty { "Unknown" }
    val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      info.longVersionCode
    } else {
      @Suppress("DEPRECATION")
      info.versionCode.toLong()
    }
    return "$name ($code)"
  }

  private fun htmlEscape(value: String): String {
    return value
      .replace("&", "&amp;")
      .replace("<", "&lt;")
      .replace(">", "&gt;")
  }

  private fun lanIpv4(): String {
    val candidates = mutableListOf<Pair<Int, String>>()
    val interfaces = NetworkInterface.getNetworkInterfaces() ?: return ""
    for (nif in interfaces) {
      if (!nif.isUp || nif.isLoopback) continue
      val name = nif.name.lowercase()
      val rank = when {
        name.startsWith("wlan") || name.startsWith("wifi") -> 0
        name.startsWith("eth") || name.startsWith("en") -> 1
        else -> 2
      }
      for (addr in nif.inetAddresses) {
        if (addr is Inet4Address && addr.isSiteLocalAddress) {
          val host = addr.hostAddress ?: continue
          candidates.add(rank to host)
        }
      }
    }
    return candidates.minByOrNull { it.first }?.second ?: ""
  }
}
