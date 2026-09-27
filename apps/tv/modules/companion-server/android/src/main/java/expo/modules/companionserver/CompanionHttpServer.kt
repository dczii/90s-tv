package expo.modules.companionserver

import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/** A request handed to JS; JS answers through [CompanionHttpServer.complete]. */
data class PendingRequest(
  val id: String,
  val method: String,
  val path: String,
  val query: String,
  val body: String,
)

data class HttpReply(
  val status: Int,
  val contentType: String,
  val body: String,
  val headers: Map<String, String>,
)

/**
 * Tiny one-request-per-connection HTTP/1.1 server for the phone remote.
 * Binds to the TV's LAN address only, accepts only LAN peers, caps sizes,
 * rate-limits, and forwards each request to JS (which owns all logic and
 * checks the session token). Stops itself after [ttlMs].
 */
class CompanionHttpServer(
  private val bindAddress: InetAddress,
  private val preferredPorts: List<Int>,
  private val ttlMs: Long,
  private val onRequest: (PendingRequest) -> Unit,
  private val onStopped: () -> Unit,
) {
  private val pending = ConcurrentHashMap<String, Pair<CountDownLatch, Array<HttpReply?>>>()
  // Bounded: a flood of idle sockets gets 503s instead of queueing forever.
  private val workers = ThreadPoolExecutor(
    MAX_WORKERS, MAX_WORKERS, 0L, TimeUnit.MILLISECONDS,
    ArrayBlockingQueue(MAX_QUEUED),
  )
  private var socket: ServerSocket? = null
  private var acceptThread: Thread? = null
  @Volatile private var running = false
  /** elapsed-time deadline (nanoTime): immune to wall-clock changes. */
  @Volatile private var deadlineNanos = 0L

  /** Per-peer token buckets: one noisy device can't starve the parent's phone. */
  private val buckets = HashMap<InetAddress, DoubleArray>()

  val port: Int get() = socket?.localPort ?: -1

  fun start() {
    val server = ServerSocket()
    server.reuseAddress = true
    var bound = false
    for (p in preferredPorts + 0) {
      try {
        server.bind(InetSocketAddress(bindAddress, p), BACKLOG)
        bound = true
        break
      } catch (_: SocketException) {
        // taken; try the next one
      }
    }
    if (!bound) {
      server.close()
      throw IllegalStateException("No free port")
    }
    socket = server
    server.soTimeout = ACCEPT_POLL_MS
    running = true
    deadlineNanos = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(ttlMs)
    acceptThread = Thread({ acceptLoop(server) }, "companion-accept").apply {
      isDaemon = true
      start()
    }
  }

  /** [notify] false when JS asked for the stop and needs no onStopped echo. */
  @Synchronized
  fun stop(notify: Boolean = true) {
    if (!running) return
    running = false
    try { socket?.close() } catch (_: Exception) {}
    socket = null
    // Release waiting workers first so they answer 504 instead of resetting.
    for ((_, entry) in pending) entry.first.countDown()
    workers.shutdown()
    if (notify) {
      try { onStopped() } catch (_: Exception) {}
    }
  }

  fun complete(id: String, reply: HttpReply) {
    val entry = pending[id] ?: return
    entry.second[0] = reply
    entry.first.countDown()
  }

  private fun acceptLoop(server: ServerSocket) {
    while (running) {
      if (System.nanoTime() - deadlineNanos > 0) {
        stop()
        return
      }
      val client = try {
        server.accept()
      } catch (_: java.net.SocketTimeoutException) {
        continue
      } catch (_: Exception) {
        if (running) stop()
        return
      }
      try {
        workers.execute { serve(client) }
      } catch (_: RejectedExecutionException) {
        try {
          client.soTimeout = READ_TIMEOUT_MS
          write(client.getOutputStream(), text(503, "The TV is busy. Try again."))
        } catch (_: Exception) {}
        closeQuietly(client)
      } catch (_: Exception) {
        closeQuietly(client)
      }
    }
  }

  private fun allowPeer(addr: InetAddress?): Boolean =
    addr != null && (addr.isSiteLocalAddress || addr.isLinkLocalAddress || addr.isLoopbackAddress)

  @Synchronized
  private fun takeToken(peer: InetAddress): Boolean {
    val now = System.nanoTime()
    if (buckets.size > MAX_PEERS && peer !in buckets) buckets.clear()
    // [tokens, lastRefillNanos]
    val b = buckets.getOrPut(peer) { doubleArrayOf(RATE_BURST.toDouble(), now.toDouble()) }
    val refill = (now - b[1]) / 1e9 * RATE_PER_SEC
    b[0] = minOf(RATE_BURST.toDouble(), b[0] + refill)
    b[1] = now.toDouble()
    if (b[0] < 1.0) return false
    b[0] -= 1.0
    return true
  }

  private fun serve(client: Socket) {
    client.use { s ->
      try {
        s.soTimeout = READ_TIMEOUT_MS
        val out = s.getOutputStream()
        if (!allowPeer(s.inetAddress)) return
        if (!takeToken(s.inetAddress)) {
          write(out, text(429, "Too many requests. Slow down."))
          return
        }
        val input = BufferedInputStream(s.getInputStream())
        // Whole-request deadline; soTimeout alone lets a slow drip hold a worker.
        val readBy = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(REQUEST_READ_MS)
        val head = readHead(input, readBy) ?: run {
          write(out, text(400, "Bad request"))
          return
        }
        val lines = head.split("\r\n")
        val requestLine = lines.first().split(" ")
        if (requestLine.size != 3 || !requestLine[2].startsWith("HTTP/1.")) {
          write(out, text(400, "Bad request"))
          return
        }
        val method = requestLine[0]
        val target = requestLine[1]
        val headers = HashMap<String, String>()
        for (line in lines.drop(1)) {
          val colon = line.indexOf(':')
          if (colon <= 0) continue
          headers[line.substring(0, colon).trim().lowercase()] = line.substring(colon + 1).trim()
        }
        if (headers.containsKey("transfer-encoding")) {
          write(out, text(411, "Length required"))
          return
        }
        val length = headers["content-length"]?.toIntOrNull() ?: 0
        if (length < 0 || length > MAX_BODY_BYTES) {
          write(out, text(413, "Too large"))
          return
        }
        val body = readBody(input, length, readBy) ?: run {
          write(out, text(400, "Bad request"))
          return
        }
        val q = target.indexOf('?')
        val path = if (q < 0) target else target.substring(0, q)
        val query = if (q < 0) "" else target.substring(q + 1)

        val id = ids.incrementAndGet().toString()
        val latch = CountDownLatch(1)
        val slot = arrayOfNulls<HttpReply>(1)
        pending[id] = latch to slot
        try {
          onRequest(PendingRequest(id, method, path, query, body))
          if (running) latch.await(JS_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        } finally {
          pending.remove(id)
        }
        write(out, slot[0] ?: text(504, "The TV took too long to answer."))
      } catch (_: Exception) {
        // client went away or timed out; nothing to report
      }
    }
  }

  private fun readHead(input: InputStream, readBy: Long): String? {
    val buf = ByteArrayOutputStream()
    var matched = 0
    val end = byteArrayOf('\r'.code.toByte(), '\n'.code.toByte(), '\r'.code.toByte(), '\n'.code.toByte())
    while (buf.size() < MAX_HEAD_BYTES) {
      if (System.nanoTime() - readBy > 0) return null
      val b = input.read()
      if (b < 0) return null
      buf.write(b)
      matched = if (b.toByte() == end[matched]) matched + 1 else if (b.toByte() == end[0]) 1 else 0
      if (matched == 4) {
        val bytes = buf.toByteArray()
        return String(bytes, 0, bytes.size - 4, Charsets.ISO_8859_1)
      }
    }
    return null
  }

  private fun readBody(input: InputStream, length: Int, readBy: Long): String? {
    val bytes = ByteArray(length)
    var read = 0
    while (read < length) {
      if (System.nanoTime() - readBy > 0) return null
      val n = input.read(bytes, read, length - read)
      if (n < 0) return null
      read += n
    }
    return String(bytes, Charsets.UTF_8)
  }

  private fun text(status: Int, message: String) =
    HttpReply(status, "text/plain; charset=utf-8", message, emptyMap())

  private fun write(out: OutputStream, reply: HttpReply) {
    val body = reply.body.toByteArray(Charsets.UTF_8)
    val sb = StringBuilder()
    sb.append("HTTP/1.1 ").append(reply.status).append(' ').append(reason(reply.status)).append("\r\n")
    sb.append("Content-Type: ").append(safeHeader(reply.contentType)).append("\r\n")
    sb.append("Content-Length: ").append(body.size).append("\r\n")
    sb.append("Connection: close\r\n")
    for ((k, v) in reply.headers) {
      if (k.equals("content-length", true) || k.equals("connection", true)) continue
      sb.append(safeHeader(k)).append(": ").append(safeHeader(v)).append("\r\n")
    }
    sb.append("\r\n")
    out.write(sb.toString().toByteArray(Charsets.ISO_8859_1))
    out.write(body)
    out.flush()
  }

  /** Header values come from JS; strip CR/LF so nothing can split the response. */
  private fun safeHeader(v: String) = v.replace("\r", "").replace("\n", "")

  private fun reason(status: Int) = when (status) {
    200 -> "OK"
    400 -> "Bad Request"
    403 -> "Forbidden"
    404 -> "Not Found"
    405 -> "Method Not Allowed"
    409 -> "Conflict"
    411 -> "Length Required"
    413 -> "Payload Too Large"
    422 -> "Unprocessable Entity"
    429 -> "Too Many Requests"
    503 -> "Service Unavailable"
    504 -> "Gateway Timeout"
    else -> if (status >= 500) "Server Error" else "OK"
  }

  private fun closeQuietly(s: Socket) {
    try { s.close() } catch (_: Exception) {}
  }

  companion object {
    /** Unique across server instances so a late reply can't hit a new run. */
    private val ids = AtomicLong(0)
    private const val MAX_WORKERS = 4
    private const val MAX_QUEUED = 8
    private const val MAX_PEERS = 64
    private const val REQUEST_READ_MS = 5_000L
    private const val BACKLOG = 16
    private const val ACCEPT_POLL_MS = 1000
    private const val READ_TIMEOUT_MS = 10_000
    private const val JS_TIMEOUT_MS = 15_000L
    private const val MAX_HEAD_BYTES = 8 * 1024
    private const val MAX_BODY_BYTES = 16 * 1024
    private const val RATE_BURST = 30
    private const val RATE_PER_SEC = 3.0
  }
}
