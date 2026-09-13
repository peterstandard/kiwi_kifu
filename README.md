# 🥝 Kifu Kiwi (SimpleKifu)

A lightweight, mobile-first web Go (Weiqi / igo / Baduk) SGF recorder and editor designed for recording games in real-time at Go clubs.

Built with **Zero Build Tools** using modern native Browser ES Modules (`<script type="module">`).

---

## Features

- **Full Go Rules Engine:**
  - Liberties & multi-stone group captures.
  - Strict suicide move prevention.
  - Positional Ko rule enforcement.
  - Standard handicap stones (19×19, 13×13, 9×9) with White playing first.
- **Mobile-First Touch Ergonomics:**
  - **Pinch-to-zoom & Pan:** Smooth 1.0× to 3.5× zoom with focal point tracking and floating zoom controls.
  - **Tap-and-Confirm Mode:** High-precision two-step placement with ghost stone preview (ideal for small phone screens).
  - **Move Numbering Modes:** Cycle between Last Move, Last 10 Moves, All Moves, or Numbers Off.
  - **Bottom Navigation:** Large Undo / Pass / Redo buttons accessible with one hand.
- **Audio & Display Utilities:**
  - **Synthesized Stone Clack:** Realistic slate/shell impact transient & kaya wood resonance synthesized via Web Audio API (zero audio file downloads).
  - **Screen Wake Lock:** Keep-awake toggle (`☕`) so your phone screen never times out during a game.
- **Sharing & Portability:**
  - **URL Hash Direct Linking:** Game state encodes into `#sgf=...` URL fragment for instant peer-to-peer sharing.
  - **QR Code Sharing:** Built-in QR code generation for camera scanning.
  - **Native Web Share:** Supports OS share sheet (`📲`) on mobile browsers.
  - **Offline PWA:** Installable as a progressive web app with Service Worker caching.
  - **Game Archive Library:** Local browser storage archive with one-click export/import.

---

## Project Structure

```text
kifu_kiwi/
├── index.html              # Clean semantic HTML5 layout & SVG board
├── style.css               # Responsive dark theme UI
├── sw.js                   # Service worker for offline PWA caching
├── manifest.json           # Web App Manifest
├── qrcode.min.js           # Lightweight standalone QR generator
├── test.js                 # Zero-dependency Go rules & SGF invariant tests
├── deploy.sh               # One-command sync to public web server directory
└── js/
    ├── main.js             # App controller, event wiring, and modals
    ├── engine/
    │   ├── constants.js    # Board coordinate letters & hoshi map
    │   ├── sgf.js          # SGF parser, serializer, & coordinate math
    │   └── game.js         # Pure Go rules engine (zero DOM dependencies)
    ├── board/
    │   ├── renderer.js     # High-performance SVG board renderer
    │   └── gestures.js     # Pinch-to-zoom, pan, drag, and tap detection
    ├── audio/
    │   └── sound.js        # Web Audio API stone clack synthesis
    └── services/
        ├── storage.js      # LocalStorage game archive & autosave
        ├── wakelock.js     # Screen Wake Lock API service
        └── share.js        # URL hash decoding, QR generation, Web Share
```

---

## Development & Testing

Run the zero-dependency test suite directly in Node.js:

```bash
node test.js
```

### Deploying to Web Server

To deploy clean client-facing assets to your public web folder:

```bash
./deploy.sh
```
