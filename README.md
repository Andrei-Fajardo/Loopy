# Loopy!

A relaxing loop-and-pop browser game. Fish swim around a pond in five colours. Draw a loop around fish of one colour to pop them, chain combos, trigger Frenzy and keep the pond from filling up. Includes a fishing minigame, collectibles, daily missions and cosmetics.

Plain HTML, CSS and JavaScript, with no build step.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000.

## Controls

- Mouse: hold the left button, draw a loop around the fish, release to pop them.
- Touch: draw with your finger.
- P: pause. Enter or Space on the main menu: start.

## Folders

- `*.js`: game modules (`game.js` core loop, `fishing.js` minigame, `music.js`, `meta.js` progress and saves, and others).
- `fonts/`: Fredoka font files.
- `tutorial/`: tutorial clips and thumbnails.
- `qa/`: browser test scripts.
- `submission/`: CrazyGames listing draft.
