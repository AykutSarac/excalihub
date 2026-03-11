import { saveCurrentScene, handleFileImport, renderFileList, closeAllMenus, exportAllFiles, deleteAllFilesPrompt } from "./ui";
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
