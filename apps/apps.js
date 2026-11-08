/* apps.js 1.10 (built 2026-11-07 5:22 PM): the Apps button and the window kit it needs, built by Projects\app-kit\build.py from
   app-kit\apps-button.js and file-manager\kit\window-kit.js (one source each; never edit this file). The window kit
   runs only when the page has none of its own. */
if (!window.WindowKit) {
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
}
/* apps-button.js 1.10: the Apps button of Jon's web programs. ONE source: Projects\app-kit\apps-button.js.
   Pages never copy this file: they take app-kit\dist\apps.js (this button plus the window kit it needs) or, when the
   page already carries window-kit.js, app-kit\dist\apps-button.js; or they load the published
   https://jonnystokes.github.io/Cool-tools/apps/apps.js. The rules: Projects\WEB-APP-CONVENTIONS.md.

     <apps-button app="file-manager"></apps-button>     the first thing in the page's top bar, top left

   Three thick bars (magenta, yellow, cyan) and the word "Apps" on black with a neon edge: one look in every program,
   made to clash with any page, because it is the way out of this program into another. Then a plain divider (Jon,
   2026-11-07: only the button stands out): 1 px in the bar's own text colour, faint, so it blends with each app's bar.
   A click opens the Apps menu (the launcher, cool-tools/apps/) in a floating window (the window kit; a full-screen
   sheet on a phone); a second click closes it. The menu marks the program named by app="...". When the menu cannot
   load (this device offline, the site down), the window says so in plain words, with Try again.

   Attributes:
     app="<id>"         this program's id in app-kit\programs.json: the menu marks it "You are here"
     stack              bars above the word (for a tight bar); stack="720": only while the page is 720 px wide or less
     launcher="<url>"   another menu address (tests)
     in-frame           show the button inside a frame too. Hidden there by default: inside another page's window a
                        program chosen from the menu would take that page's whole tab
   Size: CSS --apps-h on the element is the button's height (default 36px; the bars, the word and the divider scale
   with it):  apps-button { --apps-h: 40px; }
   The divider takes the bar's text colour by itself; --apps-sep sets it to the app's own line colour instead:
     apps-button { --apps-sep: var(--line); }
   Script: AppsKit.open({ app }), AppsKit.close(), AppsKit.window (the open menu's window, or null),
   AppsKit.launcher (the menu's address), AppsKit.VERSION. */
