import JSZip from "jszip";
import { STORAGE_KEY, FOLDERS_KEY, saveFile, getAllFiles, getFile, deleteFile, updateFileData, updateFileName, moveFileToFolder, getAllFolders, createFolder, renameFolder, deleteFolder } from "./db";
import { shareToExcalidraw } from "./share";
import { getExcalidrawTheme } from "./theme";
import { generateDrawing, generateContinuation, summarizeCanvas, getApiKey, setApiKey } from "./ai";

const EXCALIDRAW_LC_KEY = "excalidraw";
const OPENED_FILE_KEY = "excalihub_opened_file";
const SNAPSHOT_KEY = "excalihub_canvas_snapshot";

let currentFolderId: string | undefined = undefined;
let originalTitle: string | null = null;

// ── Opened file tracking ─────────────────────────────────────────────
interface OpenedFile {
  id: string;
  name: string;
}

export function getOpenedFile(): OpenedFile | null {
  try {
    const raw = sessionStorage.getItem(OPENED_FILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setOpenedFile(id: string, name: string): void {
  sessionStorage.setItem(OPENED_FILE_KEY, JSON.stringify({ id, name }));
  updateTabTitle();
  renderFileList();
}

export function clearOpenedFile(): void {
  sessionStorage.removeItem(OPENED_FILE_KEY);
  updateTabTitle();
  renderFileList();
}

function canvasFingerprint(elementsJson?: string): string {
  try {
    const raw = elementsJson ?? localStorage.getItem(EXCALIDRAW_LC_KEY) ?? "[]";
    const elements = JSON.parse(raw) as Record<string, unknown>[];
    if (!Array.isArray(elements)) return "empty";
    const alive = elements.filter((el) => !el.isDeleted);
    if (alive.length === 0) return "empty";
    // Build a stable fingerprint from meaningful properties only
    const parts = alive.map((el) => {
      const { id, type, x, y, width, height, angle, strokeColor, backgroundColor, text, points, groupIds } = el as Record<string, unknown>;
      return JSON.stringify({ id, type, x, y, width, height, angle, strokeColor, backgroundColor, text, points, groupIds });
    });
    parts.sort();
    return parts.join("|");
  } catch {
    return "empty";
  }
}

function snapshotCanvas(elementsJson?: string): void {
  sessionStorage.setItem(SNAPSHOT_KEY, canvasFingerprint(elementsJson));
}

export function hasUnsavedChanges(): boolean {
  const snapshot = sessionStorage.getItem(SNAPSHOT_KEY);
  const current = canvasFingerprint();
  // No snapshot means nothing was ever saved/loaded — treat any content as unsaved
  if (snapshot === null) return current !== "empty";
  return current !== snapshot;
}

function updateTabTitle(): void {
  const opened = getOpenedFile();
  if (opened) {
    const baseName = opened.name.replace(/\.excalidraw$/, "");
    if (originalTitle === null) originalTitle = document.title;
    document.title = `${baseName} | ${originalTitle}`;
  } else if (originalTitle !== null) {
    document.title = originalTitle;
    originalTitle = null;
  }
}

// Restore tab title and snapshot on load if a file was already open
updateTabTitle();

(async () => {
  const opened = getOpenedFile();
  if (opened && !sessionStorage.getItem(SNAPSHOT_KEY)) {
    try {
      const record = await getFile(opened.id);
      if (record) {
        const parsed = JSON.parse(record.data);
        snapshotCanvas(JSON.stringify(parsed.elements || []));
      }
    } catch {
      // ignore
    }
  }
})();

function showModal(content: string): HTMLElement {
  const existing = document.getElementById("excalihub-modal-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "excalihub-modal-overlay";
  const isDark = getExcalidrawTheme() === "dark";
  overlay.className = `excalihub-modal-overlay${isDark ? " theme-dark" : ""}`;
  overlay.innerHTML = `<div class="excalihub-modal">${content}</div>`;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
  return overlay;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayName(name: string): string {
  return name.replace(/\.excalidraw$/, "");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function getIndexedDBFiles(): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const request = indexedDB.open("files-db");
    request.onerror = () => resolve({});
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("files-store")) {
        db.close();
        resolve({});
        return;
      }
      const tx = db.transaction("files-store", "readonly");
      const store = tx.objectStore("files-store");
      const files: Record<string, unknown> = {};
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          files[String(cursor.key)] = cursor.value;
          cursor.continue();
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve(files);
      };
      tx.onerror = () => {
        db.close();
        resolve({});
      };
    };
  });
}

