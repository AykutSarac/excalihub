import { saveCurrentScene, handleFileImport, renderFileList, closeAllMenus, exportAllFiles, deleteAllFilesPrompt, handleAiGenerate, showApiKeySettings } from "./ui";
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
