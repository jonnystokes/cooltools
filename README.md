# Cool tools

Browser tools by Jon Stokes. Each one is a single web page: open it and it runs, nothing to install.
The site is https://jonnystokes.github.io/cooltools/ (the old https://jonnystokes.github.io/Cool-tools/ forwards here).

People keep their files in the **Cloud File Manager** on Jon's PC, reached through **PC Relay**. Every program opens
and saves through it, and keeps a copy in the browser when the PC is off. Signing in is optional: a first save makes a
guest, and **Set up user** turns a guest into a user. The Apps button at the top left of every program is the way to
the other programs and to the account.

| Program | Open it | What it is |
|---|---|---|
| Book reader | https://jonnystokes.github.io/cooltools/reader/ | Reads books and documents aloud with AI voices that run in the browser. Open from the Cloud File Manager or this device; several books, each with its own place, which follows the person from device to device. |
| Cloud File Manager | https://jonnystokes.github.io/cooltools/file-manager/ | Your files and the Shared Folder, from anywhere: open, download, upload, move, rename and delete (into a trash). A file of one of these programs opens in that program. |
| Settings | https://jonnystokes.github.io/cooltools/settings/ | Your name, picture and password (`settings/account.html`, the account page every program opens). For admins: the people, programs, files and activity of the PC. |
| Plan Cutter | https://jonnystokes.github.io/cooltools/plan-cutter/ | Draw a crooked room, lay sheet material on a ceiling or wall, cut it along the walls and get the numbers to mark on the real board. Saves `.plan-cutter` files. |
| Screen Peek (test) | https://jonnystokes.github.io/cooltools/screen-peek/ | A live screenshot of Jon's desktop, single or continuous, for those allowed to use it. Works only while sharing is on at the PC. |
| Simple Bench | https://jonnystokes.github.io/cooltools/simple-bench/ | A 10-second device test: processor and graphics card scores, and which voice and settings the Book reader would suggest on this device. |
| Browser app cache manager | https://jonnystokes.github.io/cooltools/browser-storage/ | See and delete what these tools have stored in your browser, each thing named for its program. Never shows a sign-in. |
| HYPERWAVE Studio (archived) | https://jonnystokes.github.io/cooltools/hyperwave/ | Sound-reactive visuals that react to a microphone, PC audio or a file. Experimental and no longer worked on. The sound is analyzed only inside the page. |
| Apps (menu) | https://jonnystokes.github.io/cooltools/apps/ | Not on the front page: the menu every program's Apps button opens, with the account strip (Sign in, Set up user or Account) above the programs. |

## How this repository is made

- **It holds only finished pages.** Each folder is written by its program's build (`python build.py --publish` in the
  program's own folder under Jon's `Projects`); nothing here is edited by hand.
- **The list of programs is one file**, `Projects\app-kit\programs.json`. The Apps kit's build writes `apps/`, the
  front page's list in `index.html` (between `<!-- programs:` and `<!-- /programs -->`) and the cloud's hidden copy.
- **`relay.json`** holds the PC's public address. Every page reads it from here, so a new address is one edit.
- **Each program has a `version.json`** beside its page (`{"app", "version", "built"}`); the front page and the Apps
  menu show it.
- **Publishing:** commit only the folders of the programs you built. Before a commit, run
  `python C:\Users\jon\Projects\cool-tools-upgrade\switch\check_current.py --live`: it says for each program whether
  the page here is the newest build and carries the present shared scripts.
- The rules every program follows: `Projects\WEB-APP-CONVENTIONS.md`.

| Folder | Source |
|---|---|
| `reader/` | `Projects\Walker of Worlds` |
| `file-manager/` | `Projects\file-manager` (also `window-kit.js` and `cloud-kit.js`, the shared kits) |
| `settings/` | `Projects\settings` |
| `plan-cutter/` | `Projects\plan-cutter` |
| `screen-peek/` | `Projects\screen-peek` |
| `simple-bench/` | `Projects\simple-bench` |
| `browser-storage/` | `Projects\browser-storage` |
| `hyperwave/` | `Projects\hyperwave` (archived, not rebuilt) |
| `apps/`, the list in `index.html` | `Projects\app-kit` |