async function extractSceneFromPage(): Promise<string | null> {
  const elementsRaw = localStorage.getItem(EXCALIDRAW_LC_KEY);
  if (!elementsRaw) return null;

  let elements: unknown[];
  try {
    elements = JSON.parse(elementsRaw);
    if (!Array.isArray(elements)) return null;
  } catch {
    return null;
  }

  let appState: Record<string, unknown> = {};
  const appStateRaw = localStorage.getItem("excalidraw-state");
  if (appStateRaw) {
    try {
      appState = JSON.parse(appStateRaw);
    } catch {
      // ignore
    }
  }

  const files = await getIndexedDBFiles();

  const excalidrawFile = {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements,
    appState,
    files,
  };

  return JSON.stringify(excalidrawFile, null, 2);
}

export async function saveCurrentScene(): Promise<void> {
  try {
    const sceneData = await extractSceneFromPage();
    if (!sceneData) return;

    const opened = getOpenedFile();
    if (opened) {
      // Update the currently opened file
      await updateFileData(opened.id, sceneData);
    } else {
      // Create a new file
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const name = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.excalidraw`;
      const record = await saveFile(name, sceneData);
      setOpenedFile(record.id, record.name);
    }
    snapshotCanvas();
    renderFileList();
  } catch (err) {
    console.error("Excalihub: save error", err);
  }
}

export async function handleFileImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files || !files.length) return;

  for (const file of Array.from(files)) {
    if (!file.name.endsWith(".excalidraw")) continue;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.type && !parsed.elements) continue;
      await saveFile(file.name, text);
    } catch (err) {
      console.error("Excalihub: import error", err);
    }
  }

  input.value = "";
  renderFileList();
}

export async function exportAllFiles(): Promise<void> {
  try {
    const files = await getAllFiles();
    if (files.length === 0) return;
    const zip = new JSZip();
    for (const file of files) {
      const name = file.name.endsWith(".excalidraw") ? file.name : file.name + ".excalidraw";
      zip.file(name, file.data);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "excalihub-export.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    console.error("Excalihub: export error");
  }
}

export async function renderFileList(): Promise<void> {
  const container = document.getElementById("excalihub-file-list")!;

  // Update save button label based on opened file state
  const saveBtn = document.getElementById("excalihub-save-btn");
  if (saveBtn) {
    saveBtn.textContent = getOpenedFile() ? "Update" : "Save current";
  }

  try {
    const [allFiles, allFolders] = await Promise.all([getAllFiles(), getAllFolders()]);

    const filesInView = allFiles.filter((f) =>
      currentFolderId ? f.folderId === currentFolderId : !f.folderId
    );
    const foldersInView = currentFolderId ? [] : allFolders;
    const isEmpty = filesInView.length === 0 && foldersInView.length === 0;

    if (isEmpty && !currentFolderId) {
      container.innerHTML = `
        <div class="excalihub-empty">
          <div class="icon">&#128196;</div>
          <strong>No saved files</strong>
          <p>Save the current scene or import .excalidraw files</p>
        </div>
      `;
      return;
    }

    let html = "";

    if (currentFolderId) {
      const folder = allFolders.find((f) => f.id === currentFolderId);
      html += `
        <button class="excalihub-back-btn" id="excalihub-back-btn">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11 2L5 8l6 6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          ${folder ? escapeHtml(folder.name) : "Back"}
        </button>
      `;
    }

    if (!currentFolderId) {
      html += `
        <button class="excalihub-new-folder-btn" id="excalihub-new-folder-btn">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.172a1.5 1.5 0 0 1 1.06.44l.658.658a.5.5 0 0 0 .354.147H13.5A1.5 1.5 0 0 1 15 4.745V12.5A1.5 1.5 0 0 1 13.5 14h-11A1.5 1.5 0 0 1 1 12.5v-9z" fill="none" stroke="currentColor" stroke-width="1.2"/>
            <path d="M8 7v4M6 9h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          New folder
        </button>
      `;
    }

    for (const folder of foldersInView) {
      html += `
        <div class="excalihub-folder-card" data-folder-id="${folder.id}">
          <div class="excalihub-folder-info" data-folder-nav="${folder.id}">
            <svg class="excalihub-folder-icon" width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.172a1.5 1.5 0 0 1 1.06.44l.658.658a.5.5 0 0 0 .354.147H13.5A1.5 1.5 0 0 1 15 4.745V12.5A1.5 1.5 0 0 1 13.5 14h-11A1.5 1.5 0 0 1 1 12.5v-9z"/>
            </svg>
            <div>
              <span class="excalihub-folder-name">${escapeHtml(folder.name)}</span>
              <div class="excalihub-file-meta">${allFiles.filter((f) => f.folderId === folder.id).length} files</div>
            </div>
          </div>
          <div class="excalihub-menu-wrapper">
            <button class="excalihub-menu-btn" data-menu-id="folder-${folder.id}">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/>
              </svg>
            </button>
            <div class="excalihub-menu" id="menu-folder-${folder.id}">
              <button class="excalihub-menu-item" data-action="rename-folder" data-id="${folder.id}">Rename</button>
              <div class="excalihub-menu-divider"></div>
              <button class="excalihub-menu-item danger" data-action="delete-folder" data-id="${folder.id}">Delete</button>
            </div>
          </div>
        </div>
      `;
    }

    const openedFileId = getOpenedFile()?.id;

    for (const f of filesInView) {
      const isActive = f.id === openedFileId;
      let moveSubmenu = "";
      if (currentFolderId) {
        moveSubmenu = `
          <div class="excalihub-menu-divider"></div>
          <button class="excalihub-menu-item" data-action="move" data-id="${f.id}" data-folder="">Move out of folder</button>`;
      } else if (allFolders.length > 0) {
        const subItems = allFolders.map((folder) =>
          `<button class="excalihub-menu-item" data-action="move" data-id="${f.id}" data-folder="${folder.id}">${escapeHtml(folder.name)}</button>`
        ).join("");
        moveSubmenu = `
          <div class="excalihub-menu-divider"></div>
          <div class="excalihub-submenu-wrapper">
            <button class="excalihub-menu-item excalihub-submenu-trigger">
              Move to
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div class="excalihub-submenu">${subItems}</div>
          </div>`;
      }

      html += `
        <div class="excalihub-file-card${isActive ? " active" : ""}" data-id="${f.id}">
          <div class="excalihub-file-card-header">
            <div class="excalihub-file-info" data-action="load" data-id="${f.id}">
              <svg class="excalihub-file-icon" width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 1h5.586a1 1 0 0 1 .707.293l2.414 2.414a1 1 0 0 1 .293.707V13.5a1.5 1.5 0 0 1-1.5 1.5h-7.5A1.5 1.5 0 0 1 2.5 13.5v-11A1.5 1.5 0 0 1 4 1z" fill="none" stroke="currentColor" stroke-width="1.2"/>
                <path d="M9.5 1v2.5a1 1 0 0 0 1 1H13" fill="none" stroke="currentColor" stroke-width="1.2"/>
              </svg>
              <div>
                <span class="excalihub-file-name">${escapeHtml(displayName(f.name))}</span>
                <div class="excalihub-file-meta">
                  ${formatDate(f.savedAt)} &middot; ${formatSize(new Blob([f.data]).size)}
                </div>
              </div>
            </div>
            <div class="excalihub-menu-wrapper">
              <button class="excalihub-menu-btn" data-menu-id="${f.id}">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/>
                </svg>
              </button>
              <div class="excalihub-menu" id="menu-${f.id}">
                <button class="excalihub-menu-item" data-action="update" data-id="${f.id}">Update</button>
                <button class="excalihub-menu-item" data-action="share" data-id="${f.id}">Share</button>
                <button class="excalihub-menu-item" data-action="download" data-id="${f.id}">Download</button>
                <button class="excalihub-menu-item" data-action="rename" data-id="${f.id}">Rename</button>
                ${moveSubmenu}
                <div class="excalihub-menu-divider"></div>
                <button class="excalihub-menu-item danger" data-action="delete" data-id="${f.id}">Delete</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    if (currentFolderId && filesInView.length === 0) {
      html += `
        <div class="excalihub-empty">
          <p>This folder is empty</p>
        </div>
      `;
    }

    container.innerHTML = html;

    // Back button
    document.getElementById("excalihub-back-btn")?.addEventListener("click", () => {
      currentFolderId = undefined;
      renderFileList();
    });

    // New folder button
    document.getElementById("excalihub-new-folder-btn")?.addEventListener("click", async () => {
      const name = prompt("Folder name:");
      if (!name) return;
      await createFolder(name);
      renderFileList();
    });

    // Folder navigation
    container.querySelectorAll<HTMLDivElement>("[data-folder-nav]").forEach((el) => {
      el.addEventListener("click", () => {
        currentFolderId = el.dataset.folderNav;
        renderFileList();
      });
    });

    container.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((btn) => {
      btn.addEventListener("click", handleFileAction);
    });

    container.querySelectorAll<HTMLButtonElement>(".excalihub-menu-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const menuId = btn.dataset.menuId;
        if (!menuId) return;
        const menu = document.getElementById(`menu-${menuId}`);
        if (!menu) return;
        container.querySelectorAll(".excalihub-menu.open").forEach((m) => {
          if (m !== menu) m.classList.remove("open");
        });
        menu.classList.toggle("open");
      });
    });

    container.querySelectorAll<HTMLDivElement>(".excalihub-file-info").forEach((info) => {
      info.addEventListener("click", () => {
        const id = info.dataset.id;
        if (id) loadFileToExcalidraw(id);
      });
    });
  } catch (err) {
    console.error("Excalihub: render error", err);
    container.innerHTML = `<div class="excalihub-empty"><p>Error loading files</p></div>`;
  }
}

