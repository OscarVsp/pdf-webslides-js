# PDF Web Slides - JavaScript

A [pdfpc](https://github.com/pdfpc/pdfpc)-inspired PDF-presenter implementation entirely in the browser. Open the website, select a PDF, and it renders the deck locally in the browser with a presenter view (including color-coded timer and speaker notes) and an audience window.

No conversion step is required. No backend is required.

## Usage

Open the `index.html` from a webserver, and select the PDF to present.

The `pdf.js` runtime is shipped locally, so the app doesn't need internet access.

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
	
