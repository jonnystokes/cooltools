# Simple Bench

A short device test (about 10 to 20 seconds): processor and graphics card scores against Jon's PC
(= 1000), and the voice and settings the Book reader would suggest on this device, with every voice
setup marked (runs well / barely / too slow / can't run here) and its predicted speed.

Open it: https://jonnystokes.github.io/Cool-tools/simple-bench/

Everything runs on your device. It downloads nothing, speaks nothing aloud and sends nothing anywhere.

The source lives in Jon's `Projects\simple-bench` folder (its `python build.py` copies the Book
reader's rules into the page; its `python publish.py` writes this page and `version.json` here); this folder
holds only the finished page.