export function closeAllMenus(): void {
  document.querySelectorAll(".excalihub-menu.open").forEach((m) => m.classList.remove("open"));
}

document.addEventListener("click", (e) => {
  if (!(e.target as Element)?.closest(".excalihub-menu-wrapper")) {
    closeAllMenus();
  }
});

async function handleFileAction(event: Event): Promise<void> {
  const target = event.target as HTMLButtonElement;
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (!action || !id) return;

  closeAllMenus();

  switch (action) {
    case "update":
      await updateFileWithCurrentScene(id);
      break;
    case "share":
      await shareFile(id);
      break;
    case "download":
      await downloadFile(id);
      break;
    case "rename":
      await renameFilePrompt(id);
      break;
    case "delete":
      await deleteFilePrompt(id);
      break;
    case "move": {
      const folderId = target.dataset.folder || undefined;
      await moveFileToFolder(id, folderId);
      renderFileList();
      break;
    }
    case "rename-folder":
      await renameFolderPrompt(id);
      break;
    case "delete-folder":
      await deleteFolderPrompt(id);
      break;
  }
}

async function loadFileToExcalidraw(id: string): Promise<void> {
  try {
    const record = await getFile(id);
    if (!record) return;

    const blob = new Blob([record.data], { type: "application/json" });
    const fileName = record.name.endsWith(".excalidraw")
      ? record.name
      : record.name + ".excalidraw";
    const file = new File([blob], fileName, { type: "application/json" });

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    const canvas = document.querySelector(".excalidraw") as HTMLElement;
    if (!canvas) return;

    canvas.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      })
    );

    // Snapshot from the file's elements immediately (before Excalidraw processes the drop)
    try {
      const parsed = JSON.parse(record.data);
      snapshotCanvas(JSON.stringify(parsed.elements || []));
    } catch {
      snapshotCanvas("[]");
    }
    setOpenedFile(id, record.name);
  } catch (err) {
    console.error("Excalihub: load error", err);
  }
}

