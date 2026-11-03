# PDF Web Slides - JavaScript

A [pdfpc](https://github.com/pdfpc/pdfpc)-inspired PDF-presenter implementation entirely in the browser. Open the website, select a PDF, and it renders the deck locally in the browser with a presenter view (including color-coded timer and speaker notes) and an audience window.

No conversion step is required. No backend is required.

## Usage

Open the `index.html` from a webserver, and select the PDF to present.

The `pdf.js` runtime is shipped locally, so the app doesn't need internet access.

Alternatively, run it with Docker:

```sh
docker compose up -d
```

The app is then served at http://localhost:8080.

### Offline use

When served over HTTPS (or from `localhost`), the app caches itself on the first visit and then works fully offline at the same address. Chromium-based browsers and Safari can also install it as a standalone app. Over plain HTTP the app still works, just without offline support.

### Releasing

Bump the version before deploying a new release:

```sh
scripts/release.sh 1.1
```

This sets the version shown in the app and the offline cache version in `sw.js`, which is what makes browsers download the new release. The update takes over once all windows of the app are closed, so a running presentation never switches versions. Files added to the app must also be listed in `ASSETS` in `sw.js`; the script refuses to bump if a listed file is missing.

While developing, the offline cache serves the previous files: bump the version, or enable "Update on reload" / "Bypass for network" in the browser's DevTools (Application > Service workers).

## Features

- Current slide, next slide, notes, timer, page indicator
- Keyboard navigation and swipe navigation
- Overview grid
- Timer duration, elapsed/remaining toggle, timer color coding
- Audience blackout
- Audience freeze
- Virtual laser pointer
- PDF annotation notes
- URL-based video overlays when the browser can load the referenced video
- Resizable current slide; the next slide grows with the sidebar as long as the longest notes still fit
- Manual next slide size (drag the divider below it, double-click to reset), with a warning when notes get cropped
- Dark mode (follows the system setting until toggled)

## Keyboard Shortcuts

| Key | Description |
| -- | -- |
| Right / Page Down | Next slide |
| Left / Page Up | Previous slide |
| Home | First slide |
| End | Last slide |
| Tab | Toggle overview |
| g | Go to slide |
| e | Mark current slide as the last slide for pacing |
| + | Increase notes size |
| - | Decrease notes size |
| b | Toggle audience blackout |
| f | Toggle audience freeze |
| r | Reset timer |
| p / Backspace | Toggle pointer |
| o | Open audience window |

## Notes And Video Limits

Notes are extracted from note-like PDF annotations, including hidden annotations that some PDF tools use for speaker notes, and shown in the presenter view.

Video overlays work for annotations that resolve to browser-loadable video URLs. If a PDF references local sibling media files on disk, a browser cannot access those files automatically from a user-selected PDF alone, so that legacy desktop behavior cannot be reproduced exactly.
	
