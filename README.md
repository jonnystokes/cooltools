# Cool tools

Browser tools by Jon Stokes. Each one is a single web page: open it and it runs, nothing to install.

| Tool | Open it | What it is |
|---|---|---|
| HYPERWAVE Studio | https://jonnystokes.github.io/Cool-tools/hyperwave/ | A studio of sound-reactive visuals: 79 shapes (4D wireframes and solids, fractals, clouds, solid 3D objects, spectrograms and spectrum waterfalls) that react to a microphone, PC audio, an audio file or 18 built-in demo tracks. Floating windows like a music studio: analyzer, mixer with hold-to-learn, mod matrix, scenes. |
| Select a book | https://jonnystokes.github.io/Cool-tools/books/ | Not on the front page; the Book reader's shelf lists the same books (from `books/index.json`). Jon's own books (American History; Better Smarter Homes) for the Book reader: pick one and it opens, downloaded once and kept on the device with your place. Adding a book = drop a folder with its zip into `books/` and push (`books/README.md`); a workflow lists the folders in `books/index.json`. |
| Book reader | https://jonnystokes.github.io/Cool-tools/reader/ | Reads books and documents aloud with AI voices that run in the browser (Kokoro, Piper, Supertonic, or the device's voices). Open a folder, files or a zip; several books, each with its own place; keeps reading with the screen off. |
| Simple Bench | https://jonnystokes.github.io/Cool-tools/simple-bench/ | A 10-second device test: processor and graphics card scores (Jon's PC = 1000) and which voice and settings the Book reader would suggest on this device. Downloads nothing. |
| Cloud File Manager | https://jonnystokes.github.io/Cool-tools/file-manager/ | The file manager for the shared folder on Jon's PC (through PC Relay): browse, search and download from any device; with the PC's password, upload (drag and drop), move, copy, rename, delete into a trash you can restore from, and make folders private. `window-kit.js` beside it lets any of these pages open it in a floating window and pick files. |
| Screen Peek (test) | https://jonnystokes.github.io/Cool-tools/screen-peek/ | Hello-world test of PC to phone over Tailscale Funnel: a live screenshot of Jon's PC, single or continuous. Password protected; runs through PC Relay on the PC (tray icon: PC Relay, program "Screen Peek" allowed). |
| Plan Cutter | https://jonnystokes.github.io/Cool-tools/plan-cutter/ | Draw a crooked room, place sheet material on a ceiling or wall, cut it along the walls and cabinets, and print the numbers to mark on the real board. |
| Client browser database manager | https://jonnystokes.github.io/Cool-tools/browser-storage/ | Shows and deletes what these tools have stored in the browser (local storage, databases, downloaded files), with sizes. |

The sound is analyzed only inside the page; nothing is sent anywhere.

The source of HYPERWAVE Studio lives in Jon's `Projects\hyperwave` folder (built with `python build.py`);
the Book reader's lives in `Projects\Walker of Worlds` (its `python build.py` writes `reader/index.html` here); Simple Bench's lives in `Projects\simple-bench`; the Cloud File Manager's lives in `Projects\file-manager` (`python build.py --publish` writes `file-manager/index.html` and `file-manager/window-kit.js` here).
This repository holds the finished pages.