async function downloadFile(id: string): Promise<void> {
  try {
    const file = await getFile(id);
    if (!file) return;

    const blob = new Blob([file.data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name.endsWith(".excalidraw")
      ? file.name
      : file.name + ".excalidraw";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    console.error("Excalihub: download error");
  }
}

async function shareFile(id: string): Promise<void> {
  const record = await getFile(id);
  if (!record) return;

  const overlay = showModal(`
    <h3>Shareable link</h3>
    <div class="excalihub-modal-loading">Creating share link...</div>
  `);

  try {
    const url = await shareToExcalidraw(record.data);
    const modal = overlay.querySelector(".excalihub-modal")!;
    modal.innerHTML = `
      <h3>Shareable link</h3>
      <div class="excalihub-modal-label">Link</div>
      <div class="excalihub-modal-link-row">
        <input class="excalihub-modal-link-input" value="${escapeHtml(url)}" readonly />
        <button class="excalihub-modal-copy-btn" id="excalihub-copy-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy link
        </button>
      </div>
      <div class="excalihub-modal-divider"></div>
      <div class="excalihub-modal-note">The upload has been secured with end-to-end encryption, which means that Excalidraw server and third parties can't read the content.</div>
    `;

    const copyBtn = document.getElementById("excalihub-copy-link")!;
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(url);
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy link
        `;
      }, 2000);
    });

    const input = modal.querySelector<HTMLInputElement>(".excalihub-modal-link-input")!;
    input.addEventListener("click", () => input.select());
  } catch (err) {
    console.error("Excalihub: share error", err);
    const modal = overlay.querySelector(".excalihub-modal")!;
    modal.innerHTML = `
      <h3>Shareable link</h3>
      <div class="excalihub-modal-error">Failed to create share link</div>
    `;
  }
}

async function updateFileWithCurrentScene(id: string): Promise<void> {
  try {
    const sceneData = await extractSceneFromPage();
    if (!sceneData) return;
    await updateFileData(id, sceneData);
    renderFileList();
  } catch (err) {
    console.error("Excalihub: update error", err);
  }
}

async function renameFilePrompt(id: string): Promise<void> {
  const file = await getFile(id);
  if (!file) return;

  const baseName = displayName(file.name);
  const input = prompt("Rename file:", baseName);
  if (input && input !== baseName) {
    const newName = input + ".excalidraw";
    await updateFileName(id, newName);
    const opened = getOpenedFile();
    if (opened?.id === id) setOpenedFile(id, newName);
    renderFileList();
  }
}

async function renameFolderPrompt(id: string): Promise<void> {
  const folders = await getAllFolders();
  const folder = folders.find((f) => f.id === id);
  if (!folder) return;

  const input = prompt("Rename folder:", folder.name);
  if (input && input !== folder.name) {
    await renameFolder(id, input);
    renderFileList();
  }
}

async function deleteFolderPrompt(id: string): Promise<void> {
  if (!confirm("Delete this folder? Files inside will be moved out.")) return;
  await deleteFolder(id);
  if (currentFolderId === id) currentFolderId = undefined;
  renderFileList();
}

export async function deleteAllFilesPrompt(): Promise<void> {
  if (!confirm("Delete all saved files and folders?")) return;
  await chrome.storage.local.remove([STORAGE_KEY, FOLDERS_KEY]);
  currentFolderId = undefined;
  clearOpenedFile();
  renderFileList();
}

async function deleteFilePrompt(id: string): Promise<void> {
  if (!confirm("Delete this file?")) return;
  await deleteFile(id);
  const opened = getOpenedFile();
  if (opened?.id === id) clearOpenedFile();
  renderFileList();
}

function loadSceneToExcalidraw(sceneJson: string, fileName: string): void {
  const blob = new Blob([sceneJson], { type: "application/json" });
  const file = new File([blob], fileName, { type: "application/json" });

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  const canvas = document.querySelector(".excalidraw") as HTMLElement;
  if (!canvas) return;

  canvas.dispatchEvent(
    new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    })
  );
}

let generating = false;

export async function handleAiGenerate(): Promise<void> {
  if (generating) return;

  const promptEl = document.getElementById("excalihub-ai-prompt") as HTMLTextAreaElement;
  const statusEl = document.getElementById("excalihub-ai-status")!;
  const btn = document.getElementById("excalihub-ai-btn") as HTMLButtonElement;
  const extendToggle = document.getElementById("excalihub-ai-extend") as HTMLInputElement | null;
  const prompt = promptEl.value.trim();
  const isExtend = extendToggle?.checked ?? false;

  if (!prompt) {
    statusEl.className = "excalihub-ai-status error";
    statusEl.textContent = "Please describe what you want to draw.";
    return;
  }

  generating = true;
  btn.disabled = true;
  statusEl.className = "excalihub-ai-status loading";

  try {
    let sceneJson: string;

    if (isExtend) {
      statusEl.textContent = "Reading canvas...";

      const elementsRaw = localStorage.getItem(EXCALIDRAW_LC_KEY);
      if (!elementsRaw) throw new Error("Could not read canvas data from Excalidraw. Draw something first or uncheck 'Extend canvas'.");

      const summary = summarizeCanvas(elementsRaw);
      if (!summary) throw new Error("Could not read canvas elements. Try unchecking 'Extend canvas'.");

      statusEl.textContent = `Extending drawing (${summary.shapes.length} shapes found)...`;

      const newElements = await generateContinuation(prompt, summary);

      // Patch bindings: if new arrows reference existing shapes via connectToExisting
      const existingElements = [...summary.elements];
      for (const el of newElements) {
        if (el.connectToExisting?.length) {
          for (const existingId of el.connectToExisting) {
            const existing = existingElements.find((e) => e.id === existingId);
            if (existing) {
              const bound = existing.boundElements ? [...existing.boundElements] : [];
              if (!bound.some((b) => b.id === el.id)) {
                bound.push({ id: el.id, type: "arrow" });
              }
              existing.boundElements = bound;
            }
          }
          delete el.connectToExisting;
        }
      }

      // Merge existing + new elements into a full scene
      const mergedElements = [...existingElements, ...newElements];

      // Read current appState
      let appState: Record<string, unknown> = {};
      const appStateRaw = localStorage.getItem("excalidraw-state");
      if (appStateRaw) {
        try { appState = JSON.parse(appStateRaw); } catch { /* ignore */ }
      }

      const files = await getIndexedDBFiles();

      const scene = {
        type: "excalidraw",
        version: 2,
        source: "https://excalidraw.com",
        elements: mergedElements,
        appState,
        files,
      };

      sceneJson = JSON.stringify(scene, null, 2);
    } else {
      statusEl.textContent = "Generating drawing...";
      sceneJson = await generateDrawing(prompt);
    }

    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const fileName = `ai-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.excalidraw`;

    loadSceneToExcalidraw(sceneJson, fileName);

    await saveFile(fileName, sceneJson);
    renderFileList();

    statusEl.className = "excalihub-ai-status success";
    statusEl.textContent = isExtend ? "Canvas extended!" : "Drawing generated and loaded!";
    promptEl.value = "";

    setTimeout(() => {
      statusEl.className = "excalihub-ai-status";
      statusEl.textContent = "";
    }, 3000);
  } catch (err) {
    statusEl.className = "excalihub-ai-status error";
    statusEl.textContent = err instanceof Error ? err.message : "Failed to generate drawing.";
  } finally {
    generating = false;
    btn.disabled = false;
  }
}

export async function showApiKeySettings(): Promise<void> {
  const currentKey = await getApiKey();
  const masked = currentKey ? currentKey.slice(0, 10) + "..." + currentKey.slice(-4) : "";

  const overlay = showModal(`
    <h3>AI Settings</h3>
    <form id="excalihub-api-key-form" autocomplete="off">
      <div class="excalihub-modal-label">Anthropic API Key</div>
      <input class="excalihub-modal-link-input" id="excalihub-api-key-input"
        type="password" placeholder="sk-ant-..." autocomplete="off"
        style="width:100%;box-sizing:border-box;" />
      <div class="excalihub-ai-key-hint">${currentKey ? "Current: " + escapeHtml(masked) : "No key configured"}</div>
      <div style="display:flex;gap:0.5rem;margin-top:1rem;justify-content:flex-end;">
        <button type="button" class="excalihub-btn" id="excalihub-cancel-key-btn">Cancel</button>
        <button type="submit" class="excalihub-btn primary">Save</button>
      </div>
    </form>
    <div class="excalihub-modal-divider"></div>
    <div class="excalihub-modal-note">Your API key is stored locally in Chrome storage and never sent anywhere except the Anthropic API.</div>
  `);

  document.getElementById("excalihub-api-key-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("excalihub-api-key-input") as HTMLInputElement;
    await setApiKey(input.value.trim());
    overlay.remove();
  });

  document.getElementById("excalihub-cancel-key-btn")!.addEventListener("click", () => {
    overlay.remove();
  });
}
