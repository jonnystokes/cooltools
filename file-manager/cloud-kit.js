/* cloud-kit.js 1: every program opens and saves through the Cloud File Manager with this one script.
   ONE source: Projects\file-manager\kit\cloud-kit.js. A program's build copies it in after relay-client.js (3) and
   window-kit.js; never edit a copy. How to use it, with an example to copy: kit\CLOUD-KIT.md.

     const cloud = CloudKit.for({ app: "plan-cutter", ext: ".plan-cutter", relay: R });
     await cloud.start();                          // is the cloud on, who is this, send up what was kept on this device
     let doc = await cloud.openLast();             // the last document, or null
     doc = await cloud.open({ anchor: button });   // the small Open chooser: Cloud File Manager, This device
     doc = await cloud.openById(id);               // "#open=<id>" from the file manager
     doc = cloud.create("My home");                // a new document: saved at its first save
     await cloud.save(doc, text);                  // now: into this browser first, then to the cloud
     const auto = cloud.autosave(doc, () => text); // auto.touch() on every change, auto.stop() when it is closed
     await cloud.rename(doc, "Garage");   await cloud.list();
     await cloud.data.get("settings");    await cloud.data.set("settings", value);    // small things that follow the person
     <cloud-status></cloud-status>                 // the dot and the few words, in the program's bar

   What it holds to (each has a test in test\cloud-kit.test.mjs):
   - A save goes into this browser first (IndexedDB "cloud-kit"), then to the cloud as that day's file. The cloud off,
     or not answering: the work stays in this browser, the words say so, and it goes up by itself when the cloud is back.
   - Nobody signed in: the first save makes a guest, silently. A document whose owner signed out waits for them.
   - A new day starts a new dated file. Another device saved the same day's file: both are kept (theirs as
     "<name> <date> (2)"), a small notice says so, nobody is asked anything.
   - The browser refuses to keep a copy (full, private mode): said once, plainly; saving to the cloud goes on.
   - When the page is hidden or closed, what was not yet saved is handed to the browser at once.
   - No timer runs while the page is hidden. "This program is open" (seen) is said once a minute while it is in view.
   Nothing here throws for a failure it expects: results carry ok and why, and cloud.state says where things stand. */
