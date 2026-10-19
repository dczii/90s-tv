package expo.modules.phonelink

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.security.MessageDigest
import java.util.concurrent.Executors
import kotlin.text.Charsets

data class PhoneLinkResponse(val status: Int, val body: String)

/**
 * Tiny HTTP/1.1 server. HTML is served here. `/api/links`, `/api/remote`,
 * `/api/now`, and `/api/timer` are forwarded to JS.
 */
class PhoneLinkServer(
  private val token: String,
  private val html: String,
  private val onApi: (method: String, route: String, body: String, entryId: String) -> PhoneLinkResponse,
) {
  private var serverSocket: ServerSocket? = null
  @Volatile private var stopped = false
  var port: Int = 0
    private set

  private val workers = Executors.newFixedThreadPool(4) { runnable ->
    Thread(runnable, "phone-link-http").apply { isDaemon = true }
  }

  fun start(): Int {
    var bound: ServerSocket? = null
    var chosen = 0
    for (candidate in PORT_START..PORT_END) {
      try {
        val socket = ServerSocket()
        socket.reuseAddress = true
        socket.bind(InetSocketAddress(candidate))
        bound = socket
        chosen = candidate
        break
      } catch (_: IOException) {
        continue
      }
    }
    val listening = bound ?: throw IOException("No free port for phone link")
    serverSocket = listening
    port = chosen
    Thread({ acceptLoop(listening) }, "phone-link-accept").apply { isDaemon = true }.start()
    return chosen
  }

  fun close() {
    stopped = true
    try {
      serverSocket?.close()
    } catch (_: IOException) {
      // already closed
    }
    workers.shutdownNow()
  }

  private fun acceptLoop(listening: ServerSocket) {
    while (!stopped) {
      val client = try {
        listening.accept()
      } catch (_: IOException) {
        break
      }
      workers.execute {
        try {
          handle(client)
        } catch (_: Exception) {
          // client went away or the request was unreadable
        } finally {
          try {
            client.close()
          } catch (_: IOException) {
            // ignore
          }
        }
      }
    }
  }

  private fun handle(client: Socket) {
    client.soTimeout = 8_000
    val request = readRequest(client.getInputStream()) ?: run {
      write(client, 400, "text/plain; charset=utf-8", "Bad request")
      return
    }
    client.soTimeout = 0
    val action = parseAction(request.target)
    when (action) {
      Action.NotFound -> write(client, 404, "text/plain; charset=utf-8", "Not found")
      Action.Page -> {
        if (request.method != "GET" && request.method != "HEAD") {
          write(client, 405, "text/plain; charset=utf-8", "Method not allowed")
        } else if (request.method == "HEAD") {
          write(client, 200, "text/html; charset=utf-8", "")
        } else {
          write(client, 200, "text/html; charset=utf-8", html)
        }
      }
      Action.Collection -> when (request.method) {
        "GET" -> {
          val response = onApi("GET", "list", "", "")
          write(client, response.status, "application/json; charset=utf-8", response.body)
        }
        "POST" -> {
          val response = onApi("POST", "add", request.body, "")
          write(client, response.status, "application/json; charset=utf-8", response.body)
        }
        else -> write(client, 405, "text/plain; charset=utf-8", "Method not allowed")
      }
      is Action.Item -> if (request.method == "DELETE") {
        val response = onApi("DELETE", "remove", "", action.entryId)
        write(client, response.status, "application/json; charset=utf-8", response.body)
      } else {
        write(client, 405, "text/plain; charset=utf-8", "Method not allowed")
      }
      Action.Remote -> if (request.method == "GET") {
        val response = onApi("GET", "remote", "", "")
        write(client, response.status, "application/json; charset=utf-8", response.body)
      } else {
        write(client, 405, "text/plain; charset=utf-8", "Method not allowed")
      }
      Action.Now -> when (request.method) {
        "GET" -> {
          val response = onApi("GET", "now", "", "")
          write(client, response.status, "application/json; charset=utf-8", response.body)
        }
        "PUT" -> {
          val response = onApi("PUT", "now", request.body, "")
          write(client, response.status, "application/json; charset=utf-8", response.body)
        }
        else -> write(client, 405, "text/plain; charset=utf-8", "Method not allowed")
      }
      Action.Timer -> if (request.method == "PUT") {
        val response = onApi("PUT", "timer", request.body, "")
        write(client, response.status, "application/json; charset=utf-8", response.body)
      } else {
        write(client, 405, "text/plain; charset=utf-8", "Method not allowed")
      }
    }
  }

  private fun parseAction(target: String): Action {
    val path = target.substringBefore("?").substringBefore("#")
    val parts = path.split("/").filter { it.isNotEmpty() }
    if (parts.size < 2 || parts[0] != "s") return Action.NotFound
    if (!tokenMatches(decode(parts[1]), token)) return Action.NotFound
    if (parts.size == 2) return Action.Page
    if (parts.size == 4 && parts[2] == "api") {
      return when (parts[3]) {
        "links" -> Action.Collection
        "remote" -> Action.Remote
        "now" -> Action.Now
        "timer" -> Action.Timer
        else -> Action.NotFound
      }
    }
    if (parts.size == 5 && parts[2] == "api" && parts[3] == "links") {
      return Action.Item(decode(parts[4]))
    }
    return Action.NotFound
  }

  private sealed class Action {
    data object NotFound : Action()
    data object Page : Action()
    data object Collection : Action()
    data class Item(val entryId: String) : Action()
    data object Remote : Action()
    data object Now : Action()
    data object Timer : Action()
  }

  private fun readRequest(input: InputStream): RawRequest? {
    val header = readUntilHeaderEnd(input) ?: return null
    val lines = header.split("\r\n")
    if (lines.isEmpty()) return null
    val requestParts = lines[0].split(" ")
    if (requestParts.size < 2) return null
    val method = requestParts[0].uppercase()
    val target = requestParts[1]
    var contentLength = 0
    for (line in lines.drop(1)) {
      val colon = line.indexOf(':')
      if (colon <= 0) continue
      val name = line.substring(0, colon).trim()
      if (name.equals("Content-Length", ignoreCase = true)) {
        contentLength = line.substring(colon + 1).trim().toIntOrNull() ?: return null
      }
    }
    if (contentLength < 0 || contentLength > MAX_BODY) return null
    val body = if (contentLength == 0) "" else readBody(input, contentLength) ?: return null
    return RawRequest(method, target, body)
  }

  private fun readUntilHeaderEnd(input: InputStream): String? {
    val out = ByteArrayOutputStream()
    val pattern = byteArrayOf(13, 10, 13, 10)
    var matched = 0
    while (out.size() <= MAX_HEADER) {
      val value = input.read()
      if (value < 0) return null
      out.write(value)
      if (value.toByte() == pattern[matched]) {
        matched += 1
        if (matched == pattern.size) {
          return out.toString(Charsets.ISO_8859_1.name())
        }
      } else {
        matched = if (value.toByte() == pattern[0]) 1 else 0
      }
    }
    return null
  }

  private fun readBody(input: InputStream, length: Int): String? {
    val bytes = ByteArray(length)
    var read = 0
    while (read < length) {
      val n = input.read(bytes, read, length - read)
      if (n < 0) return null
      read += n
    }
    return String(bytes, Charsets.UTF_8)
  }

  private fun write(client: Socket, status: Int, contentType: String, body: String) {
    val payload = body.toByteArray(Charsets.UTF_8)
    val reason = when (status) {
      200 -> "OK"
      201 -> "Created"
      400 -> "Bad Request"
      404 -> "Not Found"
      405 -> "Method Not Allowed"
      409 -> "Conflict"
      500 -> "Internal Server Error"
      503 -> "Service Unavailable"
      504 -> "Gateway Timeout"
      else -> "Error"
    }
    val head = buildString {
      append("HTTP/1.1 ")
      append(status)
      append(' ')
      append(reason)
      append("\r\nContent-Type: ")
      append(contentType)
      append("\r\nContent-Length: ")
      append(payload.size)
      append("\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n")
    }
    val out = client.getOutputStream()
    out.write(head.toByteArray(Charsets.US_ASCII))
    out.write(payload)
    out.flush()
  }

  private data class RawRequest(val method: String, val target: String, val body: String)

  companion object {
    const val PORT_START = 8765
    const val PORT_END = 8774
    private const val MAX_HEADER = 8192
    private const val MAX_BODY = 8192

    private fun decode(value: String): String =
      URLDecoder.decode(value, Charsets.UTF_8.name())

    private fun tokenMatches(given: String, expected: String): Boolean {
      val left = given.toByteArray(Charsets.UTF_8)
      val right = expected.toByteArray(Charsets.UTF_8)
      if (left.size != right.size || left.isEmpty()) {
        MessageDigest.isEqual(right, right)
        return false
      }
      return MessageDigest.isEqual(left, right)
    }
  }
}
