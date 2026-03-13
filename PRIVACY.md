# Privacy Policy for Excalihub

**Effective date:** March 12, 2026

## Overview

Excalihub is a Chrome extension that lets you save, organize, and revisit your Excalidraw drawings directly in the browser. Privacy is a core design principle — the extension works entirely on your device.

## Data We Collect

**We do not collect any personal data.**

The extension stores only the Excalidraw drawing files you explicitly save. This data is:

- Saved locally on your device using Chrome's `storage.local` API
- Never transmitted to any server operated by Excalihub
- Never shared with third parties
- Never used for analytics, advertising, or profiling

## Local Storage

All drawings and folder structures you create are stored locally in your browser's extension storage (`chrome.storage.local`). This data never leaves your device unless you use the Share feature described below.

## Share Feature (Optional, User-Initiated)

When you explicitly click the **Share** button on a saved drawing, the drawing data is sent to [Excalidraw's own sharing service](https://excalidraw.com) (`json.excalidraw.com`) to generate a shareable link. This is:

- Entirely optional — sharing is never triggered automatically
- Handled by Excalidraw's infrastructure, not Excalihub
- Subject to [Excalidraw's own privacy policy](https://plus.excalidraw.com/blog/end-to-end-encryption)

## AI Drawing Generation (Optional, User-Initiated)

The extension includes an optional AI drawing generation feature powered by the Anthropic API. When you use this feature:

- **Your API key is required.** You must provide your own Anthropic API key via the hamburger menu > "API Key Settings". The key is stored locally in `chrome.storage.local` and is **only** sent to `https://api.anthropic.com`.
- **Your prompt text** is sent to the Anthropic API to generate Excalidraw drawings. When using "Extend canvas" mode, a summary of the current canvas (shape types, positions, and labels) is also included.
- **No data is sent unless you click "Generate."** The feature is never triggered automatically.
- **We recommend using a dedicated, low-limit API key** for this extension, as the key is sent from the browser and may be visible in browser developer tools.

No other network requests are made by this extension.

## Permissions

| Permission | Why it's needed |
|---|---|
| `storage` | Save your drawings locally on your device |
| `unlimitedStorage` | Allow saving large drawing files beyond the default 10 MB browser quota |
| `host_permissions: excalidraw.com` | Inject the sidebar UI into the Excalidraw editor page |
| `host_permissions: api.anthropic.com` | Send prompts to the Anthropic API for AI drawing generation (only when you click Generate) |

## Data Retention and Deletion

Your drawings are stored until you delete them. You can delete individual files or all saved data at any time using the **Delete all** option inside the extension sidebar. Uninstalling the extension will also remove all locally stored data.

## Changes to This Policy

If this policy changes, the updated version will be published in this repository with a new effective date.

## Contact

For questions or concerns, open an issue at [github.com/AykutSarac/excalihub](https://github.com/AykutSarac/excalihub).
