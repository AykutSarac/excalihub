<p align="center">
  <img src="icons/icon128.png" width="80" alt="Excalihub logo" />
</p>

<h1 align="center">Excalihub</h1>

<p align="center">
  A Chrome extension that supercharges <a href="https://excalidraw.com">Excalidraw</a> — save &amp; organize drawings, presentation mode, and AI diagram generation, all without leaving the canvas.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/excalihub/lihpbdgcmndoecbiceiknanhgclbkmab"><img src="https://img.shields.io/badge/Chrome%20Web%20Store-Install-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Web Store" /></a>
  <a href="https://github.com/AykutSarac/excalihub/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://excalidraw.com"><img src="https://img.shields.io/badge/works%20with-Excalidraw-6965db" alt="Works with Excalidraw" /></a>
</p>

<br />

<img width="1280" height="800" alt="Excalihub screenshot" src="https://github.com/user-attachments/assets/88afff04-f24b-458e-abd5-465b5d944006" />

---

## Features

- **Save & Organize** — Save scenes, rename files, organize into folders, import/export `.excalidraw` files
- **Presentation Mode** — Turn frames into slides and present directly from Excalidraw with keyboard navigation, fullscreen, theme toggle, and slide export
- **AI Generation** — Describe a diagram in plain text and get a full Excalidraw scene with shapes, arrows, and labels
- **Extend Canvas** — AI reads your existing drawing and adds to it contextually
- **Share** — Generate shareable Excalidraw links from the file menu
- **Bulk Export** — Download your entire library as a `.zip`
- **Dark Mode** — Automatically matches Excalidraw's theme
- **BYOK** — Uses the Anthropic API with your own key, stored locally

## Installation

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/excalihub/lihpbdgcmndoecbiceiknanhgclbkmab), or build manually:

```bash
git clone https://github.com/AykutSarac/excalihub.git
cd excalihub
npm install
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the project folder.

## Development

```bash
npm run watch    # rebuild on file changes
npm run zip      # create a release zip
```

## License

[MIT](LICENSE)
