package expo.modules.companionserver

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface

/**
 * Phone remote server (Parent settings → Add from phone). JS starts it while
 * the panel is open and answers every request; see src/companion/handler.ts.
 */
class CompanionServerModule : Module() {
  private var server: CompanionHttpServer? = null
  private var serverSession: String? = null
  /** Sessions JS already stopped; a start that arrives late must not run. */
  private val stoppedSessions = LinkedHashSet<String>()

  override fun definition() = ModuleDefinition {
    Name("CompanionServer")

    Events("onRequest", "onStopped")

    /**
     * Starts the server for [session] (replacing any other). Resolves
     * { host, port }, or { host: null } off-LAN or when already stopped.
     */
    AsyncFunction("start") { session: String, ttlMs: Double ->
      startServer(session, ttlMs.toLong())
    }

    Function("stop") { session: String ->
      stopServer(session)
    }

    Function("respond") { id: String, status: Int, contentType: String, body: String, headers: Map<String, Any?> ->
      server?.complete(
        id,
        HttpReply(
          status = status,
          contentType = contentType,
          body = body,
          headers = headers.mapNotNull { (k, v) -> v?.let { k to it.toString() } }.toMap(),
        ),
      )
    }

    OnDestroy {
      synchronized(this@CompanionServerModule) {
        server?.stop(notify = false)
        server = null
        serverSession = null
      }
    }
  }

  @Synchronized
  private fun startServer(session: String, ttlMs: Long): Map<String, Any?> {
    val offline = mapOf("host" to null, "port" to null)
    if (session in stoppedSessions) return offline
    server?.stop(notify = false)
    server = null
    serverSession = null
    val address = lanAddress() ?: return offline
    val s = CompanionHttpServer(
      bindAddress = address,
      preferredPorts = PREFERRED_PORTS,
      ttlMs = ttlMs,
      onRequest = { req ->
        sendEvent(
          "onRequest",
          mapOf(
            "id" to req.id,
            "method" to req.method,
            "path" to req.path,
            "query" to req.query,
            "body" to req.body,
          ),
        )
      },
      onStopped = { sendEvent("onStopped", emptyMap<String, Any>()) },
    )
    s.start()
    server = s
    serverSession = session
    return mapOf("host" to address.hostAddress, "port" to s.port)
  }

  /** Stopping on purpose: JS already knows, so skip the onStopped echo. */
  @Synchronized
  private fun stopServer(session: String) {
    stoppedSessions += session
    while (stoppedSessions.size > 32) stoppedSessions.remove(stoppedSessions.first())
    if (serverSession != session) return
    server?.stop(notify = false)
    server = null
    serverSession = null
  }

  /** The TV's private IPv4 on Wi-Fi or Ethernet, preferring wlan/eth. */
  private fun lanAddress(): InetAddress? {
    val candidates = mutableListOf<Pair<String, InetAddress>>()
    for (nif in NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()) {
      if (!nif.isUp || nif.isLoopback || nif.isVirtual || nif.isPointToPoint) continue
      for (addr in nif.inetAddresses.toList()) {
        if (addr is Inet4Address && addr.isSiteLocalAddress) {
          candidates += nif.name to addr
        }
      }
    }
    return candidates.minByOrNull { (name, _) ->
      when {
        name.startsWith("wlan") -> 0
        name.startsWith("eth") -> 1
        else -> 2
      }
    }?.second
  }

  companion object {
    private val PREFERRED_PORTS = listOf(8765, 8766, 8767, 8768)
  }
}
