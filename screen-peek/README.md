# Screen Peek

Test apparatus: shows Jon's PC screen live on this page through Tailscale Funnel, with a choice of
transports (TCP: WebSocket, stream, pipelined requests, one request per frame; UDP: a direct WebRTC data
channel in three reliability modes), partial updates, live stats
(fps, latency with clock sync, per-frame time breakdown, bytes saved) and an event log with Copy / Save.
It works only while the Screen Peek tray app on the PC is switched ON, and only with the password set in
the tray (asked once per browser). Source, measurements and instructions: Jon's `Projects\screen-peek`
(its `python build_page.py` writes this page and its `version.json`).

Open it: https://jonnystokes.github.io/cooltools/screen-peek/
