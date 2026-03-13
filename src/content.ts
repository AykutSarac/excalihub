import { saveCurrentScene, handleFileImport, renderFileList, closeAllMenus, exportAllFiles, deleteAllFilesPrompt, handleAiGenerate, showApiKeySettings } from "./ui";
import { enterPresentationMode, getFramesFromScene, PresentationFrame } from "./presentation";
import { getExcalidrawTheme } from "./theme";

function applyTheme(): void {
  const theme = getExcalidrawTheme();
  const isDark = theme === "dark";
  document
    .getElementById("excalihub-panel")
    ?.classList.toggle("theme-dark", isDark);
  document
    .getElementById("excalihub-toggle")
    ?.classList.toggle("theme-dark", isDark);
  document
    .getElementById("excalihub-modal-overlay")
    ?.classList.toggle("theme-dark", isDark);
}

function observeTheme(): void {
  const observer = new MutationObserver(() => applyTheme());
  const target =
    document.querySelector(".excalidraw") || document.documentElement;
  observer.observe(target, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

// ── Presentation drawer view ─────────────────────────────────────────
let presentationFrames: PresentationFrame[] = [];
let presPollingTimer: ReturnType<typeof setInterval> | null = null;

function showPresentationView(): void {
  const panel = document.getElementById("excalihub-panel")!;

  // Ensure panel is open
  const toggle = document.getElementById("excalihub-toggle")!;
  if (!panel.classList.contains("open")) {
    panel.classList.add("open");
    toggle.classList.add("shifted");
  }

  const frames = getFramesFromScene();
  presentationFrames = [...frames];

  // Hide main content, show presentation view
  panel.querySelectorAll<HTMLElement>(
    ".excalihub-header, .excalihub-actions, .excalihub-ai-section, .excalihub-file-list, .excalihub-footer, #excalihub-file-input"
  ).forEach((el) => (el.style.display = "none"));

  // Remove existing presentation view if any
  panel.querySelector(".excalihub-pres-view")?.remove();

  const view = document.createElement("div");
  view.className = "excalihub-pres-view";
  view.innerHTML = `
    <div class="excalihub-pres-header">
      <button class="excalihub-pres-back" id="excalihub-pres-back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <h2>Presentation</h2>
    </div>
    <div class="excalihub-pres-subtitle">Slides (${presentationFrames.length})</div>
    <div class="excalihub-pres-slides" id="excalihub-pres-slides"></div>
    <div class="excalihub-pres-footer">
      <button class="excalihub-btn primary excalihub-pres-start-btn" id="excalihub-pres-start"${presentationFrames.length === 0 ? " disabled" : ""}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Start presentation
      </button>
    </div>
  `;
  panel.appendChild(view);

  rebuildSlideItems();
  initSlideListDragDrop();

  // Back button
  document.getElementById("excalihub-pres-back")!.addEventListener("click", hidePresentationView);

  // Start button
  document.getElementById("excalihub-pres-start")!.addEventListener("click", () => {
    panel.classList.remove("open");
    toggle.classList.remove("shifted");
    hidePresentationView();
    enterPresentationMode(presentationFrames);
  });

  // Start polling to sync frame names/additions/removals
  startPresPolling();
}

function syncFramesFromScene(): void {
  const freshFrames = getFramesFromScene();
  const freshMap = new Map(freshFrames.map((f) => [f.id, f]));
  const existingIds = new Set(presentationFrames.map((f) => f.id));
  const freshIds = new Set(freshFrames.map((f) => f.id));

  // Check if structural change occurred (added/removed frames)
  const removed = presentationFrames.some((f) => !freshMap.has(f.id));
  const added = freshFrames.some((f) => !existingIds.has(f.id));
  const structuralChange = removed || added;

  if (structuralChange) {
    // Structural change: rebuild array preserving user order
    presentationFrames = presentationFrames
      .filter((f) => freshIds.has(f.id))
      .map((f) => ({ ...f, ...freshMap.get(f.id)! }));

    for (const f of freshFrames) {
      if (!existingIds.has(f.id)) presentationFrames.push(f);
    }

    updatePresSubtitle();
    rebuildSlideItems();
    return;
  }

  // No structural change — do surgical name/position updates only
  let anyNameChanged = false;
  for (const f of presentationFrames) {
    const fresh = freshMap.get(f.id)!;
    if (f.name !== fresh.name) anyNameChanged = true;
    f.name = fresh.name;
    f.x = fresh.x;
    f.y = fresh.y;
    f.width = fresh.width;
    f.height = fresh.height;
  }

  // Patch DOM in-place for name changes (no re-render, no drag state reset)
  if (anyNameChanged) {
    const container = document.getElementById("excalihub-pres-slides");
    if (!container) return;
    const items = container.querySelectorAll(".excalihub-pres-slide-item");
    items.forEach((item, i) => {
      if (i < presentationFrames.length) {
        const nameEl = item.querySelector(".excalihub-pres-slide-name");
        if (nameEl) nameEl.textContent = presentationFrames[i].name;
      }
    });
  }
}

function updatePresSubtitle(): void {
  const subtitle = document.querySelector(".excalihub-pres-subtitle");
  if (subtitle) subtitle.textContent = `Slides (${presentationFrames.length})`;
  const startBtn = document.getElementById("excalihub-pres-start") as HTMLButtonElement | null;
  if (startBtn) startBtn.disabled = presentationFrames.length === 0;
}

function startPresPolling(): void {
  stopPresPolling();
  presPollingTimer = setInterval(syncFramesFromScene, 1000);
}

function stopPresPolling(): void {
  if (presPollingTimer !== null) {
    clearInterval(presPollingTimer);
    presPollingTimer = null;
  }
}

function buildSlideItemEl(frame: PresentationFrame, index: number): HTMLElement {
  const item = document.createElement("div");
  item.className = "excalihub-pres-slide-item";
  item.draggable = true;
  item.dataset.index = String(index);
  item.innerHTML = `
    <span class="excalihub-pres-slide-handle" title="Drag to reorder">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
        <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
        <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
      </svg>
    </span>
    <span class="excalihub-pres-slide-number">${index + 1}</span>
    <span class="excalihub-pres-slide-name">${escapeHtml(frame.name)}</span>
  `;
  return item;
}

function rebuildSlideItems(): void {
  const container = document.getElementById("excalihub-pres-slides");
  if (!container) return;

  if (presentationFrames.length === 0) {
    container.innerHTML = `
      <div class="excalihub-pres-empty">
        <p>No frames found on the canvas.</p>
        <p>Add frames to your drawing to create slides.<br/>Tip: Press F or use the frame tool.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";
  presentationFrames.forEach((frame, index) => {
    container.appendChild(buildSlideItemEl(frame, index));
  });
}

function initSlideListDragDrop(): void {
  const container = document.getElementById("excalihub-pres-slides");
  if (!container) return;

  let dragIndex: number | null = null;

  container.addEventListener("dragstart", (e) => {
    const item = (e.target as HTMLElement).closest(".excalihub-pres-slide-item") as HTMLElement;
    if (!item) return;
    dragIndex = Number(item.dataset.index);
    item.classList.add("dragging");
    e.dataTransfer!.effectAllowed = "move";
  });

  container.addEventListener("dragend", (e) => {
    const item = (e.target as HTMLElement).closest(".excalihub-pres-slide-item") as HTMLElement;
    if (item) item.classList.remove("dragging");
    container.querySelectorAll(".excalihub-pres-slide-item").forEach((el) => el.classList.remove("drag-over"));
    dragIndex = null;
  });

  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    const item = (e.target as HTMLElement).closest(".excalihub-pres-slide-item") as HTMLElement;
    if (!item || Number(item.dataset.index) === dragIndex) return;
    container.querySelectorAll(".excalihub-pres-slide-item").forEach((el) => el.classList.remove("drag-over"));
    item.classList.add("drag-over");
  });

  container.addEventListener("drop", (e) => {
    e.preventDefault();
    const item = (e.target as HTMLElement).closest(".excalihub-pres-slide-item") as HTMLElement;
    if (!item || dragIndex === null) return;
    const dropIndex = Number(item.dataset.index);
    if (dropIndex === dragIndex) return;

    const [moved] = presentationFrames.splice(dragIndex, 1);
    presentationFrames.splice(dropIndex, 0, moved);

    updatePresSubtitle();
    rebuildSlideItems();
  });
}

function hidePresentationView(): void {
  stopPresPolling();
  const panel = document.getElementById("excalihub-panel")!;
  panel.querySelector(".excalihub-pres-view")?.remove();
  panel.querySelectorAll<HTMLElement>(
    ".excalihub-header, .excalihub-actions, .excalihub-ai-section, .excalihub-file-list, .excalihub-footer, #excalihub-file-input"
  ).forEach((el) => (el.style.display = ""));
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function createPanel(): void {
  const toggle = document.createElement("button");
  toggle.id = "excalihub-toggle";
  toggle.textContent = "Excalihub";
  document.body.appendChild(toggle);

  const panel = document.createElement("div");
  panel.id = "excalihub-panel";
  panel.innerHTML = `
    <div class="excalihub-header">
      <h2><img src="${chrome.runtime.getURL("icons/icon48.png")}" alt="" class="excalihub-logo" />Excalihub</h2>
      <div class="excalihub-header-right">
        <button class="excalihub-present-btn" id="excalihub-present-btn" title="Presentation mode">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>
        <div class="excalihub-menu-wrapper">
        <button class="excalihub-header-menu-btn" id="excalihub-header-menu-btn">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
            <rect x="3" y="4" width="12" height="1.5" rx="0.75"/>
            <rect x="3" y="8.25" width="12" height="1.5" rx="0.75"/>
            <rect x="3" y="12.5" width="12" height="1.5" rx="0.75"/>
          </svg>
        </button>
        <div class="excalihub-menu" id="excalihub-header-menu">
          <button class="excalihub-menu-item" id="excalihub-api-key-btn">API Key Settings</button>
          <button class="excalihub-menu-item" id="excalihub-export-all-btn">Export all</button>
          <div class="excalihub-menu-divider"></div>
          <button class="excalihub-menu-item danger" id="excalihub-delete-all-btn">Delete all</button>
        </div>
      </div>
      </div>
    </div>
    <div class="excalihub-actions">
      <button class="excalihub-btn primary" id="excalihub-save-btn">Save current</button>
      <button class="excalihub-btn" id="excalihub-import-btn">Import file</button>
    </div>
    <div class="excalihub-ai-section">
      <div class="excalihub-ai-header" id="excalihub-ai-toggle">
        <span class="excalihub-ai-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a4 4 0 0 0-4 4c0 2 2 3 2 5h4c0-2 2-3 2-5a4 4 0 0 0-4-4z"/>
            <line x1="10" y1="17" x2="14" y2="17"/>
            <line x1="10" y1="20" x2="14" y2="20"/>
            <line x1="11" y1="23" x2="13" y2="23"/>
          </svg>
          Generate with AI
        </span>
        <svg class="excalihub-ai-chevron" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="excalihub-ai-body" id="excalihub-ai-body">
        <textarea class="excalihub-ai-prompt" id="excalihub-ai-prompt" placeholder="Describe what you want to draw...&#10;&#10;e.g. A flowchart showing user login flow with steps: enter credentials, validate, success/failure branches" rows="3"></textarea>
        <label class="excalihub-ai-extend-label" for="excalihub-ai-extend">
          <input type="checkbox" id="excalihub-ai-extend" class="excalihub-ai-extend-checkbox" />
          <span>Extend current canvas</span>
        </label>
        <button class="excalihub-btn primary excalihub-ai-btn" id="excalihub-ai-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          Generate
        </button>
        <div class="excalihub-ai-status" id="excalihub-ai-status"></div>
      </div>
    </div>
    <div class="excalihub-file-list" id="excalihub-file-list"></div>
    <input type="file" id="excalihub-file-input" accept=".excalidraw" multiple style="display:none" />
    <div class="excalihub-footer">Made with &hearts; by <a href="https://x.com/aykutsarach" target="_blank" rel="noopener">Aykut Sara&ccedil;</a></div>
  `;
  document.body.appendChild(panel);

  toggle.addEventListener("click", () => {
    const isOpen = panel.classList.toggle("open");
    toggle.classList.toggle("shifted", isOpen);
    if (isOpen) renderFileList();
  });

  document
    .getElementById("excalihub-save-btn")!
    .addEventListener("click", saveCurrentScene);

  document
    .getElementById("excalihub-import-btn")!
    .addEventListener("click", () => {
      document.getElementById("excalihub-file-input")!.click();
    });

  document
    .getElementById("excalihub-file-input")!
    .addEventListener("change", handleFileImport);

  document
    .getElementById("excalihub-header-menu-btn")!
    .addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = document.getElementById("excalihub-header-menu")!;
      document.querySelectorAll(".excalihub-menu.open").forEach((m) => {
        if (m !== menu) m.classList.remove("open");
      });
      menu.classList.toggle("open");
    });

  // AI section toggle
  document.getElementById("excalihub-ai-toggle")!.addEventListener("click", () => {
    const body = document.getElementById("excalihub-ai-body")!;
    const section = body.parentElement!;
    section.classList.toggle("expanded");
  });

  // AI generate button
  document.getElementById("excalihub-ai-btn")!.addEventListener("click", handleAiGenerate);

  // AI prompt Ctrl+Enter shortcut
  document.getElementById("excalihub-ai-prompt")!.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleAiGenerate();
    }
  });

  document
    .getElementById("excalihub-present-btn")!
    .addEventListener("click", () => {
      showPresentationView();
    });

  document
    .getElementById("excalihub-api-key-btn")!
    .addEventListener("click", () => {
      closeAllMenus();
      showApiKeySettings();
    });

  document
    .getElementById("excalihub-export-all-btn")!
    .addEventListener("click", () => {
      closeAllMenus();
      exportAllFiles();
    });

  document
    .getElementById("excalihub-delete-all-btn")!
    .addEventListener("click", () => {
      closeAllMenus();
      deleteAllFilesPrompt();
    });

  applyTheme();
  observeTheme();
}

createPanel();
