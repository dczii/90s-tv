/**
 * The phone page served by the TV (companion server). Single self-contained
 * document: inline CSS + JS, images only from i.ytimg.com (see PAGE_CSP).
 * All server data is rendered with textContent, never innerHTML.
 */
export function companionPageHtml(): string {
  return PAGE;
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0A101C">
<title>LittlePlay · Parent remote</title>
<style>
  :root {
    --navy:#0A101C; --panel:#121C2B; --panel2:#192638; --text:#F5F2EA;
    --muted:#94A3B8; --coral:#FF7657; --amber:#F8C65D; --green:#65D6A6;
    --danger:#FF9A83; --line:rgba(255,255,255,.10); --line2:rgba(255,255,255,.20);
  }
  * { box-sizing:border-box; }
  html,body { margin:0; background:var(--navy); color:var(--text);
    font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    -webkit-text-size-adjust:100%; }
  main { max-width:560px; margin:0 auto;
    padding:20px 16px calc(96px + env(safe-area-inset-bottom)); }
  header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:20px; }
  .brand { font-size:13px; font-weight:700; letter-spacing:.08em; color:var(--coral); text-transform:uppercase; }
  h1 { margin:2px 0 0; font-size:24px; line-height:1.2; }
  .pill { flex:none; display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:999px;
    background:var(--panel2); color:var(--muted); font-size:13px; font-weight:600; }
  .pill::before { content:""; width:8px; height:8px; border-radius:50%; background:var(--muted); }
  .pill.ok { color:var(--green); } .pill.ok::before { background:var(--green); }
  .pill.bad { color:var(--danger); } .pill.bad::before { background:var(--danger); }
  section { background:var(--panel); border:1px solid var(--line); border-radius:20px; padding:18px 16px; margin-bottom:16px; }
  h2 { margin:0 0 4px; font-size:13px; font-weight:700; letter-spacing:.08em; color:var(--muted); text-transform:uppercase; }
  .sub { margin:0 0 14px; color:var(--muted); font-size:14px; }
  .now { margin:0 0 14px; font-size:15px; }
  .now b { font-variant-numeric:tabular-nums; }
  .steppers { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .stepper { min-width:0; background:var(--panel2); border-radius:16px; padding:12px; border-top:4px solid var(--amber); }
  .stepper.break { border-top-color:var(--green); }
  .stepper label { display:block; font-size:14px; color:var(--muted); font-weight:600; margin-bottom:8px; }
  .row { display:flex; align-items:center; gap:4px; }
  .row input { flex:1; min-width:0; width:100%; text-align:center; font:700 28px/1 system-ui,sans-serif;
    font-variant-numeric:tabular-nums; color:var(--text); background:transparent; border:0; padding:6px 0;
    -moz-appearance:textfield; appearance:textfield; }
  .row input::-webkit-outer-spin-button, .row input::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
  .row input:focus { outline:2px solid var(--coral); border-radius:8px; }
  .unit { text-align:center; color:var(--muted); font-size:13px; margin-top:2px; }
  button { font:inherit; font-weight:700; color:var(--text); border:0; cursor:pointer; -webkit-tap-highlight-color:transparent; }
  button:disabled { opacity:.45; cursor:default; }
  button:focus-visible, input:focus-visible { outline:3px solid var(--coral); outline-offset:2px; }
  .round { flex:none; width:40px; height:40px; border-radius:50%; background:var(--navy); font-size:22px; line-height:1; }
  .round:active { background:var(--line2); }
  .primary { background:var(--coral); color:var(--navy); border-radius:14px; padding:14px 18px; min-height:48px; }
  .primary:active { filter:brightness(.92); }
  .wide { width:100%; margin-top:14px; }
  .shows { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
  .show { position:relative; min-width:0; display:flex; flex-direction:column; justify-content:flex-start; text-align:left; background:var(--panel2); border:3px solid var(--line);
    border-radius:16px; padding:8px; color:var(--text); }
  .show[aria-pressed="true"] { border-color:var(--coral); }
  .show img, .thumb { display:block; width:100%; aspect-ratio:16/9; object-fit:cover; border-radius:10px; background:var(--navy); }
  .show .t { display:block; margin-top:8px; font-size:15px; font-weight:700; line-height:1.25; }
  .show .d { display:block; margin-top:2px; font-size:12px; font-weight:500; color:var(--muted);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .check { position:absolute; top:14px; right:14px; width:28px; height:28px; border-radius:50%;
    display:grid; place-items:center; background:rgba(10,16,28,.75); border:2px solid var(--line2); font-size:15px; }
  .show[aria-pressed="true"] .check { background:var(--coral); border-color:var(--coral); color:var(--navy); }
  form { display:flex; gap:8px; }
  form input { flex:1; min-width:0; font:inherit; font-size:16px; color:var(--text); background:var(--panel2);
    border:2px solid var(--line); border-radius:14px; padding:12px 14px; }
  form input:focus { outline:none; border-color:var(--coral); }
  form input::placeholder { color:var(--muted); }
  .paste { background:var(--panel2); border-radius:14px; padding:0 14px; min-height:48px; }
  ul { list-style:none; margin:14px 0 0; padding:0; }
  li { display:flex; align-items:center; gap:12px; padding:10px 0; border-top:1px solid var(--line); }
  li .thumb { width:96px; flex:none; }
  li .meta { flex:1; min-width:0; }
  li .t { font-weight:700; font-size:15px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  li .k { color:var(--muted); font-size:12px; margin-top:2px; }
  .remove { flex:none; background:transparent; color:var(--danger); padding:10px 8px; font-size:14px; }
  .empty { color:var(--muted); font-size:14px; margin:14px 0 0; }
  .toast { position:fixed; left:16px; right:16px; bottom:calc(16px + env(safe-area-inset-bottom));
    max-width:528px; margin:0 auto; padding:14px 16px; border-radius:14px; background:var(--panel2);
    border:1px solid var(--line2); box-shadow:0 8px 24px rgba(0,0,0,.4); font-size:15px;
    transform:translateY(140%); visibility:hidden; transition:transform .2s ease-out, visibility 0s .2s; }
  .toast.show { transform:none; visibility:visible; transition:transform .2s ease-out; }
  .toast.err { border-color:var(--danger); color:var(--danger); }
  .offline { display:none; background:#311A1B; color:var(--danger); border-radius:14px; padding:12px 14px;
    margin-bottom:16px; font-size:14px; }
  .offline.show { display:block; }
  @media (prefers-reduced-motion: reduce) { .toast { transition:none; } }
</style>
</head>
<body>
<main>
  <header>
    <div>
      <div class="brand">LittlePlay</div>
      <h1>Parent remote</h1>
    </div>
    <span id="status" class="pill" role="status">Connecting…</span>
  </header>

  <div id="offline" class="offline" role="alert">
    Can't reach the TV. Make sure your phone is on the same Wi‑Fi and
    <b>Add from phone</b> is still open in Parent settings on the TV.
  </div>

  <section aria-labelledby="timer-h">
    <h2 id="timer-h">Timer</h2>
    <p id="now" class="now">&nbsp;</p>
    <div class="steppers">
      <div class="stepper">
        <label for="watch">Watch time</label>
        <div class="row">
          <button class="round" type="button" data-step="watch" data-d="-1" aria-label="Less watch time">−</button>
          <input id="watch" type="number" inputmode="numeric" pattern="[0-9]*">
          <button class="round" type="button" data-step="watch" data-d="1" aria-label="More watch time">+</button>
        </div>
        <div class="unit">minutes</div>
      </div>
      <div class="stepper break">
        <label for="rest">Break time</label>
        <div class="row">
          <button class="round" type="button" data-step="rest" data-d="-1" aria-label="Less break time">−</button>
          <input id="rest" type="number" inputmode="numeric" pattern="[0-9]*">
          <button class="round" type="button" data-step="rest" data-d="1" aria-label="More break time">+</button>
        </div>
        <div class="unit">minutes</div>
      </div>
    </div>
    <button id="saveTimer" class="primary wide" type="button" disabled>Save timer</button>
  </section>

  <section aria-labelledby="shows-h">
    <h2 id="shows-h">Shows</h2>
    <p class="sub">Tap to add or remove a show on the TV.</p>
    <div id="shows" class="shows"></div>
  </section>

  <section aria-labelledby="links-h">
    <h2 id="links-h">YouTube links</h2>
    <p class="sub">Paste a video or playlist link from the YouTube app.</p>
    <form id="addForm" autocomplete="off" novalidate>
      <input id="link" type="text" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="https://youtu.be/…" aria-label="YouTube link" enterkeyhint="go">
      <button id="addBtn" class="primary" type="submit">Add</button>
    </form>
    <ul id="links"></ul>
    <p id="noLinks" class="empty" hidden>No links yet.</p>
  </section>
</main>
<div id="toast" class="toast" role="status" aria-live="polite"></div>

<script>
(function () {
  "use strict";
  var token = new URLSearchParams(location.search).get("t") || "";
  var $ = function (id) { return document.getElementById(id); };
  var state = null;
  var timerDirty = false;
  var busy = false;
  var toastTimer = 0;

  function api(path, body) {
    var opts = body === undefined
      ? { method: "GET", cache: "no-store" }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    return fetch(path + "?t=" + encodeURIComponent(token), opts).then(function (res) {
      return res.json().catch(function () { return { ok: false, message: "Unexpected reply from the TV." }; })
        .then(function (data) {
          setOnline(true);
          if (res.status === 403) setExpired();
          if (!res.ok || data.ok === false) throw new Error(data.message || "Something went wrong.");
          return data;
        });
    }, function () {
      setOnline(false);
      throw new Error("Can't reach the TV.");
    });
  }

  function setOnline(ok) {
    $("offline").classList.toggle("show", !ok);
    var s = $("status");
    s.className = "pill " + (ok ? "ok" : "bad");
    s.textContent = ok ? "Connected to TV" : "Not connected";
  }

  function setExpired() {
    var s = $("status");
    s.className = "pill bad";
    s.textContent = "Link expired";
    clearInterval(poll);
  }

  function toast(msg, isErr) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.toggle("err", !!isErr);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3500);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function img(src, cls) {
    var i = el("img", cls);
    i.alt = "";
    i.loading = "lazy";
    i.referrerPolicy = "no-referrer";
    // Keep the 16:9 box when a thumbnail can't load (offline, removed).
    i.onerror = function () { if (i.parentNode) i.parentNode.replaceChild(el("div", "thumb"), i); };
    if (src) i.src = src.replace("/hqdefault.jpg", "/mqdefault.jpg");
    return i;
  }

  function fmt(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function clamp(v, range) {
    v = Math.round(Number(v));
    if (!isFinite(v)) v = range[0];
    return Math.min(range[1], Math.max(range[0], v));
  }

  function renderTimer() {
    var t = state.timer;
    var now = $("now");
    now.textContent = "";
    if (t.phase === "Playing" || t.phase === "Resting") {
      now.appendChild(document.createTextNode(t.phase === "Playing" ? "Watching now · " : "On a break · "));
      now.appendChild(el("b", null, fmt(t.remainingMs)));
      now.appendChild(document.createTextNode(" left"));
    } else if (t.phase === "AwaitingConfirmation") {
      now.textContent = "Waiting for Continue watching on the TV.";
    } else {
      now.textContent = "Finish setup on the TV first.";
    }
    if (!timerDirty) {
      $("watch").value = t.watchMin == null ? "" : t.watchMin;
      $("rest").value = t.restMin == null ? "" : t.restMin;
    }
    var w = $("watch"), r = $("rest");
    w.min = t.watchRange[0]; w.max = t.watchRange[1];
    r.min = t.restRange[0]; r.max = t.restRange[1];
    $("saveTimer").disabled = !timerDirty || t.watchMin == null;
  }

  function renderShows() {
    var box = $("shows");
    box.textContent = "";
    state.shows.forEach(function (s) {
      var b = el("button", "show");
      b.type = "button";
      b.setAttribute("aria-pressed", s.selected ? "true" : "false");
      b.appendChild(img(s.thumbnailUrl));
      b.appendChild(el("span", "check", s.selected ? "✓" : ""));
      b.appendChild(el("span", "t", s.title));
      b.appendChild(el("span", "d", s.description));
      b.addEventListener("click", function () {
        mutate("/api/shows", { id: s.id, selected: !s.selected },
          (s.selected ? "Removed " : "Added ") + s.title);
      });
      box.appendChild(b);
    });
  }

  function renderLinks() {
    var list = $("links");
    list.textContent = "";
    state.links.forEach(function (l) {
      var li = el("li");
      li.appendChild(l.thumbnailUrl ? img(l.thumbnailUrl, "thumb") : el("div", "thumb"));
      var meta = el("div", "meta");
      meta.appendChild(el("div", "t", l.title));
      meta.appendChild(el("div", "k", l.kind === "Playlist" ? "Playlist" : "Video"));
      li.appendChild(meta);
      var rm = el("button", "remove", "Remove");
      rm.type = "button";
      rm.setAttribute("aria-label", "Remove " + l.title);
      rm.addEventListener("click", function () {
        if (confirm("Remove \\u201C" + l.title + "\\u201D from the TV?")) {
          mutate("/api/remove", { id: l.id }, "Removed " + l.title);
        }
      });
      li.appendChild(rm);
      list.appendChild(li);
    });
    $("noLinks").hidden = state.links.length > 0;
  }

  function render(data) {
    state = data;
    renderTimer();
    renderShows();
    renderLinks();
  }

  function refresh() {
    if (busy || document.hidden) return;
    api("/api/state").then(render, function () {});
  }

  function mutate(path, body, okMsg) {
    busy = true;
    return api(path, body).then(function (data) {
      render(data);
      toast(data.notice || okMsg);
    }, function (e) {
      toast(e.message, true);
      throw e;
    }).finally(function () { busy = false; });
  }

  document.querySelectorAll("[data-step]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!state) return;
      var key = b.getAttribute("data-step");
      var input = $(key);
      var range = key === "watch" ? state.timer.watchRange : state.timer.restRange;
      input.value = clamp(Number(input.value) + Number(b.getAttribute("data-d")), range);
      timerDirty = true;
      renderTimer();
    });
  });
  ["watch", "rest"].forEach(function (id) {
    $(id).addEventListener("input", function () { timerDirty = true; renderTimer(); });
    $(id).addEventListener("blur", function () {
      if (!state) return;
      var range = id === "watch" ? state.timer.watchRange : state.timer.restRange;
      $(id).value = clamp($(id).value, range);
    });
  });
  $("saveTimer").addEventListener("click", function () {
    var w = clamp($("watch").value, state.timer.watchRange);
    var r = clamp($("rest").value, state.timer.restRange);
    timerDirty = false;
    mutate("/api/timer", { watchMin: w, restMin: r },
      "Timer saved: " + w + " min watch, " + r + " min break").catch(function () { timerDirty = true; renderTimer(); });
  });

  $("addForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = $("link");
    var value = input.value.trim();
    if (!value) { toast("Paste a YouTube link first.", true); return; }
    $("addBtn").disabled = true;
    $("addBtn").textContent = "Adding…";
    mutate("/api/links", { input: value }, "Added to the TV").then(function () {
      input.value = "";
    }, function () {}).finally(function () {
      $("addBtn").disabled = false;
      $("addBtn").textContent = "Add";
    });
  });

  var poll = setInterval(refresh, 4000);
  document.addEventListener("visibilitychange", refresh);
  api("/api/state").then(render, function () {});
})();
</script>
</body>
</html>
`;