(function (root) {
  "use strict";
  const VERSION = 1;
  const DB = "cloud-kit", SEP = "\n", HIGH = String.fromCharCode(0xffff);
  const SAVE_AFTER = 1500, SAVE_MAX = 8000, SEEN_EVERY = 60000, RETRY = [5000, 10000, 20000, 30000], NOTE_MS = 15000, KEEP_DOCS = 12;
  const KEY = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}$/;

  // Every word a person reads comes from here, so every program says the same thing.
  const W = {
    cloud: "Cloud File Manager", device: "This device", deviceFile: "This device: a file", deviceFolder: "This device: a folder",
    connecting: "Connecting…", connected: "Connected", saving: "Saving…", saved: "Saved",
    off: "Cloud File Manager is off.", kept: "Saved on this device.", notSaved: "Not saved.",
    notInCloud: "Not saved in Cloud File Manager.", signIn: "Sign in to save.", reload: "This page is out of date. Reload it.",
    isOff: "It is off right now", untitled: "Untitled", account: "Account",
    noCopy: "This browser cannot keep a copy on this device. Your work is saved in Cloud File Manager only.",
    noCopyOff: "This browser cannot keep a copy on this device, and Cloud File Manager is off. Keep this page open.",
    nothing: "There is nothing to save.",
    badKey: "That name cannot be used for a setting.",
    clash: (n) => `“${n}” was changed on another device too. Both versions are kept.`,
    clashTab: (n) => `“${n}” was changed in another tab too. Both versions are kept.`,
    taken: (n) => `There is already a document named “${n}”.`,
    savedAs: (was, now) => `Saved as “${now}”: there is already a document named “${was}”.`,
    cantOpen: (n, why) => `${n ? `“${n}”` : "That file"} could not be opened${why ? ": " + why : "."}`,
  };

  // ---- small things ---------------------------------------------------------------------------------------------
  const pad = (n) => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const lower = (s) => String(s).toLowerCase();
  const rnd = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const q = encodeURIComponent;
  const soft = (p, v) => p.then((x) => x, () => v);
  const enc = new TextEncoder(), dec = new TextDecoder();
  const hidden = () => !!root.document && root.document.visibilityState === "hidden";
  const isBlob = (x) => typeof Blob !== "undefined" && x instanceof Blob;
  const savable = (x) => typeof x === "string" || x instanceof ArrayBuffer || ArrayBuffer.isView(x) || isBlob(x);
  // a reason as the PC or relay-client words it ("could not reach the PC (...)"), as a sentence a person reads
  const sentence = (s) => { s = String(s || "").trim(); if (!s) return ""; s = s[0].toUpperCase() + s.slice(1); return /[.!?…]$/.test(s) ? s : s + "."; };
  const keptIn = (rec) => { if (rec.kept) rec.keptIn = rec.app + SEP + rec.owner; else delete rec.keptIn; return rec; };
  // a failed answer that is worth another try by itself (the cloud is off, busy or not answering), not a refusal
  const isLater = (r) => !r.status || r.status === 429 || r.kind === "off" || (r.status >= 500 && r.status !== 507);
  async function toBytes(data) {
    if (typeof data === "string") return enc.encode(data);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (isBlob(data)) return new Uint8Array(await data.arrayBuffer());
    return null;
  }
  // the PC's version of a file: the first 16 hex characters of its SHA-256 ("" where the browser cannot work it out)
  async function hashOf(bytes) {
    try {
      const d = new Uint8Array(await root.crypto.subtle.digest("SHA-256", bytes));
      let s = "";
      for (let i = 0; i < 8; i++) s += d[i].toString(16).padStart(2, "0");
      return s;
    } catch (e) { return ""; }
  }
  // what a document may be called: Windows' rules and the cloud's own (it hides dot names), in plain words
  function badName(n) {
    if (!n.trim()) return "A name cannot be empty.";
    if (n.length > 80) return "That name is too long.";
    const m = /[\\/:*?"<>|]/.exec(n);
    if (m) return `A name cannot contain ${m[0]}`;
    if (/[\x00-\x1f\x7f]/.test(n)) return "A name cannot contain control characters.";
    if (/[. ]$/.test(n)) return "A name cannot end with a dot or a space.";
    if (/^(\.|~\$)/.test(n) || /\.(tmp|part|partial|crdownload)$/i.test(n) || /^(desktop\.ini|thumbs\.db)$/i.test(n)) return "That name cannot be used. Choose another.";
    if (/^(con|prn|aux|nul|conin\$|conout\$|com\d|lpt\d)$/i.test(n.split(".")[0].trim())) return "Windows keeps that name for itself. Choose another.";
    return "";
  }
  function unique(name, taken) { // taken: lower-case names
    if (!taken.has(lower(name))) return name;
    const m = /^(.*) \((\d{1,3})\)$/.exec(name), stem = m ? m[1] : name;
    for (let n = m ? +m[2] + 1 : 2; n < 1000; n++) { const c = `${stem} (${n})`; if (!taken.has(lower(c))) return c; }
    return `${stem} (${rnd()})`;
  }
  // the id of a document's file for one day, from the cloud's answer to a rename ({ doc: { files: [{ id, date, copy }] } })
  function fileId(d, date) {
    const files = (d && d.doc && d.doc.files) || [], f = files.find((x) => x.date === date && !x.copy) || files[0];
    return (f && f.id) || "";
  }
  const accepts = (a) => [].concat(a || []).map((x) => lower(x).trim()).filter(Boolean).map((x) => (x === "*" || x.startsWith(".") ? x : "." + x));
  function nameIn(disposition) { // Content-Disposition: inline; filename="a.txt"; filename*=UTF-8''a.txt
    const m = /filename\*=UTF-8''([^;]+)/i.exec(disposition || "") || /filename="([^"]*)"/i.exec(disposition || "");
    try { return m ? decodeURIComponent(m[1]) : ""; } catch (e) { return m ? m[1] : ""; }
  }
  // light or dark: what the page really looks like, however it themes itself
  function isDark() {
    try {
      for (const el of [document.body, document.documentElement]) {
        const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(getComputedStyle(el).backgroundColor);
        if (m && (m[4] === undefined || +m[4] > 0.5)) return 0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3] < 110;
      }
      return root.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch (e) { return false; }
  }

  // ---- this browser's copy (IndexedDB "cloud-kit") --------------------------------------------------------------
  // docs: one record per document { key, app, owner, name, cloudName, version, date, id, rev, hash, size, at, kept }
  // (key = app \n owner \n name in lower case; owner "" = nobody yet); bodies: its content under the same key;
  // values: cloud.data values; marks: what was open last. kept = not in the cloud yet. rev names one content: a
  // record written by another tab has another rev.
  function makeDevice() {
    let db = null, opening = null;
    const dev = { ok: true, why: "" };
    const fail = (e) => { dev.ok = false; dev.why = String((e && e.message) || e || "refused"); };
    function open() {
      if (db) return Promise.resolve(db);
      return opening || (opening = new Promise((res) => {
        let rq;
        try { rq = root.indexedDB.open(DB, 1); } catch (e) { fail(e); return res(null); }
        rq.onupgradeneeded = () => {
          const d = rq.result;
          d.createObjectStore("docs", { keyPath: "key" }).createIndex("kept", "keptIn");
          d.createObjectStore("bodies");
          d.createObjectStore("values", { keyPath: "key" }).createIndex("kept", "keptIn");
          d.createObjectStore("marks", { keyPath: "key" });
        };
        rq.onsuccess = () => {
          const d = (db = rq.result);
          d.onversionchange = d.onclose = () => { try { d.close(); } catch (e) {} if (db === d) db = null; };
          res(d);
        };
        rq.onerror = (ev) => { fail(rq.error); if (ev && ev.preventDefault) ev.preventDefault(); res(null); };
        rq.onblocked = () => { fail("blocked"); res(null); };
      }).then((d) => { opening = null; return d; }));
    }
    // run: one transaction. body(t, done, on) issues the requests (on(request, fn): fn gets its result); the promise
    // resolves with what was handed to done() once everything is committed, and rejects when the browser refuses.
    function run(stores, mode, body, strict) {
      return open().then((d) => new Promise((res, rej) => {
        if (!d) return rej(new Error(dev.why || "no storage"));
        let t, out, thrown = null;
        try { t = d.transaction(stores, mode, strict ? { durability: "strict" } : undefined); } catch (e) { return rej(e); }
        const stop = (e) => { thrown = thrown || e; try { t.abort(); } catch (x) {} rej(thrown); };
        const on = (rq, fn) => { rq.onsuccess = () => { try { fn(rq.result); } catch (e) { stop(e); } }; };
        t.oncomplete = () => res(out);
        t.onabort = t.onerror = () => rej(thrown || t.error || new Error("refused"));
        try { body(t, (v) => { out = v; }, on); } catch (e) { stop(e); }
      })).then((v) => { if (mode === "readwrite") { dev.ok = true; dev.why = ""; } return v; }, (e) => { fail(e); throw e; });
    }
    const range = (app, owner) => IDBKeyRange.bound(app + SEP + owner + SEP, app + SEP + owner + SEP + HIGH);
    dev.open = () => open().then((d) => !!d);
    // putDoc: the document's newest content. A version another tab saved here that has not reached the cloud is not
    // lost: it stays as a copy of its own (displaced), and goes up as "<name> <date> (2)".
    dev.putDoc = (rec, body, expect) => run(["docs", "bodies"], "readwrite", (t, done, on) => {
      const docs = t.objectStore("docs"), bodies = t.objectStore("bodies");
      done({});
      on(docs.get(rec.key), (cur) => {
        if (cur && cur.kept && cur.rev !== expect && !(rec.hash && cur.hash === rec.hash)) {
          on(bodies.get(rec.key), (old) => { const c = Object.assign({}, cur, { key: rec.key + SEP + "#" + cur.rev, copyOf: cur.name }); docs.put(c); bodies.put(old, c.key); done({ displaced: true }); });
        }
        docs.put(rec);
        bodies.put(body, rec.key);
      });
    }, rec.kept);
    // putNow: as the page is hidden or closed. Handed to the browser at once, with nothing to wait for.
    dev.putNow = (rec, body) => {
      if (!db) return false;
      try {
        const t = db.transaction(["docs", "bodies"], "readwrite", { durability: "strict" });
        t.objectStore("docs").put(rec);
        t.objectStore("bodies").put(body, rec.key);
        if (t.commit) t.commit();
        return true;
      } catch (e) { return false; }
    };
    // settle: the cloud has taken the content named rev. The record learns the cloud's version either way; it stops
    // being "kept" only if it still holds that content (a newer save may have arrived meanwhile).
    dev.settle = (key, rev, base) => run(["docs"], "readwrite", (t, done, on) => {
      const s = t.objectStore("docs");
      done(false);
      on(s.get(key), (cur) => { if (!cur) return; Object.assign(cur, base); if (cur.rev === rev) cur.kept = false; s.put(keptIn(cur)); done(cur.rev === rev); });
    });
    dev.getDoc = (key) => run(["docs", "bodies"], "readonly", (t, done, on) => {
      done(null);
      on(t.objectStore("docs").get(key), (rec) => { if (rec) on(t.objectStore("bodies").get(key), (body) => done({ rec, body })); });
    });
    dev.body = (key) => run(["bodies"], "readonly", (t, done, on) => on(t.objectStore("bodies").get(key), done));
    dev.docs = (app, owner) => run(["docs"], "readonly", (t, done, on) => on(t.objectStore("docs").getAll(range(app, owner)), (all) => done(all.filter((r) => !r.copyOf))));
    dev.del = (keys) => run(["docs", "bodies"], "readwrite", (t) => { for (const k of keys) { t.objectStore("docs").delete(k); t.objectStore("bodies").delete(k); } });
    // move: a rename, or nobody's document becoming a person's. change(rec) gives the record its new key and name.
    dev.move = (from, change) => run(["docs", "bodies"], "readwrite", (t, done, on) => {
      const docs = t.objectStore("docs"), bodies = t.objectStore("bodies");
      done(null);
      on(docs.get(from), (cur) => {
        if (cur) on(bodies.get(from), (body) => { const rec = keptIn(change(cur)); if (rec.key !== from) { docs.delete(from); bodies.delete(from); } docs.put(rec); bodies.put(body, rec.key); done(rec); });
      });
    }, true);
    dev.kept = (store, app, owner) => run([store], "readonly", (t, done, on) => on(t.objectStore(store).index("kept").getAll(app + SEP + owner), done));
    dev.count = (app, docOwners, valueOwner) => run(["docs", "values"], "readonly", (t, done, on) => {
      let n = 0;
      const add = (store, owner) => on(t.objectStore(store).index("kept").count(app + SEP + owner), (c) => done((n += c)));
      done(0);
      for (const o of docOwners) add("docs", o);
      if (valueOwner) add("values", valueOwner);
    });
    dev.get = (store, key) => run([store], "readonly", (t, done, on) => on(t.objectStore(store).get(key), (v) => done(v || null)));
    dev.put = (store, rec) => run([store], "readwrite", (t) => { t.objectStore(store).put(keptIn(rec)); }, !!rec.kept);
    dev.remove = (store, key) => run([store], "readwrite", (t) => { t.objectStore(store).delete(key); });
    return dev;
  }

  // ---- what the indicator says ----------------------------------------------------------------------------------
  // tone: ok (green), busy (green, moving), wait (amber: needs a look), off (grey), bad (red)
  function wordsFor(s) {
    if (s.cloud === "checking") return { tone: "off", words: [W.connecting] };
    if (s.unsaved) return { tone: "bad", words: s.cloud === "off" ? [W.notSaved, W.off] : [W.notSaved] };
    if (s.signIn) return { tone: "wait", words: s.kept ? [W.signIn, W.kept] : [W.signIn] };
    if (s.cloud === "off") return { tone: "off", words: s.kept ? [W.off, W.kept] : [s.why === W.reload ? W.reload : W.off] };
    if (s.saving) return { tone: "busy", words: [W.saving] };
    if (s.problem) return { tone: "bad", words: s.kept ? [W.notInCloud, W.kept] : [W.notInCloud] };
    if (s.kept) return { tone: "wait", words: [W.kept] };
    return { tone: "ok", words: [s.savedAt ? W.saved : W.connected] };
  }

  // ---- one program's cloud ---------------------------------------------------------------------------------------
  const kits = new Map(), waiting = new Set(), metas = new WeakMap();
  // what the kit knows about an open document, beside the document itself (which stays a plain object)
  function meta(doc) {
    let m = metas.get(doc);
    if (!m) metas.set(doc, (m = { owner: undefined, cloudName: "", rev: "", seq: 0, done: 0, w: Promise.resolve(), cur: null, queued: null, hold: 0, clashes: 0, clashAt: 0 }));
    return m;
  }

  class Kit {
    constructor(o) {
      this.app = lower(o.app);
      this.ext = o.ext ? (String(o.ext).startsWith(".") ? String(o.ext) : "." + o.ext) : "";
      this.binary = !!o.binary;
      this.R = o.relay;
      this.name = o.name || "";
      this.fileManager = o.fileManager || "../file-manager/";
      this.accountPage = o.accountPage || "../settings/account.html";
      this.saveAfter = o.saveAfter || SAVE_AFTER;
      this._subs = { state: new Set(), notice: new Set(), account: new Set(), data: new Set() };
      this._dev = makeDevice();
      this._q = Promise.resolve(); // one cloud write at a time
      this._autos = new Set();
      this._open = new Map(); // key -> the document open in this page (held weakly)
      this._known = new Set(); // lower-case names of this person's documents, as far as this page knows
      this._vjobs = new Map();
      this._busy = 0;
      this._reach = false;
      this._tries = 0;
      this.state = { cloud: "checking", why: "", account: this.R.account(), saving: false, kept: 0, savedAt: 0, device: true, problem: "", signIn: false, unsaved: false, notice: "" };
      Object.assign(this.state, wordsFor(this.state));
      this.data = { get: (k) => this._dataGet(k), set: (k, v) => this._dataSet(k, v), update: (k, fn) => this._dataUpdate(k, fn) };
    }

    // ---- state and events ----
    on(what, fn) {
      const set = this._subs[what];
      if (!set || typeof fn !== "function") return () => {};
      set.add(fn);
      return () => set.delete(fn);
    }
    _emit(what, v) { for (const f of this._subs[what]) { try { f(v); } catch (e) { console.error("cloud-kit:", e); } } }
    _set(patch) {
      const s = Object.assign({}, this.state, patch);
      Object.assign(s, wordsFor(s));
      if (JSON.stringify(s) === JSON.stringify(this.state)) return;
      this.state = s;
      this._emit("state", s);
    }
    _notice(text) {
      this._set({ notice: text });
      this._emit("notice", text);
      clearTimeout(this._noteTimer);
      this._noteTimer = text && !hidden() ? setTimeout(() => { this._noteTimer = 0; this._set({ notice: "" }); }, NOTE_MS) : 0;
    }
    _refused() { // this browser will not keep a copy: said once (and once more if the cloud is off as well)
      this._set({ device: false });
      const text = this._reach ? W.noCopy : W.noCopyOff;
      if (!this._told) this._told = new Set();
      if (this._told.has(text) || !this._started) return;
      this._told.add(text);
      this._notice(text);
    }
    _away() { return !!this._leaving || hidden(); }
    _owner() { const a = this.R.account(); return (a && a.id) || ""; }
    _key(owner, name) { return this.app + SEP + owner + SEP + lower(name); }
    _work(n) { this._busy += n; this._set({ saving: this._busy > 0 }); }
    _tell(what, key) { try { if (this._bc) this._bc.postMessage({ app: this.app, what, key: key || "" }); } catch (e) {} }

    // ---- start: is the cloud on, who is this, send up what was kept ----
    start() {
      return this._started || (this._started = (async () => {
        try {
          if (!(await this._dev.open())) this._set({ device: false }); // said when something is saved
          this._listen();
          await this._check();
          await this._sync();
          await this._learn();
          this._tick(true);
        } catch (e) { console.error("cloud-kit:", e); }
        if (this.state.cloud === "checking") this._set({ cloud: "off" });
        return this.state;
      })());
    }
    _listen() {
      const d = root.document;
      this._handlers = [
        [d, "visibilitychange", () => (hidden() ? this._hidden() : this._tick())],
        [root, "pagehide", () => this._hidden()],
        [root, "pageshow", (e) => { if (e.persisted) this._tick(); }],
        [root, "online", () => this._recheck()],
      ];
      for (const [t, n, f] of this._handlers) t.addEventListener(n, f);
      this._offAccount = this.R.on("account", () => { this._account().catch((e) => console.error("cloud-kit:", e)); });
      try { this._bc = new BroadcastChannel("cloud-kit"); this._bc.onmessage = (e) => this._heard(e.data); } catch (e) {}
    }
    // stop: everything the kit set running (for a page that takes the kit down again; tests)
    async stop() {
      this._stopped = true;
      for (const a of Array.from(this._autos)) await a.stop();
      for (const [t, n, f] of this._handlers || []) t.removeEventListener(n, f);
      if (this._offAccount) this._offAccount();
      clearInterval(this._seenTimer); clearTimeout(this._retryTimer); clearTimeout(this._noteTimer);
      this._seenTimer = this._retryTimer = this._noteTimer = 0;
      try { if (this._bc) this._bc.close(); } catch (e) {}
      kits.delete(this.app);
    }
    async _check() {
      const p = await this.R.ping(5000);
      if (!p.ok) {
        this._reach = false;
        this._set({ cloud: "off", why: p.kind === "reload" ? W.reload : p.why || "", account: this.R.account() });
        return false;
      }
      await this.R.me();
      this._reach = true;
      this._set({ account: this.R.account() });
      return true;
    }
    _down(why) { // it did not answer: off, and looked at again in a while
      this._reach = false;
      this._set({ cloud: "off", why: why || "" });
      this._later();
    }
    // a failed answer from the cloud: off for now (it is tried again by itself), or refused (said plainly)
    _verdict(r) {
      r = r || {};
      if (isLater(r)) { this._down(r.why); return { kind: "later", why: r.why || "" }; }
      this._set({ problem: r.why || W.notInCloud });
      return { kind: "refused", why: r.why || "" };
    }
    _later() { // look again in a while: only while the page is in view and there is a reason to
      if (this._stopped || this._retryTimer || this._away()) return;
      if (this._reach && !this._holdUntil) { this._tries = 0; return; }
      const wait = RETRY[Math.min(this._tries, RETRY.length - 1)];
      this._retryTimer = setTimeout(() => { this._retryTimer = 0; this._tries++; this._recheck(); }, wait);
    }
    _recheck() {
      if (this._stopped || !this._started) return Promise.resolve();
      return this._checking || (this._checking = (async () => {
        clearTimeout(this._retryTimer);
        this._retryTimer = 0;
        try {
          if (!this._reach) await this._check();
          if (this._reach) await this._sync();
        } catch (e) { console.error("cloud-kit:", e); }
        this._checking = null;
        this._later();
      })());
    }
    // in view: say "open" once a minute, and look at once if something waits
    _tick(first) {
      if (this._stopped || hidden()) return;
      this._leaving = false;
      if (!this._seenTimer) this._seenTimer = setInterval(() => this._seen(), SEEN_EVERY);
      if (Date.now() - (this._seenAt || 0) >= SEEN_EVERY) this._seen();
      if (this.state.notice && !this._noteTimer) this._noteTimer = setTimeout(() => { this._noteTimer = 0; this._set({ notice: "" }); }, NOTE_MS);
      if (first) this._later(); // start() has just looked
      else if (!this._reach || this.state.kept) this._recheck();
    }
    _seen() {
      this._seenAt = Date.now();
      if (!this._reach || this._away()) return;
      // the same request as relay-client's seen(); asked here so the answer is known (no answer: the cloud is off)
      this.R.api("seen", { method: "POST", json: { app: this.app }, timeout: 8000 }).then((r) => { if (!r.ok && isLater(r) && this._reach) this._down(r.why); });
    }
    // hidden or closing: no timers, and what is not saved yet goes into the browser now
    _hidden() {
      this._leaving = true;
      clearInterval(this._seenTimer); clearTimeout(this._retryTimer); clearTimeout(this._noteTimer);
      this._seenTimer = this._retryTimer = this._noteTimer = 0;
      for (const a of this._autos) a._hide();
    }
    async _account() { // signed in, out, or another person (this tab or another)
      const a = this.R.account(), was = this.state.account;
      const quiet = this._quiet && !was && a && a.kind === "guest"; // the guest this page's own first save just made
      this._docsCache = null;
      this._lastSaid = "";
      this._recentId = "";
      if (this._reach) await this.R.me();
      this._set({ account: this.R.account(), signIn: false, problem: "" });
      await this._sync();
      await this._learn();
      if ((a && a.id) !== (was && was.id) && !quiet) this._emit("account", this.R.account());
    }
    _heard(m) { // another tab of this browser changed what is kept here
      if (!m || m.app !== this.app) return;
      this._count();
      if (m.what === "data") this._emit("data", m.key);
    }
    async _count() {
      const me = this._owner();
      let n = await soft(this._dev.count(this.app, me ? [me, ""] : [""], me), -1);
      const open = this._docsOpen().map((d) => meta(d).cur).filter((c) => c && c.rec.kept);
      if (n < 0) n = open.length; // no browser copy: what this page holds
      else n += open.filter((c) => c.rec.owner && c.rec.owner !== me).length; // open here, waiting for an owner who signed out
      this._set({ kept: n });
      return n;
    }
    _docsOpen() {
      const out = [];
      for (const [k, ref] of this._open) { const d = ref.deref ? ref.deref() : ref; if (d) out.push(d); else this._open.delete(k); }
      return out;
    }
    _remember(doc) {
      const m = meta(doc);
      for (const [k, ref] of this._open) if ((ref.deref ? ref.deref() : ref) === doc) this._open.delete(k);
      this._open.set(this._key(m.owner || "", doc.name), typeof WeakRef === "function" ? new WeakRef(doc) : doc);
      this._known.add(lower(doc.name));
    }
    _docAt(key) { const ref = this._open.get(key), d = ref && (ref.deref ? ref.deref() : ref); return d || null; }
    async _learn() { // the names in use, so a new document gets one of its own
      const me = this._owner(), known = new Set();
      for (const o of me ? [me, ""] : [""]) for (const r of await soft(this._dev.docs(this.app, o), [])) known.add(lower(r.name));
      if (me && this._reach && this.ext) for (const d of (await this._docs(3000)) || []) known.add(lower(d.name));
      for (const d of this._docsOpen()) known.add(lower(d.name));
      this._known = known;
    }
    async _docs(maxAge) { // this person's documents in the cloud (null: it could not be read)
      const me = this._owner(), c = this._docsCache;
      if (!me) return [];
      if (c && c.owner === me && Date.now() - c.at < (maxAge || 0)) return c.list;
      const r = await this.R.call("files", `app/${this.app}/docs`, { timeout: 20000 });
      if (!r.ok || !Array.isArray(r.data)) { this._failed = r; return null; }
      this._docsCache = { at: Date.now(), owner: me, list: r.data };
      return r.data;
    }

    // ---- sending up what was kept ----
    _sync() {
      if (this._syncing) { this._again = true; return this._syncing; }
      return (this._syncing = (async () => {
        try { do { this._again = false; await this._syncOnce(); } while (this._again && this._reach); }
        catch (e) { console.error("cloud-kit:", e); }
        this._syncing = null;
        await this._count();
        this._later();
      })());
    }
    async _syncOnce() {
      if (!this._reach) return;
      let stuck = false;
      const note = (r) => { if (r && r.kind === "later" && !r.held) stuck = true; };
      // the documents open in this page: through themselves, so each stays in step with what went up
      for (const d of this._docsOpen()) { const c = meta(d).cur; if (c && c.rec.kept && this._reach) note(await this._push(d)); }
      // what else this browser kept (one tab at a time sends it)
      const rest = async () => {
        const me = this._owner();
        for (const o of me ? [me, ""] : [""]) {
          for (const rec of await soft(this._dev.kept("docs", this.app, o), [])) {
            if (!this._reach) return;
            const d = rec.copyOf ? null : this._docAt(rec.key);
            if (d && meta(d).rev === rec.rev) note(await this._push(d)); // this page's own content
            else note(await this._pushKept(rec)); // kept by an earlier visit, or by another tab that has gone
          }
        }
        if (!me) return;
        for (const o of [me, ""]) for (const rec of await soft(this._dev.kept("values", this.app, o), [])) { if (!this._reach) return; note(await this._pushValue(rec, me)); }
        await this._pushLast(me);
      };
      const locks = root.navigator && root.navigator.locks;
      if (locks) await locks.request("cloud-kit:" + this.app, { ifAvailable: true }, (l) => (l ? rest() : null));
      else await rest();
      if (this._holdUntil && Date.now() >= this._holdUntil) this._holdUntil = 0;
      if (this._reach && !stuck) this._set({ cloud: "on", why: "" });
    }
    _pushKept(rec) { // a kept document that is not open in this page
      this._work(1);
      const job = this._q.then(async () => {
        const body = await soft(this._dev.body(rec.key), undefined);
        if (body === undefined) return { kind: "same" };
        if (rec.copyOf) return this._pushCopy(rec, body);
        return this._pushRec({ rec, data: body }, null);
      }).catch((e) => { console.error("cloud-kit:", e); return { kind: "later" }; });
      this._q = job.then(() => this._work(-1));
      return job;
    }
    async _pushCopy(rec, body) { // another tab's version, displaced here while the cloud was off: "<name> <date> (2)"
      const me = this._owner();
      if (!me || (rec.owner && rec.owner !== me)) return { kind: "signin" };
      const bytes = await toBytes(body);
      const r = await this._putDoc(rec.name, rec.date > today() ? rec.date : today(), bytes, "&as=copy");
      if (!r.ok) return this._verdict(r);
      await soft(this._dev.del([rec.key]));
      return { kind: "saved" };
    }
    async _pushLast(me) { // what was open last: the newer of this browser's word and the cloud's
      const key = this._key(me, "") + "last", mark = await soft(this._dev.get("marks", key), null);
      if (!mark || mark.sent) return;
      const r = await this.R.call("files", `app/${this.app}/last`, { timeout: 15000 });
      if (!r.ok) return;
      const at = (r.data && r.data.value && r.data.value.at) || 0;
      if (mark.at > at) { const p = await this.R.call("files", `app/${this.app}/last`, { method: "PUT", json: { name: mark.name, at: mark.at }, timeout: 15000 }); if (!p.ok) return; }
      mark.sent = true;
      await soft(this._dev.put("marks", mark));
    }
    _guest() { // the first save makes a guest, silently (one at a time, in every tab of this browser)
      const make = async () => {
        if (this._owner()) return { ok: true };
        this._quiet = true; // the open document simply becomes theirs: no "account" event for the program
        const r = await this.R.guest().then((x) => x, () => ({ ok: false }));
        this._quiet = false;
        return r.ok ? { ok: true } : { ok: false, status: r.status || 0, why: r.why, kind: r.kind };
      };
      const locks = root.navigator && root.navigator.locks;
      return this._guesting || (this._guesting = (locks ? locks.request("cloud-kit-guest", make) : make()).then((r) => { this._guesting = null; return r; }, () => { this._guesting = null; return { ok: false, status: 0 }; }));
    }
    _putDoc(name, date, bytes, extra, keepalive) {
      const o = { method: "PUT", body: bytes, headers: { "Content-Type": "application/octet-stream" }, timeout: 30000 + Math.round(bytes.byteLength / 20) };
      if (keepalive && bytes.byteLength < 60000) o.keepalive = true; // it may outlive the page
      return this.R.call("files", `app/${this.app}/doc?name=${q(name)}&date=${date}&ext=${q(this.ext)}${extra || ""}`, o);
    }
    async _getDoc(name, extra, etag) { // { ok, bytes, version, date, id } or { ok, same } or { ok: false, status, why, kind }
      let res;
      try { res = await this.R.fetch("files", `app/${this.app}/doc?name=${q(name)}${extra || ""}`, { cache: "no-store", timeout: 120000, headers: etag ? { "If-None-Match": `"${etag}"` } : {} }); }
      catch (e) { return { ok: false, status: 0, why: this.R.base ? "could not reach the PC" : this.R.where.why, kind: this.R.base ? "network" : "off" }; }
      if (res.status === 304) return { ok: true, same: true };
      if (!res.ok) { const j = await res.json().catch(() => null); return { ok: false, status: res.status, why: (j && j.why) || `the PC answered ${res.status}`, kind: (j && j.kind) || "http" }; }
      const bytes = new Uint8Array(await res.arrayBuffer()), h = (n) => res.headers.get(n) || "";
      let file = "";
      try { file = decodeURIComponent(h("X-Doc-Name")); } catch (e) {}
      return { ok: true, bytes, version: h("X-Doc-Version"), date: h("X-Doc-Date"), id: h("X-Doc-Id"), file };
    }
    // _pushRec: one document's newest content to the cloud. cur = { rec, data, bytes?, hash? }; doc when it is open
    // in this page. Answers { kind: "saved" | "same" | "later" | "refused" | "signin", why }.
    async _pushRec(cur, doc) {
      const m = doc ? meta(doc) : null;
      let rec = cur.rec;
      if (!this._reach) return { kind: "later" };
      if (m && m.hold > Date.now()) return { kind: "later", held: true }; // just after a clash: not again at once (two devices editing at the same time)
      let me = this._owner();
      if (!me) {
        if (rec.owner) { this._set({ signIn: true }); return { kind: "signin", why: W.signIn }; } // its owner signed out: it waits here for them
        const g = await this._guest();
        if (!g.ok) return this._verdict(g);
        me = this._owner();
        if (!me) return { kind: "later" };
      }
      if (rec.owner !== me) rec = await this._adopt(cur, me, doc);
      if (doc) { rec.version = doc.version || ""; rec.date = doc.date || ""; rec.cloudName = m.cloudName || ""; } // the open document knows what went up last
      const bytes = cur.bytes || (cur.bytes = await toBytes(cur.data));
      const hash = cur.hash || (cur.hash = await hashOf(bytes));
      let clashed = false;
      for (let round = 0; round < 6; round++) {
        if (!rec.cloudName) { // new in the cloud: its name must be free there
          const docs = await this._docs(3000);
          if (!docs) return this._verdict(this._failed);
          const names = new Set(docs.map((d) => lower(d.name)));
          if (names.has(lower(rec.name))) rec = await this._retitle(cur, names, doc);
        } else if (rec.cloudName !== rec.name) { // renamed while the cloud was off
          const r = await this.R.call("files", `app/${this.app}/doc/rename`, { method: "POST", json: { from: rec.cloudName, to: rec.name }, timeout: 30000 });
          if (r.ok) { rec.cloudName = rec.name; rec.id = fileId(r.data, rec.date) || rec.id; if (m) m.cloudName = rec.name; if (doc) doc.id = rec.id; this._docsCache = null; }
          else if (r.status === 409) { const docs = (await this._docs(0)) || []; rec = await this._retitle(cur, new Set(docs.map((d) => lower(d.name)).concat(lower(rec.name))), doc); continue; }
          else if (r.status === 404 && r.kind === "none") { rec.cloudName = ""; rec.version = ""; if (m) m.cloudName = ""; continue; }
          else return this._verdict(r);
        }
        const date = rec.date > today() ? rec.date : today(); // never an earlier day than the file it came from
        if (rec.cloudName && hash && hash === rec.version) return this._settled(cur, doc, {}, clashed); // the cloud has exactly this
        const r = await this._putDoc(rec.name, date, bytes, "&base=" + q(rec.version), cur.keepalive);
        if (r.ok && r.data && r.data.version) return this._settled(cur, doc, r.data, clashed);
        if (r.status === 409 && r.kind === "clash") {
          const theirs = (r.data && r.data.version) || "";
          if (hash && theirs === hash) return this._settled(cur, doc, { version: hash, date }, clashed); // the same content, from another tab
          if (!rec.cloudName) { this._docsCache = null; rec = await this._retitle(cur, new Set([lower(rec.name)]), doc); continue; }
          // both changed it. Theirs is kept as "<name> <date> (2)", then this one goes in: nothing is lost, nobody is asked
          const g = await this._getDoc(rec.name, `&date=${date}&copy=0`);
          if (g.ok) {
            const v = g.version || (await hashOf(g.bytes));
            if (!v) return this._verdict({ status: 0, why: "Cloud File Manager did not say which version it holds" }); // never a copy without knowing what it is a copy of
            const c = await this._putDoc(rec.name, date, g.bytes, "&as=copy");
            if (!c.ok) return this._verdict(c);
            rec.version = v;
          } else if (g.status === 404) rec.version = "";
          else return this._verdict(g);
          clashed = true;
          continue;
        }
        if (r.status === 401 && !this._owner()) { this._set({ signIn: true }); return { kind: "signin", why: W.signIn }; } // the sign-in ended on the PC
        return this._verdict(r);
      }
      return this._verdict({ status: 0, why: "the document keeps changing in Cloud File Manager" }); // tried again in a while
    }
    // the cloud has it: the record and the open document learn the new version
    async _settled(cur, doc, d, clashed) {
      const rec = cur.rec, m = doc ? meta(doc) : null;
      if (d.version) rec.version = d.version;
      if (d.date) rec.date = d.date;
      if (d.id) rec.id = d.id;
      rec.cloudName = rec.name;
      rec.kept = false;
      await soft(this._dev.settle(rec.key, rec.rev, { version: rec.version, date: rec.date, id: rec.id, cloudName: rec.name }), false);
      if (doc) { doc.version = rec.version; doc.date = rec.date; doc.id = rec.id || doc.id || ""; doc.source = "cloud"; m.cloudName = rec.name; m.owner = rec.owner; }
      this._set({ savedAt: Date.now(), problem: "", signIn: false, unsaved: false });
      if (clashed) {
        this._notice(W.clash(rec.name));
        if (m) { // two devices at the same document: each clash makes the next save wait longer, so copies do not pile up
          m.clashes = Date.now() - m.clashAt < 600000 ? m.clashes + 1 : 1;
          m.clashAt = Date.now();
          m.hold = Date.now() + Math.min(300000, 5000 * 2 ** (m.clashes - 1));
          this._holdUntil = Math.max(this._holdUntil || 0, m.hold);
        }
      }
      this._known.add(lower(rec.name));
      this._docsCache = null;
      if (rec.id && rec.id !== this._recentId) { this._recentId = rec.id; this.R.call("files", `app/${this.app}/recent`, { method: "POST", json: { id: rec.id, name: rec.name }, timeout: 15000 }); }
      this._last(rec.name);
      this._trim(rec.owner);
      this._tell("docs");
      return { kind: "saved" };
    }
    // nobody's document becomes this person's (it moves); another person's becomes a new one of this person's
    async _adopt(cur, me, doc) {
      const old = cur.rec, names = new Set((await soft(this._dev.docs(this.app, me), [])).map((r) => lower(r.name)));
      const change = (r) => Object.assign(r, { owner: me, name: unique(r.name, names), cloudName: "", version: "", date: "", id: "", kept: true, key: this._key(me, unique(r.name, names)) });
      let rec = old.owner ? null : await soft(this._dev.move(old.key, change), null);
      if (!rec) { rec = keptIn(change(Object.assign({}, old))); if (old.owner) await soft(this._dev.putDoc(rec, typeof cur.data === "string" ? cur.data : cur.bytes || (cur.bytes = await toBytes(cur.data)), rec.rev), null); }
      cur.rec = rec;
      if (doc) { const m = meta(doc); m.owner = me; m.cloudName = ""; m.rev = rec.rev; doc.name = rec.name; doc.version = ""; doc.date = ""; doc.id = ""; this._remember(doc); }
      return rec;
    }
    // the name is taken in the cloud (taken: lower-case names): a name of its own, free there and in this browser. Here
    // first; the cloud follows at the next step. A notice says which name it got.
    async _retitle(cur, taken, doc) {
      const old = cur.rec, was = old.name;
      for (const r of await soft(this._dev.docs(this.app, old.owner), [])) if (r.key !== old.key) taken.add(lower(r.name));
      const name = unique(was, taken.add(lower(was)));
      const change = (r) => Object.assign(r, { name, key: this._key(old.owner, name), kept: true });
      const rec = (await soft(this._dev.move(old.key, change), null)) || change(old);
      Object.assign(old, { name: rec.name, key: rec.key });
      cur.rec = old;
      if (doc) { doc.name = name; this._remember(doc); }
      this._known.add(lower(name));
      this._notice(W.savedAs(was, name));
      return old;
    }
    async _last(name) { // this is what was open last: said here, and to the cloud
      const me = this._owner(), said = me + SEP + lower(name);
      if (this._lastSaid === said) return;
      this._lastSaid = said;
      const mark = { key: this._key(me, "") + "last", name, at: Date.now(), sent: false };
      await soft(this._dev.put("marks", mark));
      if (!me || !this._reach) return;
      const r = await this.R.call("files", `app/${this.app}/last`, { method: "PUT", json: { name, at: mark.at }, timeout: 15000 });
      if (r.ok) { mark.sent = true; await soft(this._dev.put("marks", mark)); }
    }
    async _trim(owner) { // the browser keeps the newest few documents that are safe in the cloud, and everything that is not
      const recs = (await soft(this._dev.docs(this.app, owner), [])).filter((r) => !r.kept).sort((a, b) => b.at - a.at);
      const drop = recs.slice(KEEP_DOCS).map((r) => r.key).filter((k) => !this._docAt(k));
      if (drop.length) await soft(this._dev.del(drop));
    }

    // ---- saving ----
    // _write: into this browser first. Resolves the newest write, { rec, data, bytes, hash, ok } (ok: the browser kept it).
    _write(doc, data) {
      const m = meta(doc), seq = ++m.seq;
      return (m.w = m.w.then(async () => {
        if (seq < m.done) return m.cur; // something newer is in already (the page was hidden meanwhile)
        const bytes = await toBytes(data), hash = await hashOf(bytes);
        if (seq < m.done) return m.cur;
        if (m.owner === undefined) m.owner = this._owner();
        const rec = this._rec(doc, m, hash, bytes.byteLength);
        let ok = false;
        try {
          const r = await this._dev.putDoc(rec, typeof data === "string" ? data : bytes, m.rev);
          ok = true;
          if (r && r.displaced) this._notice(W.clashTab(doc.name));
          this._set({ device: true });
        } catch (e) { this._refused(); }
        m.rev = rec.rev;
        m.done = seq;
        this._remember(doc);
        return (m.cur = { rec, data, bytes, hash, ok, keepalive: !!this._leaving });
      }).catch((e) => { console.error("cloud-kit:", e); return m.cur || { rec: this._rec(doc, m, "", 0), data, ok: false }; }));
    }
    _rec(doc, m, hash, size) {
      return keptIn({ key: this._key(m.owner || "", doc.name), app: this.app, owner: m.owner || "", name: doc.name, cloudName: m.cloudName || "", version: doc.version || "",
        date: doc.date || "", id: doc.id || "", rev: rnd(), hash, size, at: Date.now(), kept: true });
    }
    // _push: the document's newest write to the cloud. Saves that arrive while one waits its turn go up together.
    _push(doc) {
      const m = meta(doc);
      if (m.queued) return m.queued;
      this._work(1);
      const job = this._q.then(async () => {
        m.queued = null;
        await m.w;
        return m.cur ? this._pushRec(m.cur, doc) : { kind: "same" };
      }).catch((e) => { console.error("cloud-kit:", e); return { kind: "later", why: String((e && e.message) || e) }; });
      m.queued = job;
      this._q = job.then(() => this._work(-1));
      return job;
    }
    // save: now. { ok, where: "cloud" | "device", why }
    async save(doc, data) {
      if (!doc || !savable(data)) return { ok: false, where: "", why: W.nothing };
      const why = badName(String(doc.name || ""));
      if (why) return { ok: false, where: "", why };
      doc.data = data;
      await this._dev.open();
      const w = await this._write(doc, data);
      await this.start();
      const r = this._reach ? await this._push(doc) : { kind: "later" };
      const up = r.kind === "saved" || r.kind === "same";
      if (!up && !w.ok) { this._set({ unsaved: true }); this._refused(); } // neither the cloud nor this browser has it
      await this._count();
      if (!up) this._later();
      if (up) return { ok: true, where: "cloud", why: "" };
      return w.ok ? { ok: true, where: "device", why: r.why || this.state.problem || this.state.why || "" } : { ok: false, where: "", why: r.why || this.state.why || W.notSaved };
    }
    // autosave: touch() on every change. It saves a moment after the last change, and at once when the page is
    // hidden or closed. One per open document; stop() when the document is closed or replaced.
    autosave(doc, getData) {
      const kit = this;
      let timer = 0, first = 0, dirty = false, stopped = false;
      const take = () => { clearTimeout(timer); timer = 0; first = 0; if (!dirty) return undefined; dirty = false; try { return getData(); } catch (e) { console.error("cloud-kit:", e); return undefined; } };
      const fire = () => { const data = take(); return data === undefined ? Promise.resolve(null) : kit.save(doc, data); };
      const a = {
        doc,
        get dirty() { return dirty; },
        touch() {
          if (stopped) return;
          dirty = true;
          if (hidden()) { a._hide(); return; }
          const now = Date.now();
          if (!first) first = now;
          clearTimeout(timer);
          timer = setTimeout(fire, Math.max(0, Math.min(kit.saveAfter, first + SAVE_MAX - now)));
        },
        flush: fire,
        stop() { stopped = true; kit._autos.delete(a); return fire(); },
        _hide() { // into the browser now, with nothing to wait for; then to the cloud as usual
          const data = take();
          if (data === undefined || !savable(data)) return;
          const m = meta(doc);
          if (m.owner === undefined) m.owner = kit._owner();
          const rec = kit._rec(doc, m, "", 0);
          if (kit._dev.putNow(rec, data)) { m.rev = rec.rev; m.done = ++m.seq; m.cur = { rec, data, ok: true, keepalive: true }; kit._remember(doc); }
          kit.save(doc, data);
        },
      };
      this._autos.add(a);
      this._remember(doc);
      return a;
    }
    // rename: here and in the cloud. { ok, why, kind }
    async rename(doc, to) {
      to = String(to == null ? "" : to).trim();
      const m = meta(doc), why = badName(to);
      if (why) return { ok: false, kind: "bad-name", why };
      await this.start();
      this._work(1);
      const job = this._q.then(async () => { // after a save that is on its way: it finishes under the old name first
        await m.w;
        const from = doc.name;
        if (from === to) return { ok: true };
        const me = this._owner(), owner = m.owner === undefined ? me : m.owner;
        if (lower(from) !== lower(to)) {
          const names = new Set((await soft(this._dev.docs(this.app, owner), [])).map((r) => lower(r.name)));
          if (this._reach && me && owner === me) for (const d of (await this._docs(0)) || []) names.add(lower(d.name));
          if (names.has(lower(to))) return { ok: false, kind: "exists", why: W.taken(to) };
        }
        let cloudName = m.cloudName, id = "";
        if (cloudName && this._reach && me && owner === me) {
          const r = await this.R.call("files", `app/${this.app}/doc/rename`, { method: "POST", json: { from: cloudName, to }, timeout: 30000 });
          if (r.ok) { cloudName = to; id = fileId(r.data, doc.date); } // the file has a new id under its new name
          else if (r.status === 409) return { ok: false, kind: "exists", why: W.taken(to) };
          else if (r.status === 404 && r.kind === "none") cloudName = "";
          else if (isLater(r)) this._down(r.why); // it is renamed here; the cloud follows when it is back
          else return { ok: false, kind: r.kind || "refused", why: r.why };
          this._docsCache = null;
        }
        const pending = !!cloudName && cloudName !== to;
        m.w = m.w.then(async () => {
          const change = (r) => Object.assign(r, { name: to, key: this._key(owner, to), cloudName, id: id || r.id, kept: r.kept || pending });
          const rec = await soft(this._dev.move(this._key(owner, from), change), null);
          if (m.cur) { change(m.cur.rec); keptIn(m.cur.rec); if (rec) m.cur.rec.rev = rec.rev; }
          doc.name = to;
          if (id) doc.id = id;
          m.cloudName = cloudName;
          this._remember(doc);
        });
        await m.w;
        this._recent(id, to);
        this._known.delete(lower(from));
        this._lastSaid = "";
        if (m.cur || m.cloudName) this._last(to);
        this._tell("docs");
        await this._count();
        if (pending) this._later();
        return { ok: true };
      }).catch((e) => { console.error("cloud-kit:", e); return { ok: false, kind: "failed", why: String((e && e.message) || e) }; });
      this._q = job.then(() => this._work(-1));
      return job;
    }

    // ---- opening ----
    _doc(name, data, o) { return { name, data, date: o.date || "", version: o.version || "", source: o.source, id: o.id || "" }; }
    _asData(body) { // what the program gets: text, or bytes when the kit was made with binary
      if (this.binary) { const b = typeof body === "string" ? enc.encode(body) : body; return b.buffer.byteLength === b.byteLength ? b.buffer : b.slice().buffer; }
      return typeof body === "string" ? body : dec.decode(body);
    }
    _docName(fileName) { // "My home 2026-11-11 (2).plan-cutter" is a file of the document "My home"
      const n = String(fileName || "");
      return this.ext && lower(n).endsWith(lower(this.ext)) ? n.slice(0, -this.ext.length).replace(/ \d{4}-\d{2}-\d{2}( \(\d{1,4}\))?$/, "") : "";
    }
    _stem(fileName) { // any file's name as a new document's name
      let n = this._docName(fileName) || String(fileName || "");
      if (!this._docName(fileName) && n.lastIndexOf(".") > 0) n = n.slice(0, n.lastIndexOf("."));
      n = n.replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, " ").replace(/[. ]+$/, "").trim().slice(0, 80).trim();
      return badName(n) ? W.untitled : n;
    }
    async _fromRec(got) { // a document from this browser's copy
      const rec = got.rec, body = typeof got.body === "string" ? got.body : (await toBytes(got.body)) || new Uint8Array(0);
      const doc = this._doc(rec.name, this._asData(body), { date: rec.date, version: rec.version, source: rec.cloudName ? "cloud" : "device", id: rec.id });
      const m = meta(doc);
      m.owner = rec.owner; m.cloudName = rec.cloudName || ""; m.rev = rec.rev;
      m.cur = { rec, data: body, hash: rec.hash || "", ok: true };
      this._remember(doc);
      this._last(doc.name);
      return doc;
    }
    async _keepCopy(doc, body, o) { // the silent copy of a document just read from the cloud
      const m = meta(doc);
      m.owner = this._owner(); m.cloudName = doc.name;
      const rec = this._rec(doc, m, o.hash || doc.version, body.byteLength || body.length || 0);
      rec.kept = false; keptIn(rec);
      try { await this._dev.putDoc(rec, body, ""); this._set({ device: true }); } catch (e) { this._refused(); }
      m.rev = rec.rev;
      m.cur = { rec, data: body, hash: rec.hash, ok: true };
      this._remember(doc);
    }
    // create: a new document, at once. Its name is made unique; it is saved at its first save.
    create(name) {
      let n = String(name == null ? "" : name).trim();
      if (badName(n)) n = W.untitled;
      n = unique(n, this._known);
      this._known.add(lower(n));
      return this._doc(n, this.binary ? new ArrayBuffer(0) : "", { source: "new" });
    }
    // openLast: what this person had open last: the cloud's word, or this browser's when the cloud is off. Or null.
    async openLast() {
      await this.start();
      const me = this._owner(), key = this._key(me, "") + "last";
      let mark = await soft(this._dev.get("marks", key), null);
      if (me && this._reach) {
        const r = await this.R.call("files", `app/${this.app}/last`, { timeout: 15000 });
        const v = r.ok && r.data && r.data.value;
        if (v && v.name && !(mark && !mark.sent && mark.at > (v.at || 0))) {
          mark = { key, name: String(v.name), at: v.at || 0, sent: true };
          await soft(this._dev.put("marks", mark));
        } else if (!r.ok && isLater(r)) this._down(r.why);
      }
      if (!mark || !mark.name) return null;
      this._lastSaid = me + SEP + lower(mark.name);
      return this.openDoc(mark.name);
    }
    // openDoc: one of this person's documents, by its name (as list() gives them). Or null.
    async openDoc(name) {
      await this.start();
      const me = this._owner(), key = this._key(me, name);
      const here = this._docAt(key);
      if (here) return here; // already open in this page
      const got = await soft(this._dev.getDoc(key), null);
      if (got && got.rec.kept) { this._recheck(); return this._fromRec(got); } // newer here than in the cloud: it goes up by itself
      if (me && this._reach && this.ext) {
        const g = await this._getDoc(name, "", got ? got.rec.version : "");
        if (g.ok && g.same) return this._fromRec(got); // the browser's copy is what the cloud has
        if (g.ok) {
          const real = this._docName(g.file); // its name as the cloud writes it
          const doc = this._doc(lower(real) === lower(name) ? real : got ? got.rec.name : name, this._asData(g.bytes), { date: g.date, version: g.version, source: "cloud", id: g.id });
          await this._keepCopy(doc, this.binary ? g.bytes : doc.data, { hash: g.version });
          this._last(doc.name);
          return doc;
        }
        if (g.status === 404) { if (got) await soft(this._dev.del([key])); return null; } // deleted in the cloud: the silent copy goes too
        if (isLater(g)) this._down(g.why);
        else if (!got) { this._notice(W.cantOpen(name, g.why)); return null; }
      }
      return got ? this._fromRec(got) : null;
    }
    // openById: a file of the Cloud File Manager by its id ("#open=<id>" from the file manager). Or null.
    async openById(id) {
      await this.start();
      id = String(id || "").replace(/^#?open=/, "").split("/")[0];
      if (!/^[0-9a-f]{20}$/.test(id)) { this._notice(W.cantOpen("", "")); return null; }
      if (!this._reach) { this._notice(W.cantOpen("", W.off)); return null; }
      let res;
      try { res = await this.R.fetch("files", "file/" + id, { cache: "no-store", timeout: 120000 }); }
      catch (e) { this._down(""); this._notice(W.cantOpen("", W.off)); return null; }
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        this._notice(W.cantOpen("", ((j && j.why) || `the PC answered ${res.status}`) + (this._owner() ? "" : " Sign in if it is yours.")));
        return null;
      }
      const name = nameIn(res.headers.get("Content-Disposition")) || W.untitled;
      const file = new File([await res.blob()], name, { type: res.headers.get("Content-Type") || "" });
      const doc = await this._fromCloud(file, id);
      this._recent(id, name);
      return doc;
    }
    _recent(id, name) { // the program's recent files, which the chooser shows on top
      if (!id || !this._owner() || !this._reach) return;
      this._recentId = id;
      this.R.call("files", `app/${this.app}/recent`, { method: "POST", json: { id, name: name || "" }, timeout: 15000 });
    }
    // a file that came from the Cloud File Manager: one of this program's own documents (it goes on as that
    // document), or anything else (its content, as a new document here: the file itself is never changed)
    async _fromCloud(file, id) {
      const me = this._owner();
      let mine = null;
      if (this.ext && me && id) for (const d of (await this._docs(3000)) || []) for (const f of d.files || []) if (f.id === id) mine = { name: d.name, date: f.date, copy: f.copy || 0 };
      const bytes = this.ext ? new Uint8Array(await file.arrayBuffer()) : null;
      if (mine) {
        const here = this._docAt(this._key(me, mine.name));
        let version = await hashOf(bytes);
        if (!version) { const g = await this._getDoc(mine.name, `&date=${mine.date}&copy=${mine.copy}`); version = g.ok ? g.version : ""; }
        if (here && here.version === version) return here;
        const doc = this._doc(mine.name, this._asData(bytes), { date: mine.date, version, source: "cloud", id });
        doc.file = file;
        await this._keepCopy(doc, this.binary ? bytes : doc.data, { hash: version });
        this._last(doc.name);
        return doc;
      }
      const doc = this._doc(unique(this._stem(file.name), this._known), bytes ? this._asData(bytes) : null, { source: "cloud", id });
      doc.file = file;
      return doc;
    }
    // open: the small Open chooser, under the program's Open button (o.anchor). Cloud File Manager first, then This
    // device (a file; and a folder when o.folder). o.accept: extensions; o.keep: { label } for one checkbox in the
    // cloud chooser; o.start: the folder the cloud chooser opens in ("Shared Folder/Reader files"; without it, the
    // program's own folder). Resolves the document (with file, and files / paths for a folder, and keep), or null.
    async open(o) {
      o = o || {};
      await this.start();
      const accept = accepts(o.accept || (this.ext ? [this.ext] : []));
      const rows = [{ id: "cloud", label: W.cloud, sub: this._reach ? "" : W.isOff, off: !this._reach, run: () => this._openCloud(o, accept) }];
      if (o.folder) rows.push({ id: "file", label: W.deviceFile, run: () => this._openDevice(false, accept) }, { id: "folder", label: W.deviceFolder, run: () => this._openDevice(true, accept) });
      else rows.push({ id: "file", label: W.device, run: () => this._openDevice(false, accept) });
      return (await menu(o.anchor, rows)) || null;
    }
    async _openCloud(o, accept) {
      if (!root.WindowKit) { console.error("cloud-kit: window-kit.js is not in the page"); return null; }
      let got;
      try {
        got = await root.WindowKit.pick(this.fileManager, { app: this.app, host: this.name || document.title, accept, multiple: false, files: o.files !== false,
          folder: o.folder === "zip" ? "zip" : o.folder ? "files" : false, keep: o.keep ? (typeof o.keep === "string" ? { label: o.keep } : o.keep) : undefined,
          start: typeof o.start === "string" ? o.start : "" });
      } catch (e) { this._notice(W.cantOpen("", String((e && e.message) || e))); return null; }
      if (!got || !got.files || !got.files.length) return null;
      let doc;
      if (got.kind === "folder" || got.kind === "zip") {
        doc = Object.assign(this._doc(got.folder || W.untitled, null, { source: "cloud", id: got.folderId || "" }), { kind: got.kind, files: got.files, paths: got.paths || [], missing: got.missing || "" });
        if (got.kind === "zip") doc.file = got.files[0];
        this._recent(got.folderId, got.folder);
      } else {
        const id = (got.ids && got.ids[0]) || "";
        doc = await this._fromCloud(got.files[0], id);
        this._recent(id, got.files[0].name);
      }
      doc.keep = !!got.keep;
      return doc;
    }
    async _openDevice(folder, accept) {
      const files = await pickFiles(folder, accept); // asked for inside the person's own click
      if (!files || !files.length) return null;
      if (folder) {
        const paths = files.map((f) => f.webkitRelativePath || f.name);
        return Object.assign(this._doc(paths[0].split("/")[0] || W.untitled, null, { source: "device" }), { kind: "folder", files, paths, missing: "", keep: false });
      }
      const f = files[0];
      const doc = this._doc(unique(this._stem(f.name), this._known), this.ext ? this._asData(new Uint8Array(await f.arrayBuffer())) : null, { source: "device" });
      doc.file = f;
      doc.keep = false;
      return doc;
    }
    // list: this person's documents for this program, newest first: [{ name, modified, date, id, size, kept }]
    async list() {
      await this.start();
      const me = this._owner(), out = new Map();
      const cloud = me && this._reach && this.ext ? await this._docs(0) : null;
      for (const d of cloud || []) { const f = (d.files || [])[0] || {}; out.set(lower(d.name), { name: d.name, modified: d.modified || 0, date: f.date || "", id: f.id || "", size: f.size || 0, kept: false }); }
      const gone = [];
      for (const o of me ? [me, ""] : [""]) {
        for (const r of await soft(this._dev.docs(this.app, o), [])) {
          const it = out.get(lower(r.name));
          if (it) { if (r.kept) { it.kept = true; it.modified = Math.max(it.modified, r.at); } }
          else if (cloud && !r.kept && !this._docAt(r.key)) gone.push(r.key); // deleted in the cloud: the silent copy goes too
          else out.set(lower(r.name), { name: r.name, modified: r.at, date: r.date, id: r.id || "", size: r.size || 0, kept: !!r.kept });
        }
      }
      if (gone.length) await soft(this._dev.del(gone));
      const list = Array.from(out.values()).sort((a, b) => b.modified - a.modified);
      this._known = new Set(list.map((d) => lower(d.name)).concat(this._docsOpen().map((d) => lower(d.name))));
      return list;
    }

    // ---- a copy on this device, and the Save chooser ----
    // downloadCopy: the document as a file in this device's downloads ("<name><ext>")
    async downloadCopy(doc, data) {
      const bytes = await toBytes(data === undefined ? doc.data : data);
      if (!bytes) return { ok: false, where: "", why: W.nothing };
      const a = document.createElement("a"), url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
      a.href = url;
      a.download = doc.name + this.ext;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return { ok: true, where: "copy", name: a.download, why: "" };
    }
    // saveMenu: the same small chooser for Save: Cloud File Manager (save now), This device (a copy). Or null.
    saveMenu(doc, data, o) {
      return menu(o && o.anchor, [
        { id: "cloud", label: W.cloud, run: () => this.save(doc, data) },
        { id: "device", label: W.device, run: () => this.downloadCopy(doc, data) },
      ]);
    }
    // account: the account window (sign in, set up user), the same page in every program
    account() {
      if (!root.WindowKit) return null;
      return root.WindowKit.open(this.accountPage, { title: W.account, name: "account", width: 440, height: 660 });
    }

    // ---- data: small values that follow the person (settings, places) ----
    _vkey(owner, key) { return this.app + SEP + owner + SEP + key; }
    _vjob(key, fn) { // one at a time per key, in the order asked
      const job = (this._vjobs.get(key) || Promise.resolve()).then(fn).catch((e) => { console.error("cloud-kit:", e); return { ok: false, where: "", why: String((e && e.message) || e) }; });
      this._vjobs.set(key, job);
      job.then(() => { if (this._vjobs.get(key) === job) this._vjobs.delete(key); });
      return job;
    }
    // get: the value, or null. The cloud's when it answers; this browser's when it is off or holds a newer one.
    async _dataGet(key) {
      await this.start();
      if (!KEY.test(key)) return null;
      await (this._vjobs.get(key) || Promise.resolve());
      const me = this._owner(), k = this._vkey(me, key), rec = await soft(this._dev.get("values", k), null);
      if (rec && rec.kept) return rec.value;
      if (me && this._reach) {
        const r = await this.R.call("files", `app/${this.app}/data/${q(key)}`, { timeout: 15000 });
        if (r.ok && r.data) {
          const value = r.data.value === undefined ? null : r.data.value;
          await soft(this._dev.put("values", { key: k, app: this.app, owner: me, name: key, value, version: r.data.version || "", at: r.data.modified || 0, kept: false }));
          return value;
        }
        if (isLater(r)) this._down(r.why);
      }
      return rec ? rec.value : null;
    }
    // set: { ok, where }. Nobody signed in: it stays in this browser (a setting never makes a guest) and goes up
    // when someone signs in who has none yet. The cloud off: kept here, sent when it is back.
    _dataSet(key, value) {
      if (!KEY.test(key) || key === "last" || key === "recent") return Promise.resolve({ ok: false, where: "", why: W.badKey });
      if (value === undefined) value = null;
      return this._vjob(key, async () => {
        await this.start();
        const me = this._owner(), k = this._vkey(me, key), old = await soft(this._dev.get("values", k), null);
        const rec = { key: k, app: this.app, owner: me, name: key, value, version: old ? old.version : "", at: Date.now(), kept: true };
        const here = await this._dev.put("values", rec).then(() => true, () => { this._refused(); return false; });
        let why = "";
        if (me && this._reach) {
          const r = await this.R.call("files", `app/${this.app}/data/${q(key)}`, { method: "PUT", json: value, timeout: 20000 });
          if (r.ok && r.data) {
            Object.assign(rec, { version: r.data.version || "", kept: false });
            await soft(this._dev.put("values", rec));
            this._tell("data", key);
            return { ok: true, where: "cloud", why: "" };
          }
          why = this._verdict(r).why;
        }
        this._tell("data", key);
        if (me) { await this._count(); this._later(); }
        return here ? { ok: true, where: "device", why } : { ok: false, where: "", why: why || this.state.why || W.notSaved };
      });
    }
    // update: read, change, write, as one step: fn(old) gives the new value. Another device wrote in between: again.
    _dataUpdate(key, fn) {
      if (!KEY.test(key)) return Promise.resolve({ ok: false, where: "", why: W.badKey });
      return this._vjob(key, async () => {
        await this.start();
        const me = this._owner(), k = this._vkey(me, key);
        let rec = await soft(this._dev.get("values", k), null);
        if (me && this._reach && !(rec && rec.kept)) {
          let r = await this.R.call("files", `app/${this.app}/data/${q(key)}`, { timeout: 15000 });
          for (let i = 0; i < 5 && r.ok && r.data; i++) {
            const value = fn(r.data.value === undefined ? null : r.data.value), version = r.data.version || "";
            const p = await this.R.call("files", `app/${this.app}/data/${q(key)}?base=${q(version)}`, { method: "PUT", json: value === undefined ? null : value, timeout: 20000 });
            if (p.ok && p.data) {
              await soft(this._dev.put("values", { key: k, app: this.app, owner: me, name: key, value, version: p.data.version || "", at: Date.now(), kept: false }));
              this._tell("data", key);
              return { ok: true, where: "cloud", value, why: "" };
            }
            if (p.status !== 409) { r = p; break; }
            r = { ok: true, data: p.data }; // the clash answer carries the cloud's value and version
          }
          if (!r.ok && isLater(r)) this._down(r.why);
        }
        const value = fn(rec ? rec.value : null);
        rec = { key: k, app: this.app, owner: me, name: key, value: value === undefined ? null : value, version: rec ? rec.version : "", at: Date.now(), kept: true };
        const here = await this._dev.put("values", rec).then(() => true, () => { this._refused(); return false; });
        this._tell("data", key);
        if (me) { await this._count(); this._later(); }
        return here ? { ok: true, where: "device", value, why: "" } : { ok: false, where: "", value, why: W.notSaved };
      });
    }
    // a value kept here goes up. The cloud's was changed after this one was set: the cloud's is the newer, it stays.
    async _pushValue(rec, me) {
      const path = `app/${this.app}/data/${q(rec.name)}`, mine = this._vkey(me, rec.name);
      if (!rec.owner) { // set while nobody was signed in: it becomes this person's, unless they have one already
        const r = await this.R.call("files", path + "?base=", { method: "PUT", json: rec.value, timeout: 20000 });
        if (!r.ok && r.status !== 409) return this._verdict(r);
        const has = await soft(this._dev.get("values", mine), null);
        if (r.ok && r.data && !has) await soft(this._dev.put("values", Object.assign({}, rec, { key: mine, owner: me, version: r.data.version || "", kept: false })));
        await soft(this._dev.remove("values", rec.key));
        this._emit("data", rec.name);
        return { kind: "saved" };
      }
      let r = await this.R.call("files", `${path}?base=${q(rec.version || "")}`, { method: "PUT", json: rec.value, timeout: 20000 });
      if (!r.ok && r.status === 409 && r.data) {
        if ((r.data.modified || 0) > rec.at) {
          await soft(this._dev.put("values", Object.assign({}, rec, { value: r.data.value === undefined ? null : r.data.value, version: r.data.version || "", at: r.data.modified, kept: false })));
          this._emit("data", rec.name);
          return { kind: "saved" };
        }
        r = await this.R.call("files", path, { method: "PUT", json: rec.value, timeout: 20000 });
      }
      if (!r.ok || !r.data) return this._verdict(r);
      const now = await soft(this._dev.get("values", rec.key), null);
      if (now && now.at === rec.at) await soft(this._dev.put("values", Object.assign({}, rec, { version: r.data.version || "", kept: false })));
      return { kind: "saved" };
    }
  }

  // ---- the small chooser: a menu under a button -----------------------------------------------------------------
  // rows: [{ id, label, sub, off, run }]. A click on a row calls its run() inside the click itself (so a file
  // picker may open) and the menu resolves what run() gives. Escape, or a click elsewhere: null.
  let lastShut = null;
  function menu(anchor, rows) {
    return new Promise((resolve) => {
      if (lastShut && lastShut.anchor === anchor && Date.now() - lastShut.at < 400) { lastShut = null; return resolve(null); } // the button pressed again: it closed
      const host = document.createElement("div"), back = document.activeElement;
      host.className = "cloud-kit-menu";
      const sh = host.attachShadow({ mode: "open" });
      sh.innerHTML = `<style>
.m{position:fixed;z-index:2147481500;box-sizing:border-box;min-width:220px;max-width:calc(100vw - 16px);padding:6px;border-radius:12px;background:var(--cloud-bg,#fff);color:var(--cloud-fg,#171c28);border:1px solid var(--cloud-line,rgba(15,23,42,.16));box-shadow:0 12px 34px rgba(15,23,42,.26),0 2px 6px rgba(15,23,42,.14);font:15px/1.25 "Segoe UI",system-ui,-apple-system,sans-serif}
.m.dark{background:var(--cloud-bg,#1b2130);color:var(--cloud-fg,#e8ecf6);border-color:var(--cloud-line,rgba(255,255,255,.18));box-shadow:0 12px 34px rgba(0,0,0,.6)}
button{all:unset;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;width:100%;min-height:44px;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:600}
button:hover,button:focus-visible{background:rgba(127,127,127,.18)}
button:focus-visible{outline:2px solid #2563eb;outline-offset:-2px}
button:disabled{cursor:default;opacity:.55;background:none}
.s{font-weight:400;font-size:13px;opacity:.8}.s:empty{display:none}
@media (pointer:coarse){button{min-height:50px;font-size:16px}}
</style><div class="m${isDark() ? " dark" : ""}" role="menu"></div>`;
      const box = sh.querySelector(".m");
      let done = false;
      const shut = (v) => {
        if (done) return;
        done = true;
        document.removeEventListener("pointerdown", outside, true);
        document.removeEventListener("keydown", keys, true);
        root.removeEventListener("resize", place);
        root.removeEventListener("blur", away);
        host.remove();
        if (v === null && back && back.focus && document.contains(back)) try { back.focus({ preventScroll: true }); } catch (e) {}
        resolve(v);
      };
      const away = () => shut(null);
      const outside = (e) => { if (e.composedPath().includes(host)) return; if (anchor && anchor.contains && anchor.contains(e.target)) lastShut = { anchor, at: Date.now() }; shut(null); };
      const keys = (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return shut(null); }
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const list = Array.from(box.querySelectorAll("button:not(:disabled)")), i = list.indexOf(sh.activeElement);
        if (list.length) list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1) + (i < 0 && e.key === "ArrowUp" ? 1 : 0)) % list.length].focus();
      };
      for (const r of rows) {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "menuitem");
        b.dataset.id = r.id;
        b.disabled = !!r.off;
        b.innerHTML = '<span class="l"></span><span class="s"></span>';
        b.querySelector(".l").textContent = r.label;
        b.querySelector(".s").textContent = r.sub || "";
        b.addEventListener("click", () => { let v; try { v = r.run ? r.run() : r.id; } catch (e) { console.error("cloud-kit:", e); v = null; } shut(v === null || v === undefined ? false : v); });
        box.appendChild(b);
      }
      document.body.appendChild(host);
      const place = () => { // under the button; above it when there is no room below; always inside the window
        const a = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
        const w = box.offsetWidth, h = box.offsetHeight, vw = root.innerWidth, vh = root.innerHeight;
        let x = a ? a.left : (vw - w) / 2, y = a ? a.bottom + 6 : Math.max(12, vh * 0.2);
        if (a && y + h > vh - 8 && a.top - h - 6 >= 8) y = a.top - h - 6;
        box.style.left = Math.round(Math.max(8, Math.min(x, vw - w - 8))) + "px";
        box.style.top = Math.round(Math.max(8, Math.min(y, vh - h - 8))) + "px";
      };
      place();
      document.addEventListener("pointerdown", outside, true);
      document.addEventListener("keydown", keys, true);
      root.addEventListener("resize", place); // a phone's keyboard going away resizes the page: the menu stays, in its place
      root.addEventListener("blur", away);
      const first = box.querySelector("button:not(:disabled)");
      if (first) first.focus({ preventScroll: true });
    });
  }
  // the browser's own picker for this device: a file, or a folder (the browser has two pickers)
  function pickFiles(folder, accept) {
    return new Promise((resolve) => {
      for (const old of document.querySelectorAll("input.cloud-kit-file")) old.remove();
      const inp = document.createElement("input");
      inp.type = "file";
      inp.className = "cloud-kit-file";
      inp.style.display = "none";
      if (folder) inp.webkitdirectory = true;
      else if (accept.length && !accept.includes("*")) inp.accept = accept.join(",");
      inp.addEventListener("change", () => { const files = Array.from(inp.files || []); inp.remove(); resolve(files); });
      inp.addEventListener("cancel", () => { inp.remove(); resolve(null); });
      document.body.appendChild(inp);
      inp.click();
    });
  }

  // ---- <cloud-status>: the dot and the few words -----------------------------------------------------------------
  // In the program's bar. It takes the bar's font and colour. for="<app>" names the kit when a page has several.
  // A click opens the account window when there is something to do there (nobody signed in, or a guest).
  const HTMLElementBase = root.HTMLElement || function () {};
  class CloudStatus extends HTMLElementBase {
    connectedCallback() {
      if (!this.shadowRoot) {
        this.attachShadow({ mode: "open" }).innerHTML = `<style>
:host{display:inline-flex;min-width:0;max-width:100%;vertical-align:middle;font-size:.875em;line-height:1.2}
.b{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:.5em;min-width:0;max-width:100%;padding:.3em .5em;border-radius:.6em;color:inherit;font:inherit;cursor:default}
.b.act{cursor:pointer}.b.act:hover{background:rgba(127,127,127,.16)}
.b:focus-visible{outline:2px solid #2563eb;outline-offset:1px}
.dot{flex:none;width:.7em;height:.7em;border-radius:50%;background:#8b93a1}
.ok .dot,.busy .dot{background:#22a05b}.wait .dot{background:#e08a00}.bad .dot{background:#e5484d}
.busy .dot{animation:p 1s ease-in-out infinite alternate}
@keyframes p{to{opacity:.35}}
@media (prefers-reduced-motion:reduce){.busy .dot{animation:none}}
.w{min-width:0;text-align:left}.w span{display:inline-block;max-width:100%}
.n{position:fixed;z-index:2147481400;box-sizing:border-box;max-width:min(320px,calc(100vw - 16px));padding:9px 12px;border-radius:10px;font:13px/1.35 "Segoe UI",system-ui,-apple-system,sans-serif;background:var(--cloud-bg,#fff);color:var(--cloud-fg,#171c28);border:1px solid var(--cloud-line,rgba(15,23,42,.16));box-shadow:0 8px 24px rgba(15,23,42,.2);cursor:pointer}
.n.dark{background:var(--cloud-bg,#1b2130);color:var(--cloud-fg,#e8ecf6);border-color:var(--cloud-line,rgba(255,255,255,.18));box-shadow:0 8px 24px rgba(0,0,0,.55)}
.n[hidden]{display:none}
</style><button class="b" type="button"><span class="dot"></span><span class="w" role="status"></span></button><div class="n" role="note" hidden></div>`;
        this.shadowRoot.querySelector(".b").addEventListener("click", () => { if (this._kit && this._act) this._kit.account(); });
        this.shadowRoot.querySelector(".n").addEventListener("click", () => { if (this._kit) this._kit._set({ notice: "" }); this._shut = this._note; this._draw(); });
      }
      this._bind();
    }
    disconnectedCallback() { if (this._off) this._off(); this._off = null; this._kit = null; waiting.delete(this); }
    _bind() {
      const want = this.getAttribute("for"), kit = want ? kits.get(lower(want)) : kits.values().next().value;
      if (!kit) { waiting.add(this); return; }
      waiting.delete(this);
      this._kit = kit;
      this._off = kit.on("state", () => this._draw());
      this._draw();
    }
    _draw() {
      const s = this._kit.state, sh = this.shadowRoot, b = sh.querySelector(".b"), w = sh.querySelector(".w"), n = sh.querySelector(".n");
      const a = s.account;
      this._act = !!root.WindowKit && s.cloud === "on" && (s.signIn || !a || a.kind === "guest");
      b.className = "b " + s.tone + (this._act ? " act" : "");
      b.tabIndex = this._act ? 0 : -1;
      w.textContent = "";
      s.words.forEach((t, i) => { if (i) w.appendChild(document.createTextNode(" ")); const sp = document.createElement("span"); sp.textContent = t; w.appendChild(sp); });
      const who = a ? `Signed in as ${a.name}.` : "Nobody is signed in.";
      b.title = [who, s.cloud === "off" ? sentence(s.why) : "", this._act ? (a && !s.signIn ? "Click to set up a user." : "Click to sign in.") : ""].filter(Boolean).join(" ");
      this._note = s.notice || (s.problem && s.problem !== W.notInCloud ? sentence(s.problem) : "");
      if (this._note !== this._shut) this._shut = "";
      const show = !!this._note && !this._shut;
      n.hidden = !show;
      if (show) {
        n.textContent = this._note;
        n.className = "n" + (isDark() ? " dark" : "");
        const r = this.getBoundingClientRect(), vw = root.innerWidth;
        n.style.top = Math.round(r.bottom + 6) + "px";
        n.style.left = Math.round(Math.max(8, Math.min(r.left, vw - Math.min(320, vw - 16) - 8))) + "px";
      }
    }
  }
  if (root.customElements && !root.customElements.get("cloud-status")) root.customElements.define("cloud-status", CloudStatus);

  root.CloudKit = {
    VERSION, WORDS: W, kits,
    // for({ app, ext, relay, binary, name }): the program's cloud (the same one when asked twice)
    for(o) {
      o = o || {};
      if (!o.app || !o.relay || typeof o.relay.call !== "function") throw new Error("CloudKit.for needs { app, relay } (relay: RelayClient.create({ app }))");
      const id = lower(o.app);
      if (!kits.has(id)) kits.set(id, new Kit(o));
      for (const el of Array.from(waiting)) el._bind();
      return kits.get(id);
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
