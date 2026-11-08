# Cloud File Manager

The file manager for `Relay Files`, the shared folder on Jon's PC, through PC Relay. Browse, search, open and
download from any device; signed in with the PC's password: upload (drag and drop, whole folders), move, copy,
rename, delete into a trash you can restore from, and make folders private (they then need the password).

Open it: https://jonnystokes.github.io/Cool-tools/file-manager/

`window-kit.js` here lets any of these pages open the file manager (or another page) in a floating window and
ask it for files; the protocol and a five-line example are in `Projects\file-manager\kit\README.md`:

    <script src="https://jonnystokes.github.io/Cool-tools/file-manager/window-kit.js"></script>
    const got = await WindowKit.pick("https://jonnystokes.github.io/Cool-tools/file-manager/", { accept: [".zip"] });

The source lives in Jon's `Projects\file-manager` folder (`python build.py --publish` writes the page, the kit and
`version.json` here; the front page and the Apps menu read the version from it).
