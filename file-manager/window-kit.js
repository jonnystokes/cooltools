/* window-kit.js: open one of Jon's pages in a floating window inside another page, and pick files from the file
   manager through it. ONE source: Projects\file-manager\kit\window-kit.js (pages copy it in at build time, or load
   https://jonnystokes.github.io/Cool-tools/file-manager/window-kit.js). The protocol and an example: kit\README.md.

   Host side (the page that opens the window):
     const win = WindowKit.open(url, { title, name, width, height, onClose });   // a floating window with the page
     const got = await WindowKit.pick(fileManagerUrl, { accept: [".zip"], folder: "files" });  // null = cancelled
   The window: drag by its title bar, resize from every edge and corner, maximise (button or double-click the
   title), close (button or Escape); its size and place are remembered per name. On a phone it is a full-screen
   sheet, and the phone's Back button closes it. Every message is checked: it must come from the window's own
   frame and from the origin of the address it opened.
   Child side (the page inside): WindowKit.child.ready(), .title(text), .close(), .busy(why), .onPick(handler); it accepts
   requests only from its parent frame, from an allowed origin (Jon's pages on jonnystokes.github.io, its own
   origin, local file pages), and refuses to run inside any other site (location.ancestorOrigins). */
(function (root) {
  "use strict";
  const VERSION = 1;
  const MIN_W = 320, MIN_H = 220, MARGIN = 8, HEAD = 40;
  const SHEET = "(max-width: 640px), (max-height: 480px) and (pointer: coarse)";
  const KEY = "wk-win:";
  const wins = [];
  let z = 2147482000, styled = false, seq = 0;

  function css() {
    if (styled) return;
    styled = true;
    const s = document.createElement("style");
    s.textContent = `
.wk-win{position:fixed;z-index:2147482000;display:flex;flex-direction:column;box-sizing:border-box;background:#fff;color:#171c28;border:1px solid rgba(15,23,42,.14);border-radius:12px;box-shadow:0 18px 50px rgba(15,23,42,.3),0 2px 8px rgba(15,23,42,.16);overflow:visible;font:14px/1.3 "Segoe UI",system-ui,-apple-system,sans-serif;margin:0;padding:0}
@media (prefers-color-scheme:dark){.wk-win{background:#131826;color:#e8ecf6;border-color:rgba(255,255,255,.14);box-shadow:0 18px 50px rgba(0,0,0,.6)}}
.wk-head{flex:none;height:${HEAD}px;display:flex;align-items:center;gap:2px;padding:0 4px 0 14px;background:rgba(127,127,127,.09);border-bottom:1px solid rgba(127,127,127,.2);border-radius:11px 11px 0 0;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none;box-sizing:border-box}
.wk-win.wk-dragging .wk-head{cursor:grabbing}
.wk-title{flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
.wk-btn{all:unset;box-sizing:border-box;width:36px;height:30px;border-radius:7px;display:grid;place-items:center;cursor:pointer;color:inherit}
.wk-btn:hover{background:rgba(127,127,127,.2)}.wk-btn:focus-visible{outline:2px solid #2563eb;outline-offset:1px}
.wk-btn.wk-x:hover{background:#e5484d;color:#fff}
.wk-btn svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}
.wk-frame{flex:1;display:block;width:100%;min-height:0;border:0;margin:0;padding:0;background:transparent;border-radius:0 0 11px 11px}
.wk-win.wk-sheet .wk-head,.wk-win.wk-sheet .wk-frame{border-radius:0}
.wk-shield{position:absolute;left:0;right:0;bottom:0;top:${HEAD}px;display:none;z-index:3}
.wk-win.wk-dragging .wk-shield{display:block}
.wk-grip{position:absolute;z-index:4}
.wk-g-n{top:-4px;left:12px;right:12px;height:8px;cursor:ns-resize}.wk-g-s{bottom:-4px;left:12px;right:12px;height:8px;cursor:ns-resize}
.wk-g-e{right:-4px;top:12px;bottom:12px;width:8px;cursor:ew-resize}.wk-g-w{left:-4px;top:12px;bottom:12px;width:8px;cursor:ew-resize}
.wk-g-ne{right:-4px;top:-4px;width:16px;height:16px;cursor:nesw-resize}.wk-g-sw{left:-4px;bottom:-4px;width:16px;height:16px;cursor:nesw-resize}
.wk-g-nw{left:-4px;top:-4px;width:16px;height:16px;cursor:nwse-resize}.wk-g-se{right:-4px;bottom:-4px;width:16px;height:16px;cursor:nwse-resize}
.wk-win.wk-maxed .wk-grip{display:none}.wk-win.wk-maxed .wk-head{cursor:default}
.wk-win.wk-sheet{left:0!important;top:0!important;width:100%!important;height:100%!important;border:0;border-radius:0;animation:wk-rise .2s ease-out}
.wk-win.wk-sheet .wk-grip,.wk-win.wk-sheet .wk-max{display:none}
.wk-win.wk-sheet .wk-head{height:calc(48px + env(safe-area-inset-top));padding-top:env(safe-area-inset-top);cursor:default}
.wk-win.wk-sheet .wk-btn{width:44px;height:40px}.wk-win.wk-sheet .wk-shield{top:48px}
@keyframes wk-rise{from{transform:translateY(24px);opacity:.5}}`;
    document.head.appendChild(s);
  }
  const svg = (d) => `<svg viewBox="0 0 16 16" aria-hidden="true">${d}</svg>`;
  const ICON = { max: svg('<rect x="3" y="3" width="10" height="10" rx="1.5"/>'), restore: svg('<rect x="3" y="5.5" width="7.5" height="7.5" rx="1.3"/><path d="M5.5 5.5V4.3c0-.7.6-1.3 1.3-1.3h4.9c.7 0 1.3.6 1.3 1.3v4.9c0 .7-.6 1.3-1.3 1.3h-1.2"/>'), close: svg('<path d="M4 4l8 8M12 4l-8 8"/>') };

  function load(name) { try { const g = JSON.parse(localStorage.getItem(KEY + name)); return g && typeof g.w === "number" ? g : null; } catch (e) { return null; } }
  function save(name, g) { try { localStorage.setItem(KEY + name, JSON.stringify(g)); } catch (e) {} }
  function fit(g) {
    const W = innerWidth, H = innerHeight;
    const w = Math.round(Math.min(Math.max(g.w, MIN_W), W - 2 * MARGIN)), h = Math.round(Math.min(Math.max(g.h, MIN_H), H - 2 * MARGIN));
    return { x: Math.round(Math.max(MARGIN, Math.min(g.x, W - w - MARGIN))), y: Math.round(Math.max(MARGIN, Math.min(g.y, H - h - MARGIN))), w, h };
  }
  const isSheet = () => root.matchMedia(SHEET).matches;
  const top = () => (wins.length ? wins.reduce((a, b) => (+a.el.style.zIndex > +b.el.style.zIndex ? a : b)) : null);

  // open(url, opts) -> the window: { el, frame, url, origin, name, ready, closed, close, maximize, restore, toggleMax,
  // front, focus, post(msg, transfer), on(type, fn), title(text) }
  function open(url, opts) {
    opts = opts || {};
    css();
    const abs = new URL(url, location.href).href;
    const origin = new URL(abs).origin; // "null" for a file: address (then postMessage needs "*", and the reply's origin is "null")
    const name = opts.name || new URL(abs).pathname;
    const id = ++seq;
    const back = document.activeElement;
    const el = document.createElement("div");
    el.className = "wk-win";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", opts.title || "Window");
    el.innerHTML = `<div class="wk-head"><span class="wk-title"></span><button class="wk-btn wk-max" type="button" aria-label="Maximise" title="Maximise">${ICON.max}</button><button class="wk-btn wk-x" type="button" aria-label="Close" title="Close (Escape)">${ICON.close}</button></div><iframe class="wk-frame" allow="clipboard-read; clipboard-write; fullscreen"></iframe><div class="wk-shield"></div>`
      + ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((d) => `<div class="wk-grip wk-g-${d}" data-dir="${d}"></div>`).join("");
    const head = el.querySelector(".wk-head"), titleEl = el.querySelector(".wk-title"), maxBtn = el.querySelector(".wk-max"), frame = el.querySelector(".wk-frame");
    titleEl.textContent = opts.title || "";
    const handlers = {};
    let readyRes, closedRes, closedNow = false;
    const saved = load(name);
    const w0 = opts.width || Math.min(980, Math.round(innerWidth * 0.8)), h0 = opts.height || Math.min(700, Math.round(innerHeight * 0.8));
    let g = fit(saved || { x: (innerWidth - w0) / 2, y: Math.max(MARGIN, (innerHeight - h0) / 3), w: w0, h: h0 });
    let maxed = !!(saved && saved.max), before = null;
    const win = {
      id, el, frame, url: abs, origin, name, pushed: false,
      ready: new Promise((r) => { readyRes = r; }), closed: new Promise((r) => { closedRes = r; }),
      on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); return win; },
      title(t) { titleEl.textContent = t; el.setAttribute("aria-label", t); },
      post(msg, transfer) { if (frame.contentWindow) frame.contentWindow.postMessage(msg, origin === "null" ? "*" : origin, transfer || []); },
      front() { el.style.zIndex = String(++z); },
      focus() { try { frame.focus(); } catch (e) {} },
      maximize() { if (maxed) return; before = g; maxed = true; layout(); remember(); },
      restore() { if (!maxed) return; maxed = false; if (before) g = before; layout(); remember(); },
      toggleMax() { maxed ? win.restore() : win.maximize(); },
      busy: "", // what the page inside says is still running (uploads): a person closing the window is asked first
      ask() { return !win.busy || root.confirm(`${win.busy} in this window. Close it anyway (they stop)?`); },
      close(fromPop) {
        if (closedNow) return;
        closedNow = true;
        wins.splice(wins.indexOf(win), 1);
        el.remove();
        if (win.pushed && !fromPop && history.state && history.state.wkSheet === id) history.back();
        if (back && back.focus && document.contains(back)) try { back.focus({ preventScroll: true }); } catch (e) {}
        closedRes();
        if (opts.onClose) try { opts.onClose(); } catch (e) {}
      },
      _emit(type, m) { for (const fn of handlers[type] || []) try { fn(m); } catch (e) {} },
      _ready(m) { readyRes(m); },
    };
    function layout() {
      const sheet = isSheet();
      el.classList.toggle("wk-sheet", sheet);
      el.classList.toggle("wk-maxed", maxed && !sheet);
      maxBtn.innerHTML = maxed ? ICON.restore : ICON.max;
      maxBtn.title = maxed ? "Restore" : "Maximise";
      maxBtn.setAttribute("aria-label", maxBtn.title);
      if (sheet) {
        if (!win.pushed && opts.back !== false) { try { history.pushState(Object.assign({}, history.state, { wkSheet: id }), ""); win.pushed = true; } catch (e) {} }
        return;
      }
      const r = maxed ? { x: MARGIN, y: MARGIN, w: innerWidth - 2 * MARGIN, h: innerHeight - 2 * MARGIN } : (g = fit(g));
      el.style.left = r.x + "px"; el.style.top = r.y + "px"; el.style.width = r.w + "px"; el.style.height = r.h + "px";
    }
    function remember() { save(name, Object.assign({}, maxed && before ? before : g, { max: maxed })); }
    win._layout = layout;

    // Drag by the title bar; resize from the edges and corners. A shield over the frame keeps the pointer's moves
    // coming while it passes over the page inside.
    function grab(handle, apply) {
      handle.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest(".wk-btn") || isSheet() || maxed) return;
        e.preventDefault();
        win.front();
        const start = { x: e.clientX, y: e.clientY, g: Object.assign({}, g) };
        el.classList.add("wk-dragging");
        try { handle.setPointerCapture(e.pointerId); } catch (x) {}
        const move = (ev) => { g = fit(apply(start, ev.clientX - start.x, ev.clientY - start.y)); layout(); };
        const end = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", end); handle.removeEventListener("pointercancel", end); el.classList.remove("wk-dragging"); remember(); };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", end);
        handle.addEventListener("pointercancel", end);
      });
    }
    grab(head, (s, dx, dy) => ({ x: s.g.x + dx, y: s.g.y + dy, w: s.g.w, h: s.g.h }));
    for (const grip of el.querySelectorAll(".wk-grip")) {
      const d = grip.dataset.dir;
      grab(grip, (s, dx, dy) => {
        let { x, y, w, h } = s.g;
        if (d.includes("e")) w = Math.max(MIN_W, s.g.w + dx);
        if (d.includes("s")) h = Math.max(MIN_H, s.g.h + dy);
        if (d.includes("w")) { w = Math.max(MIN_W, s.g.w - dx); x = s.g.x + s.g.w - w; }
        if (d.includes("n")) { h = Math.max(MIN_H, s.g.h - dy); y = s.g.y + s.g.h - h; }
        return { x, y, w, h };
      });
    }
    head.addEventListener("dblclick", (e) => { if (!e.target.closest(".wk-btn") && !isSheet()) win.toggleMax(); });
    maxBtn.addEventListener("click", () => win.toggleMax());
    el.querySelector(".wk-x").addEventListener("click", () => { if (win.ask()) win.close(); });
    el.addEventListener("pointerdown", () => win.front(), true);
    // A same-origin page inside: its own Escape, when it did not use it, closes the window too.
    frame.addEventListener("load", () => {
      try {
        frame.contentWindow.addEventListener("keydown", (e) => { if (e.key === "Escape" && !e.defaultPrevented && win.ask()) win.close(); });
      } catch (e) { /* another origin: it says "escape" by message (WindowKit.child) */ }
    });
    wins.push(win);
    document.body.appendChild(el);
    win.front();
    layout();
    frame.src = abs;
    setTimeout(() => win.focus(), 50);
    return win;
  }

  // Messages from the pages inside: only from a window's own frame and from the origin it was opened at.
  root.addEventListener("message", (e) => {
    const win = wins.find((w) => w.frame.contentWindow === e.source);
    if (!win) return;
    if (win.origin === "null" ? e.origin !== "null" : e.origin !== win.origin) return;
    const m = e.data;
    if (!m || m.wk !== 1 || typeof m.type !== "string") return;
    if (m.type === "ready") win._ready(m);
    else if (m.type === "escape") { if (win.ask()) win.close(); }
    else if (m.type === "close") win.close();
    else if (m.type === "title" && typeof m.text === "string") win.title(m.text.slice(0, 200));
    else if (m.type === "busy") win.busy = typeof m.why === "string" ? m.why.slice(0, 200) : "";
    win._emit(m.type, m);
  });
  // Escape on the page itself closes the top window (it sits above everything, so it goes first).
  root.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented || !wins.length) return;
    e.preventDefault();
    const w = top();
    if (w.ask()) w.close();
  }, true);
  root.addEventListener("resize", () => { for (const w of wins) w._layout(); });
  root.addEventListener("popstate", () => {
    for (const w of wins.slice()) if (w.pushed && !(history.state && history.state.wkSheet === w.id)) w.close(true);
  });

  // pick(url, opts): open the file manager, ask it for files, give back { kind, files, paths, folder, missing } or
  // null when the person cancels or closes the window. opts: accept [".zip"], multiple, files (default true),
  // folder (false | "files" | "zip"), host (the name shown: "Book reader"), title, name, onProgress, signal.
  function pick(url, o) {
    o = o || {};
    return new Promise((resolve, reject) => {
      let done = false, port = null, win = null;
      const end = (fn, v) => { if (done) return; done = true; clearTimeout(timer); if (port) port.close(); if (win) win.close(); fn(v); };
      const timer = setTimeout(() => end(reject, new Error("The file manager did not open within 30 s (no network, or its page could not load).")), 30000);
      win = open(url, { name: o.name || "file-manager-pick", title: o.title || "Choose " + what(o), width: o.width, height: o.height, onClose: () => end(resolve, null) });
      win.on("ready", () => {
        clearTimeout(timer);
        if (port) port.close();
        const ch = new MessageChannel();
        port = ch.port1;
        port.onmessage = (e) => {
          const d = e.data || {};
          if (d.type === "progress") { if (o.onProgress) try { o.onProgress(d); } catch (x) {} }
          else if (d.type === "picked") end(resolve, result(d));
          else if (d.type === "cancel") end(resolve, null);
          else if (d.type === "error") end(reject, new Error(d.why || "The file manager could not give the files."));
        };
        win.post({ wk: 1, type: "pick", version: VERSION, accept: accepts(o.accept), multiple: !!o.multiple, files: o.files !== false, folder: o.folder || false,
          host: String(o.host || document.title || location.host).slice(0, 80) }, [ch.port2]);
      });
      if (o.signal) o.signal.addEventListener("abort", () => end(resolve, null), { once: true });
    });
  }
  const accepts = (a) => [].concat(a || []).map((x) => String(x).trim().toLowerCase()).filter(Boolean).map((x) => (x === "*" || x.startsWith(".") ? x : "." + x));
  function what(o) {
    const a = accepts(o.accept).filter((x) => x !== "*");
    const f = o.files === false ? "" : a.length ? a.join(" or ") + (o.multiple ? " files" : " file") : o.multiple ? "files" : "a file";
    return o.folder ? (f ? f + " or a folder" : "a folder") : f;
  }
  function result(d) {
    const files = Array.isArray(d.files) ? d.files : [];
    const paths = Array.isArray(d.paths) ? d.paths : files.map((f) => f.name);
    files.forEach((f, i) => { try { Object.defineProperty(f, "webkitRelativePath", { value: paths[i] || f.name, configurable: true }); } catch (e) {} });
    return { kind: d.kind || "files", files, paths, folder: d.folder || "", missing: d.missing || "" };
  }

  // ---- the child side: a page inside a window --------------------------------------------------------------------
  const ALLOW = ["https://jonnystokes.github.io", "null", "file://"];
  const inWindow = root.parent !== root;
  let pickHandler = null, autoEscape = false, refused = "";
  function allowed(o) { return o === location.origin || ALLOW.includes(o) || child.allow.includes(o); }
  // Inside a frame: every frame above must be one of the allowed origins (Chrome and Safari list them), so a
  // stranger's site cannot wrap this page (clickjacking) or ask it for files.
  function ancestors() {
    if (!inWindow) return "";
    const list = location.ancestorOrigins ? Array.from(location.ancestorOrigins) : [];
    for (const o of list) if (!allowed(o)) return o;
    return "";
  }
  const child = {
    inWindow, allow: [],
    get refusedBy() { return ancestors(); },
    ready(info) { autoEscape = true; if (inWindow && !ancestors()) root.parent.postMessage(Object.assign({ wk: 1, type: "ready", version: VERSION }, info || {}), "*"); },
    title(text) { if (inWindow) root.parent.postMessage({ wk: 1, type: "title", text: String(text) }, "*"); },
    close() { if (inWindow) root.parent.postMessage({ wk: 1, type: "close" }, "*"); },
    escape() { if (inWindow) root.parent.postMessage({ wk: 1, type: "escape" }, "*"); },
    busy(why) { if (inWindow) root.parent.postMessage({ wk: 1, type: "busy", why: why || "" }, "*"); }, // "" = nothing running
    onPick(fn) { pickHandler = fn; },
  };
  root.addEventListener("message", (e) => {
    if (!inWindow || e.source !== root.parent || !allowed(e.origin) || ancestors()) return;
    const m = e.data;
    if (!m || m.wk !== 1 || m.type !== "pick" || !e.ports || !e.ports[0]) return;
    if (pickHandler) pickHandler(m, e.ports[0], e.origin);
    else e.ports[0].postMessage({ type: "error", why: "This page does not pick files." });
  });
  // Escape the page inside did not use: the window closes (the page's own listeners run first, on document).
  root.addEventListener("keydown", (e) => { if (e.key === "Escape" && !e.defaultPrevented && autoEscape && inWindow) child.escape(); });

  root.WindowKit = { VERSION, open, pick, child, get windows() { return wins.slice(); } };
})(typeof window !== "undefined" ? window : globalThis);
