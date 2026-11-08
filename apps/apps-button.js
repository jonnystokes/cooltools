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
