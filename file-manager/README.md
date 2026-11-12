# Cloud File Manager

Your files and the Shared Folder on Jon's PC, through PC Relay. Without an account: browse, search, open and
download what is in the Shared Folder. Signed in (the Apps button, top left; a password is optional): your own
files too, with upload (drag and drop, whole folders), move, copy, rename and delete into a trash you can restore
from. Admins change the Shared Folder and keep private folders in it. A file of one of these programs opens in
that program.

Open it: https://jonnystokes.github.io/cooltools/file-manager/

`window-kit.js` here lets any of these pages open the file manager (or another page) in a floating window and
ask it for files; the protocol and a five-line example are in `Projects\file-manager\kit\README.md`:

    <script src="https://jonnystokes.github.io/cooltools/file-manager/window-kit.js"></script>
    const got = await WindowKit.pick("https://jonnystokes.github.io/cooltools/file-manager/", { accept: [".zip"] });

`cloud-kit.js` beside it is what the programs open and save through (`Projects\file-manager\kit\CLOUD-KIT.md`).

The source lives in Jon's `Projects\file-manager` folder (`python build.py --publish` writes the page, the two kits
and `version.json` here; the front page and the Apps menu read the version from it).
