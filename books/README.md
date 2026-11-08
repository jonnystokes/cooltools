# Select a book

A shelf of Jon Stokes's own books for the Book reader. Each book is a folder here with one zip of text
files; the page lists them from the generated `index.json` and each **Open** button opens
`../reader/?book=<id>`: the reader downloads the zip once (with progress), keeps it in the browser with
your place in it, and opens it. Opening the same link again just opens the stored book; when the shelf
has a newer version, the reader replaces the stored copy and keeps your place. The reader's Open window
also has an **Online library** section listing the same books with Add / Open / Update buttons.
**Open the empty reader** is the reader as before, with no book chosen (add your own).

Open it: https://jonnystokes.github.io/cooltools/books/

| Book | What it is |
|---|---|
| American History | Plain-language U.S. history for readers of about 8 to 15: 37 subjects, each told through the same ten eras. Imported as one book with a section per subject and a chapter per era. |
| Better Smarter Homes | A field manual for planning, building and keeping a long-life concrete home in Oregon. One chapter per file. |

## How to add a book (3 steps)

1. **Make the folder** `books/<id>/` (the id becomes the link: `reader/?book=<id>`; letters, digits and
   dashes, e.g. `books/my-book/`).
2. **Put the book in it:** one zip of `.md` or `.txt` files (any name; one file per chapter, or folders of
   files for sections), and a small `book.json`:
   ```json
   { "title": "My Book", "description": "One line about it.", "author": "Jon Stokes", "options": { "sections": true } }
   ```
   Every field is optional: the title defaults to the folder name made readable ("my-book" → "My Book"),
   description and author to nothing, `options` to none (`sections: true` = one book with a section per
   folder of the zip; the reader never sets "Read across time" from here). With two zips in the folder, add
   `"zip": "name.zip"`.
3. **Push.** The Books index workflow (`.github/workflows/books-index.yml`) runs `make_index.py`, commits
   the new `index.json`, and GitHub Pages publishes it with the folder a minute or two later. The page
   and the reader then list the book. A folder it cannot list (no zip, two zips with no `"zip"` line, a
   broken `book.json`) is shown on the page with the reason.

To change a book, replace its zip and push: its version (a hash of the zip's entries) changes only when
the text does, and the reader then offers "update available" and replaces the stored copy, keeping the
place. To preview before pushing, run `python make_index.py` here and open the page from a local server.

## Files

- `<id>/`: one book: its zip and `book.json`.
- `index.json`: the generated list. Per book: `id`, `title`, `description`, `author`, `zip` (relative to
  this folder), `version` (a short hash of the zip's entries: names, CRCs and sizes, so unchanged text keeps
  the version), `updated` (the folder's last commit date), `size` (bytes), `files`, `words`, `options`;
  plus `problems` (folders that could not be listed, with the reason). Made by the workflow; do not edit.
- `make_index.py`: makes `index.json` from the folders (the workflow runs it; run it by hand to preview).
- `make_books.py`: rebuilds the two books above from the manuscript folders on Jon's PC
  (`python make_books.py`): writes `<id>/book.zip` and `<id>/book.json`, then runs `make_index.py`. It
  writes only into this folder and never changes the sources. Files it leaves out (an unwritten skeleton
  chapter, a table of contents) are printed with the reason. Other books need no entry in it.

Every file here stays under GitHub Pages' 50 MB limit. The reader's source is in Jon's
`Projects\Walker of Worlds` folder (`src/shelf.js` reads the index and loads a book).