(function (root) {
  "use strict";
  if (root.AppsKit) return; // two copies on one page (a built-in one and the published one): the first serves
  const VERSION = "1.10";
  const LAUNCHER = "https://jonnystokes.github.io/Cool-tools/apps/";
  const W = 460, H = 780;        // the menu window's first size (less on a short screen); the window kit remembers
                                 // what the person makes it
  const NAME = "apps";           // its key in the window kit (localStorage wk-win:apps); the same in every program
  let current = null;            // { win, href } while the menu is open

  const BARS = ["#ff3df2", "#ffd23d", "#3dfcff"];
  const CSS = `
:host{all:initial;color:inherit;display:inline-flex;align-items:center;flex:none;vertical-align:middle;--h:var(--apps-h,36px)}
.b{all:unset;box-sizing:border-box;position:relative;display:inline-flex;flex-direction:row;align-items:center;justify-content:center;
  gap:calc(var(--h)*.2);height:var(--h);padding:0 calc(var(--h)*.3) 0 calc(var(--h)*.26);border:2px solid transparent;border-radius:calc(var(--h)*.28);
  background:linear-gradient(#0b0816,#0b0816) padding-box,linear-gradient(120deg,${BARS[0]},${BARS[1]} 52%,${BARS[2]}) border-box;
  color:#fff;font:800 calc(var(--h)*.42)/1 "Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif;letter-spacing:.015em;
  white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;touch-action:manipulation;
  box-shadow:0 0 0 1px rgba(0,0,0,.65),0 0 calc(var(--h)*.3) rgba(255,61,242,.55),0 0 calc(var(--h)*.55) rgba(61,252,255,.3);
  transition:box-shadow .15s,filter .15s,transform .08s}
.b:hover{filter:brightness(1.15) saturate(1.1);box-shadow:0 0 0 1px rgba(0,0,0,.65),0 0 calc(var(--h)*.42) rgba(255,61,242,.85),0 0 calc(var(--h)*.8) rgba(61,252,255,.5)}
.b:active{transform:translateY(1px) scale(.97)}
.b:focus-visible{outline:2px solid #000;outline-offset:2px;box-shadow:0 0 0 6px #fff,0 0 calc(var(--h)*.5) rgba(255,61,242,.9)}
.b[aria-expanded=true]{box-shadow:0 0 0 1px rgba(0,0,0,.65),0 0 0 calc(var(--h)*.09) rgba(255,210,61,.55),0 0 calc(var(--h)*.5) rgba(255,61,242,.8)}
.bars{display:flex;flex-direction:column;justify-content:center;gap:calc(var(--h)*.085);width:calc(var(--h)*.5);flex:none}
.bars i{display:block;height:calc(var(--h)*.12);height:round(calc(var(--h)*.12),1px);border-radius:99px}
.bars i:nth-child(1){background:${BARS[0]};box-shadow:0 0 calc(var(--h)*.14) rgba(255,61,242,.8)}
.bars i:nth-child(2){background:${BARS[1]};box-shadow:0 0 calc(var(--h)*.14) rgba(255,210,61,.7)}
.bars i:nth-child(3){background:${BARS[2]};box-shadow:0 0 calc(var(--h)*.14) rgba(61,252,255,.7)}
.w{display:block;text-shadow:0 0 calc(var(--h)*.22) rgba(255,255,255,.4)}
.sep{display:block;flex:none;width:1px;height:calc(var(--h)*.72);margin:0 calc(var(--h)*.2) 0 calc(var(--h)*.3);background:var(--apps-sep,rgba(127,127,127,.4))}
@supports (color:color-mix(in srgb,red,blue)){.sep{background:var(--apps-sep,color-mix(in srgb,currentColor 22%,transparent))}}`;
  // The stacked form (bars above the word), for a tight bar: the same parts, arranged in a column.
  const STACK = `
.b{flex-direction:column;gap:calc(var(--h)*.07);padding:0 calc(var(--h)*.17);border-radius:calc(var(--h)*.24);font-size:calc(var(--h)*.27);letter-spacing:.04em}
.bars{width:calc(var(--h)*.52);gap:calc(var(--h)*.075)}
.bars i{height:calc(var(--h)*.1);height:round(calc(var(--h)*.1),1px)}
.sep{margin:0 calc(var(--h)*.16) 0 calc(var(--h)*.22)}`;
  function stackCss(v) {
    if (v === null) return "";
    const px = parseInt(v, 10);
    return px > 0 ? `@media (max-width:${px}px){${STACK}}` : STACK;
  }
  const inFrame = () => { try { return root.self !== root.top; } catch (e) { return true; } };

  // ---- the menu window --------------------------------------------------------------------------------------------
  // Its first place is just under the button (the window kit has no place option, so its remembered place is set
  // before it opens); once the person moves or resizes it, the window kit keeps their place and this leaves it be.
  function place(anchor) {
    try {
      const key = "wk-win:" + NAME, seeded = localStorage.getItem("apps-place");
      const saved = localStorage.getItem(key);
      if (saved && saved !== seeded) return;   // the person's own place
      const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 8, bottom: 8 };
      const y = Math.round(r.bottom + 8);
      const g = JSON.stringify({ x: Math.max(8, Math.round(r.left)), y, w: Math.min(W, innerWidth - 16), h: Math.max(320, Math.min(H, innerHeight - y - 8)), max: false });
      localStorage.setItem(key, g);
      localStorage.setItem("apps-place", g);
    } catch (e) { /* no storage: the window kit centres it */ }
  }

  function open(o) {
    o = o || {};
    if (current) { current.win.front(); current.win.focus(); return current.win; }
    const u = new URL(o.launcher || api.launcher, location.href);
    if (o.app) u.searchParams.set("app", String(o.app).slice(0, 60));
    const href = u.href;
    if (!root.WindowKit) { location.href = href; return null; } // no window kit on this page: the menu as a page
    place(o.anchor);
    const btn = o.anchor || null;
    const win = root.WindowKit.open(href, {
      title: "Apps", name: NAME, width: W, height: H,
      onClose: () => { if (current && current.win === win) { current.stop(); current = null; } if (btn) btn.setAttribute("aria-expanded", "false"); },
    });
    if (btn) btn.setAttribute("aria-expanded", "true");
    current = watch(win, href);
    current.arm();
    return win;
  }
  function close() { if (current) current.win.close(); }

  // ---- when the menu cannot load ------------------------------------------------------------------------------------
  // The menu page says "ready" (the window kit's protocol) as soon as it runs. Offline when the window opens, or its
  // frame loaded something that never said ready (the browser's own error page), or nothing at all within 20 s:
  // the window shows a plain message instead, with Try again (and tries again by itself when the device is back
  // online). A late "ready" still wins: the message goes and the menu shows.
  function watch(win, href) {
    let ok = false, loadT = 0, slowT = 0, box = null;
    const st = { win, href };
    const why = () => (navigator.onLine === false ? "offline" : "noload");
    const fail = (kind) => { if (!ok && current === st) show(kind); };
    const arm = () => {
      clearTimeout(slowT);
      slowT = setTimeout(() => fail(why()), 20000);
      if (navigator.onLine === false) fail("offline");
    };
    const onLoad = () => { clearTimeout(loadT); loadT = setTimeout(() => fail(why()), 2500); };
    const onOnline = () => { if (box && box.isConnected && !ok) retry(); };
    function show(kind) {
      if (!box) {
        box = document.createElement("div");
        box.className = "apps-fail";
        box.style.cssText = "flex:1 1 auto;min-height:0;overflow:auto;display:block;margin:0;padding:0;border:0";
        const sr = box.attachShadow({ mode: "open" });
        sr.innerHTML = `<style>${FAIL_CSS}</style><div class="m" role="alert"><div class="bars" aria-hidden="true"><i></i><i></i><i></i></div><h2></h2><p class="t"></p><p class="f"></p><button type="button">Try again</button></div>`;
        sr.querySelector("button").addEventListener("click", retry);
        win.frame.after(box);
      }
      const sr = box.shadowRoot;
      sr.querySelector("h2").textContent = kind === "offline" ? "No internet" : "The Apps menu did not load";
      sr.querySelector(".t").textContent = kind === "offline"
        ? "The Apps menu comes from the Cool tools site, and this device is offline. Connect it to the internet, then try again."
        : "The Cool tools site (jonnystokes.github.io) could not be reached: no internet here, or the site is down.";
      sr.querySelector(".f").textContent = location.protocol === "file:"
        ? "This page is a file on this device; the menu of programs still comes from the web."
        : "";
      box.hidden = false;
      box.style.display = "block";
      win.frame.style.display = "none";
    }
    function hide() { if (box) box.style.display = "none"; win.frame.style.display = ""; }
    function retry() { hide(); win.frame.src = href; arm(); }
    win.frame.addEventListener("load", onLoad);
    root.addEventListener("online", onOnline);
    win.ready.then(() => { ok = true; clearTimeout(loadT); clearTimeout(slowT); hide(); });
    st.stop = () => { clearTimeout(loadT); clearTimeout(slowT); root.removeEventListener("online", onOnline); };
    st.retry = retry;
    st.arm = arm;   // open() calls it once this is the current menu
    return st;
  }
  const FAIL_CSS = `
:host{all:initial;display:block}
.m{box-sizing:border-box;min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:28px 24px;text-align:center;
  background:#05060c;color:#eaf1ff;font:15px/1.45 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif}
.bars{display:flex;flex-direction:column;gap:5px;width:34px;margin-bottom:6px;opacity:.55}
.bars i{display:block;height:6px;border-radius:9px}.bars i:nth-child(1){background:${BARS[0]}}.bars i:nth-child(2){background:${BARS[1]}}.bars i:nth-child(3){background:${BARS[2]}}
h2{margin:0;font-size:19px;font-weight:700}
p{margin:0;max-width:30em;color:#b8c4dc}p:empty{display:none}.f{font-size:13.5px;color:#8d9ab6}
button{all:unset;box-sizing:border-box;margin-top:8px;padding:10px 20px;border-radius:10px;background:#ffd23d;color:#05060c;font-weight:700;cursor:pointer}
button:hover{filter:brightness(1.08)}button:focus-visible{outline:2px solid #fff;outline-offset:2px}`;

  // ---- the element ------------------------------------------------------------------------------------------------
  class AppsButton extends HTMLElement {
    static get observedAttributes() { return ["stack"]; }
    constructor() {
      super();
      const sr = this.attachShadow({ mode: "open" });
      sr.innerHTML = `<style></style><button class="b" type="button" aria-haspopup="dialog" aria-expanded="false" title="Apps: open another of Jon's programs"><span class="bars" aria-hidden="true"><i></i><i></i><i></i></span><span class="w">Apps</span></button><span class="sep" aria-hidden="true"></span>`;
      this._style = sr.querySelector("style");
      this._btn = sr.querySelector("button");
      this._btn.addEventListener("click", () => {
        if (current) close();
        else open({ app: this.getAttribute("app") || "", launcher: this.getAttribute("launcher") || "", anchor: this._btn });
      });
      // Enter and Space belong to the button. A page's own shortcuts on document see this element (not the button
      // inside it), so a page that presses focused buttons itself, or opens its list's row on Enter, would take them.
      for (const t of ["keydown", "keypress", "keyup"]) this._btn.addEventListener(t, (e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); });
      this._paint();
    }
    connectedCallback() { if (inFrame() && !this.hasAttribute("in-frame")) this.style.display = "none"; }
    attributeChangedCallback() { this._paint(); }
    _paint() { this._style.textContent = CSS + stackCss(this.getAttribute("stack")); }
    focus(o) { this._btn.focus(o); }
    click() { this._btn.click(); }
  }

  const api = {
    VERSION, launcher: LAUNCHER, open, close,
    get window() { return current ? current.win : null; },
  };
  root.AppsKit = api;
  if (root.customElements && !root.customElements.get("apps-button")) root.customElements.define("apps-button", AppsButton);
})(typeof window !== "undefined" ? window : globalThis);
