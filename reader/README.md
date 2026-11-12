# Book reader

A book and text reader that reads aloud with AI voices running inside the browser (Kokoro, Piper,
Supertonic, or the device's own voices). Open a folder, files or a zip; it keeps several books, each
with its own place, and keeps reading with the screen off.

Open it: https://jonnystokes.github.io/cooltools/reader/

Everything runs on your device. Books, edits and voice files are stored in your browser; the voice
models are downloaded once from public CDNs. Nothing you read is sent anywhere, with these exceptions.
Signed in, your place in each book (the book's name, the chapter and the paragraph) and a few settings
are kept on Jon's PC, so they follow you from device to device. A file opened from the Cloud File
Manager comes from that PC. And the PC's own voice, for those allowed to use it, is made on that PC
from the text being read.

The source lives in Jon's `Projects\Walker of Worlds` folder (built with `python build.py`, which
also writes this page and its `version.json`); this folder holds only the finished page.
