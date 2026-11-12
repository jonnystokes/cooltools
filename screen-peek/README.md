# Screen Peek

Test apparatus: shows Jon's PC screen live on this page through Tailscale Funnel, with a choice of
transports (TCP: WebSocket, stream, pipelined requests, one request per frame; UDP: a direct WebRTC data
channel in three reliability modes), partial updates, live stats
(fps, latency with clock sync, per-frame time breakdown, bytes saved) and an event log with Copy / Save.
It works only while Screen Peek is switched on at the PC (PC Relay's window, Programs), and only for people
allowed to use it: by default the main admin, signed in. Source, measurements and instructions: Jon's `Projects\screen-peek`
(its `python build_page.py` writes this page and its `version.json`).

Open it: https://jonnystokes.github.io/cooltools/screen-peek/
