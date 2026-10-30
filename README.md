# ImgNovella

An online visual novel maker, in the spirit of Ren'Py but with no scripting: creators build branching stories with
scenes, characters, expressions, backgrounds, choices, variables, conditions and multiple endings, then publish them
for anyone to play in the browser, or download them as standalone HTML games to sell (itch.io, Gumroad, Ko-fi…).
Built on [Anvil](https://anvil.works).

- **App repo:** github.com/arkulinskis/imgnovella (branch `master`). Anvil pulls `master`.
- **Live:** not published yet (https://imgnovella.anvil.app assumed until the user sends the address).

## What it does

**For readers (no account needed):**
- **Discover** (`#discover`): published novels with covers, genre chips, search, sort (popular / newest / most liked), a Featured shelf.
- **Play** (`#play/<slug>`): the player with a title screen (Start, Continue, Load, Endings, Gallery, Story map, Settings, Credits),
  typewriter text with **bold**, *italic*, colour, big/small/shaking text and pauses, characters with expressions and positions,
  transitions, CG illustrations, built-in music moods and sound effects, timed choices, locked choices with hints,
  rollback (Back / Backspace / scroll up), History, Auto and Skip (read text only, or hold Ctrl), 6 save slots + autosave,
  endings collection, a Gallery of unlocked CGs, a Story map to replay from any scene found, text speed / size / volume settings,
  full screen and keyboard shortcuts. Saves and progress live in the reader's browser.
- Likes (signed in), share link, "you found X of Y endings", how readers' endings split, "More by" the creator, Report.

**For creators:**
- **Studio** (`#studio`, home after sign-in): their novels with status (Draft / Public / Unlisted / unpublished edits), stats,
  duplicate, delete; **New novel** from a blank page or the starter story ("Cherry Blossom Promise"), portrait (phones) or landscape.
- **Editor** (`#edit/<id>/<tab>/<scene>`), autosaves, undo (Ctrl+Z), Ctrl+S:
  - **Map:** the story graph: drag scenes, pan/zoom, Tidy up (auto-layout), choice / then / jump arrows with labels, START badge,
    ending colours, error dots; side panel to write, playtest from here, add a choice to a new scene, set as start, duplicate, delete.
  - **Write:** scene list, the scene's steps (Line, Background, Show/Hide character, Change variable, Jump, CG, Music, Sound, Effect,
    Pause, Ask the reader, Chapter card, Writer's note), an "only if" condition on any step, choices (target or "New scene…",
    condition, hide or show-locked with a hint, effects, once-only), "then go to", timed choices, endings (true / good / neutral /
    bad / secret, title, text), and a live preview of the selected step.
  - **Cast:** characters, name colour, an expression picture each; starter cast (Mira, Ren, Sol, Kuro, Conductor).
  - **Pictures:** upload (shrunk in the browser to the plan's limit), rename, kind, delete, usage counts; the starter art pack.
  - **Variables:** number / yes-no / text, starting values, notes, usage; renaming updates every reference; a syntax cheat sheet.
  - **Settings:** title, blurb, genre, rating, tags, cover; stage shape, text box style (Sakura, Midnight, Paper, Pixel), accent,
    font, text speed, title picture and music; starting scene, credits; publishing (public / unlisted / unpublish, share link); delete.
  - **Check:** finds dead ends, choices to nowhere, unreachable scenes, deleted pictures/characters, unknown variables and broken conditions.
  - **Playtest:** full-screen player from the start or any scene, with live, editable variables and a scene jumper.
  - **Publish:** freezes a snapshot for readers (errors block it); keep editing privately, publish again to update.
  - **Package & sell:** downloads the novel as one self-contained HTML file or an itch.io-ready .zip (index.html + README),
    with every picture embedded, plus a selling guide.
- **Plans:** Free = pictures up to 400 × 600 (either way round), 5 novels, 40 pictures each, "Made with ImgNovella" on exports.
  Pro = 1200 × 1800, 100 novels, 300 pictures, credit can be removed. Pro is switched on by an admin (`#pro` sends a request).
- **Guide** (`#guide`): concepts, conditions, text tags, reader controls, a "Coming from Ren'Py" table, selling.

**For everyone:** landing page (creators + readers), sign-up with email and password, profile (name, one-line bio),
feedback form, Privacy & Terms (`#legal`).

**For admins** (`#admin`; arkulinskis@gmail.com becomes an admin on first sign-in):
- **Overview** counts; **Feedback inbox** (incl. Pro requests) with notes; **Novels** (feature on Discover, take down);
  **Reports** (dismiss, or take the novel down); **Users** (Pro plan, admin, active); **Demo data** (3 creators, 4 novels).

## Setting it up in Anvil (once)

1. In the Anvil editor: **Create app → Clone from GitHub**, and paste `https://github.com/arkulinskis/imgnovella`.
2. **Users** service: email + password, sign-up allowed (already set in `anvil.yaml`; check it).
3. Open the app in the editor. If it shows a **Schema Mismatch** alert, choose **"The schema of the source code is correct"** so Anvil creates the tables.
4. **Run** it and sign up with **arkulinskis@gmail.com** straight away (that account becomes the admin).
5. **Publish** (Publish → public URL, or your own domain).

## Working on it

See `.claude/skills/imgnovella/SKILL.md`. In short:

```
python -I tools/check.py --ui                    # syntax, server tests, headless UI tests → ALL CHECKS PASSED
python -I tools/preview/devserver.py 8765        # the app on in-memory data: http://localhost:8765/  (?as=ana#studio, ?as=admin#admin)
python -I tools/make_art.py                      # redraw the starter art pack (assets/demo-*.svg)
python tools/deploy.py                           # dry run (needs PyYAML, so no -I)
python tools/deploy.py --push "Message"          # deploy: commit + push to GitHub, Anvil pulls it
```

## Project layout

```
web/            core.js/core.css (engine + Sakura Pop tokens), app.js (header, footer, icons), pages/*.html
  pages/_nv_runtime.html   the player (NovellaRuntime): self-contained, also embedded in exported games
  pages/_nv_tools.html     NVT: starter art list, picture URLs, story check, resize, layout, export + zip
  pages/_ed.html           ED: picture picker, preview, playtest, publish and Package & sell dialogs
  pages/edit.html          the editor; studio, discover, play, pro, guide, landing, profile, admin, auth
client_code/    Main.py (the only Anvil form: bridge, sign-in, IMG_API), legal.py
server_code/    Stories.py, Images.py (+ /img endpoint), DemoStories.py, DemoData.py, Admin.py, Accounts.py, Feedback.py, common.py (plans)
assets/         icon.svg + PNG icons, demo-*.svg starter art (tools/make_art.py), served at _/theme/<name>
tools/          sync_to_anvil.py (settings + table schema), deploy.py, check.py, make_art.py, preview/, testing/
```
