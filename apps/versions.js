/* versions.js 1.10: each program's version, the date it was last built and how long ago that was, under its line
   on the Cool tools front page and in the Apps menu. ONE source: Projects\app-kit\versions.js (built into the menu;
   published as https://jonnystokes.github.io/Cool-tools/apps/versions.js, which the front page loads).

   Every program's build writes version.json beside its page: {"app", "version", "built"}, built = "2026-11-07 5:03 PM"
   (Jon's 12-hour time on his PC, read as this device's local time; an ISO date is understood too). A link marked
   data-ver="<selector>" gets a line inside that element:
       Version 1.0.29 · updated Nov 7, 2026, 5:03 PM · 2 minutes and 30 seconds ago
   No date: just the version. No file (or one that cannot be read): nothing.

   "Ago" (Jon, 2026-11-07): the two biggest units, from years, months (calendar years and months), weeks, days,
   hours, minutes, seconds, milliseconds; the first a whole count, the second rounded to the nearest whole and left
   out when it rounds to zero ("3 days ago"); singular and plural. It stays current while the page is open: every
   50 ms under a minute old (milliseconds show), every second under an hour, every 15 s under a day, every 5 minutes
   under 30 days, every 30 minutes after; nothing while the page is hidden. */
(function (root) {
  "use strict";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DOT = String.fromCharCode(183);   // the middle dot between the parts
  const NBSP = String.fromCharCode(160);
  // On the page each part stays whole (a long line breaks only before a "·", never inside a date or time)
  const nb = (s) => s.replace(/ /g, NBSP);
  const sep = " " + DOT + NBSP;
  const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR, WEEK = 7 * DAY;

  // "2026-11-07 5:03 PM" (the house form), "2026-11-07T17:03:05" (a wall-clock time), "2026-11-07T17:03:00-08:00" or
  // "...Z" (a moment), "2026-11-07" (a day) -> { at: Date, time: true | false }, or null.
  function parse(s) {
    if (typeof s !== "string" || !(s = s.trim())) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?\s*([AaPp]\.?[Mm]\.?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/.exec(s);
    if (!m) return null;
    let at;
    if (m[4] === undefined) return okDate(new Date(+m[1], +m[2] - 1, +m[3]), false);
    if (m[9] && !m[8]) return okDate(new Date(s.replace(" ", "T")), true);
    let h = +m[4];
    if (m[8]) { if (h < 1 || h > 12) return null; h = (h % 12) + (/^p/i.test(m[8]) ? 12 : 0); }
    if (h > 23 || +m[5] > 59 || +(m[6] || 0) > 59) return null;
    at = new Date(+m[1], +m[2] - 1, +m[3], h, +m[5], +(m[6] || 0), +((m[7] || "0").padEnd(3, "0")));
    return okDate(at, true);
  }
  const okDate = (d, time) => (isNaN(d.getTime()) ? null : { at: d, time });

  // "Nov 7, 2026, 5:03 PM" (or "Nov 7, 2026" for a day)
  function format(p) {
    const d = p.at, day = `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    if (!p.time) return day;
    const h = d.getHours();
    return `${day}, ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  }
  function when(s) { const p = parse(s); return p ? format(p) : ""; }

  // ---- how long ago ------------------------------------------------------------------------------------------------
  const plural = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  const both = (n1, u1, n2, u2) => (n2 ? `${plural(n1, u1)} and ${plural(n2, u2)}` : plural(n1, u1));
  // a date n calendar months later (Jan 31 + 1 month = the last day of February)
  function addMonths(d, n) {
    const r = new Date(d.getTime()), day = r.getDate();
    r.setDate(1);
    r.setMonth(r.getMonth() + n);
    r.setDate(Math.min(day, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
    return r;
  }
  function monthsBetween(a, b) {
    let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    while (m > 0 && addMonths(a, m) > b) m--;
    return Math.max(0, m);
  }
  // under a calendar month: fixed units, the second rounded; a second unit that rounds up to a whole first unit
  // carries (59 minutes 59.6 seconds = 1 hour)
  const FIXED = [["week", WEEK], ["day", DAY], ["hour", HOUR], ["minute", MIN], ["second", SEC], ["millisecond", 1]];
  function fixed(ms) {
    for (let i = 0; i < FIXED.length; i++) {
      const [u, size] = FIXED[i];
      if (ms < size && i < FIXED.length - 1) continue;
      const first = Math.floor(ms / size);
      if (i === FIXED.length - 1) return plural(first, u);
      const [u2, size2] = FIXED[i + 1];
      const second = Math.round((ms - first * size) / size2);
      if (second * size2 >= size) return fixed((first + 1) * size);
      return both(first, u, second, u2);
    }
    return "";
  }
  // how long before b (default now) a was: "2 minutes and 30 seconds ago", "1 year and 3 months ago", "3 days ago"
  function ago(a, b) {
    b = b || new Date();
    const ms = b - a;
    if (!(ms >= 0)) return "just now";   // a device whose clock is a little behind the PC's
    const m = monthsBetween(a, b);
    if (m >= 12) {
      let y = Math.floor(m / 12);
      const mm = m - 12 * y, from = addMonths(a, m), to = addMonths(a, m + 1);
      let r = Math.round(mm + (b - from) / (to - from));
      if (r >= 12) { y += 1; r = 0; }
      return both(y, "year", r, "month") + " ago";
    }
    if (m >= 1) return both(m, "month", Math.round((b - addMonths(a, m)) / WEEK), "week") + " ago";
    return fixed(ms) + " ago";
  }
  const tickFor = (ms) => (ms < MIN ? 50 : ms < HOUR ? SEC : ms < DAY ? 15 * SEC : ms < 30 * DAY ? 5 * MIN : 30 * MIN);

  // ---- the lines ---------------------------------------------------------------------------------------------------
  // { text, version, date, at }: text "Version 1.0.29 · updated Nov 7, 2026, 5:03 PM" ("" without a version); at =
  // the build's moment when it has a time (for "ago")
  function info(j) {
    const none = { text: "", version: "", date: "", at: null };
    if (!j || typeof j !== "object" || typeof j.version !== "string") return none;
    const v = j.version.trim().replace(/^v(?=\d)/i, "").slice(0, 40);
    if (!v) return none;
    const p = parse(j.built || j.date || j.updated || "");
    const date = p ? format(p) : "";
    return { text: "Version " + v + (date ? ` ${DOT} updated ${date}` : ""), version: v, date, at: p && p.time ? p.at : null };
  }
  const line = (j) => info(j).text;

  const live = [];   // { el, at }: the "ago" parts on this page
  let timer = 0;
  function tick() {
    clearTimeout(timer);
    if (!live.length || (typeof document !== "undefined" && document.hidden)) return;
    const now = new Date();
    let next = 30 * MIN;
    for (const x of live) {
      if (!x.el.isConnected) continue;
      x.el.textContent = sep + nb(ago(x.at, now));
      next = Math.min(next, tickFor(now - x.at));
    }
    timer = setTimeout(tick, next);
  }
  function fill(a, into) {
    let url;
    try { url = new URL("version.json", a.href); } catch (e) { return; }
    fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const v = info(j);
      if (!v.text) return;
      const box = (into && a.querySelector(into)) || a;
      let s = box.querySelector(".ver");   // the line's place, kept by the page so nothing moves when it arrives
      if (!s) { s = document.createElement("span"); s.className = "ver"; box.append(s); }
      s.textContent = "";
      s.append(nb("Version " + v.version) + (v.date ? sep + nb("updated " + v.date) : ""));
      if (v.at) {
        const g = document.createElement("span");
        g.className = "ago";
        s.append(g);
        live.push({ el: g, at: v.at });
      }
      tick();
    }).catch(() => {});
  }
  function fillAll(scope) { for (const a of (scope || document).querySelectorAll("a[data-ver]")) fill(a, a.getAttribute("data-ver")); }
  root.AppsVersions = { parse, when, ago, line, info, fill, fillAll };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => { if (document.hidden) clearTimeout(timer); else tick(); });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => fillAll());
    else fillAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
