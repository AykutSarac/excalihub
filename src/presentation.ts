interface PresentationFrame {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AppState {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
  frameRendering: { enabled: boolean; name: boolean; outline: boolean; clip: boolean };
  viewModeEnabled: boolean;
  theme: string;
}

interface PresentationState {
  frames: PresentationFrame[];
  currentIndex: number;
  overlay: HTMLElement;
  originalAppState: AppState;
  keydownHandler: (e: KeyboardEvent) => void;
  resizeHandler: () => void;
}

let state: PresentationState | null = null;

// ── Bridge communication ──────────────────────────────────────────────
let callId = 0;

function callBridge<T = any>(method: string, ...args: any[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++callId;
    const timeout = setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("Bridge timeout"));
    }, 3000);

    const handler = (e: MessageEvent) => {
      if (e.data?.source !== "excalihub-bridge" || e.data.id !== id) return;
      window.removeEventListener("message", handler);
      clearTimeout(timeout);
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.result);
    };

    window.addEventListener("message", handler);
    window.postMessage({ source: "excalihub-content", id, method, args });
  });
}

// ── Frame extraction (localStorage is accessible from content script) ─
function getFramesFromScene(): PresentationFrame[] {
  const raw = localStorage.getItem("excalidraw");
  if (!raw) return [];

  let elements: any[];
  try {
    elements = JSON.parse(raw);
    if (!Array.isArray(elements)) return [];
  } catch {
    return [];
  }

  const frames = elements
    .filter((el: any) => el.type === "frame" && !el.isDeleted)
    .map((el: any) => ({
      id: el.id,
      name: el.name || "Frame",
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
    }));

  const allSameName = frames.length > 1 && frames.every((f) => f.name === frames[0]?.name);
  if (allSameName) {
    frames.sort((a, b) => {
      const rowThreshold = 100;
      if (Math.abs(a.y - b.y) < rowThreshold) return a.x - b.x;
      return a.y - b.y;
    });
  } else {
    frames.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
    );
  }

  return frames;
}

// ── Overlay UI ────────────────────────────────────────────────────────
function createOverlay(totalSlides: number): HTMLElement {
  const overlay = document.createElement("div");
  overlay.id = "excalihub-presentation";
  overlay.innerHTML = `
    <div class="pres-toolbar">
      <button class="pres-btn" id="pres-prev" title="Previous slide">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <span class="pres-counter" id="pres-counter">Slide 1/${totalSlides}</span>
      <button class="pres-btn" id="pres-next" title="Next slide">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
      <div class="pres-divider"></div>
      <button class="pres-btn" id="pres-theme" title="Toggle theme (T)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      </button>
      <button class="pres-btn" id="pres-download" title="Download slide (D)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      </button>
      <button class="pres-btn" id="pres-fullscreen" title="Fullscreen (F)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 3 21 3 21 9"></polyline>
          <polyline points="9 21 3 21 3 15"></polyline>
          <line x1="21" y1="3" x2="14" y2="10"></line>
          <line x1="3" y1="21" x2="10" y2="14"></line>
        </svg>
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector("#pres-prev")!.addEventListener("click", () => {
    if (state) navigateToSlide(state.currentIndex - 1);
  });
  overlay.querySelector("#pres-next")!.addEventListener("click", () => {
    if (state) navigateToSlide(state.currentIndex + 1);
  });
  overlay.querySelector("#pres-theme")!.addEventListener("click", toggleTheme);
  overlay.querySelector("#pres-download")!.addEventListener("click", downloadSlide);
  overlay.querySelector("#pres-fullscreen")!.addEventListener("click", toggleFullscreen);

  return overlay;
}

// ── Slide navigation ──────────────────────────────────────────────────
async function navigateToSlide(index: number): Promise<void> {
  if (!state) return;
  if (index < 0 || index >= state.frames.length) return;

  state.currentIndex = index;
  const frame = state.frames[index];

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const zoom = Math.min(vw / frame.width, vh / frame.height) * 0.85;
  const scrollX = vw / (2 * zoom) - (frame.x + frame.width / 2);
  const scrollY = vh / (2 * zoom) - (frame.y + frame.height / 2);

  await callBridge("updateScene", {
    appState: {
      scrollX,
      scrollY,
      zoom: { value: zoom },
      frameRendering: { enabled: true, name: false, outline: false, clip: true },
    },
  });

  const counter = state.overlay.querySelector("#pres-counter");
  if (counter) {
    counter.textContent = `Slide ${index + 1}/${state.frames.length}`;
  }

  const prevBtn = state.overlay.querySelector("#pres-prev") as HTMLButtonElement;
  const nextBtn = state.overlay.querySelector("#pres-next") as HTMLButtonElement;
  if (prevBtn) prevBtn.disabled = index === 0;
  if (nextBtn) nextBtn.disabled = index === state.frames.length - 1;
}

// ── Actions ───────────────────────────────────────────────────────────
async function toggleTheme(): Promise<void> {
  if (!state) return;
  const appState = await callBridge<AppState>("getAppState");
  const next = appState.theme === "dark" ? "light" : "dark";
  await callBridge("updateScene", { appState: { theme: next } });
  state.overlay.classList.toggle("pres-dark", next === "dark");
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

function downloadSlide(): void {
  if (!state) return;
  const canvas =
    (document.querySelector(".excalidraw__canvas") as HTMLCanvasElement) ??
    (document.querySelector(".excalidraw canvas") as HTMLCanvasElement);
  if (!canvas) return;

  try {
    const link = document.createElement("a");
    link.download = `slide-${state.currentIndex + 1}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch {
    alert("Could not export slide. The canvas may contain cross-origin images.");
  }
}

// ── Enter / Exit ──────────────────────────────────────────────────────
export async function enterPresentationMode(): Promise<void> {
  if (state) return;

  // Check bridge is working
  let apiAvailable: boolean;
  try {
    apiAvailable = await callBridge<boolean>("ping");
  } catch {
    apiAvailable = false;
  }

  if (!apiAvailable) {
    alert("Could not access Excalidraw. Please try refreshing the page.");
    return;
  }

  const frames = getFramesFromScene();
  if (frames.length === 0) {
    alert(
      "No frames found on the canvas.\n\nAdd frames to your drawing to use Presentation Mode.\nTip: Press F or use the frame tool in Excalidraw's toolbar.",
    );
    return;
  }

  // Save original state
  const originalAppState = await callBridge<AppState>("getAppState");

  // Enter view mode
  await callBridge("updateScene", { appState: { viewModeEnabled: true } });

  // Create UI
  const overlay = createOverlay(frames.length);
  document.body.classList.add("excalihub-presenting");

  if (originalAppState.theme === "dark") {
    overlay.classList.add("pres-dark");
  }

  // Keyboard handler
  const keydownHandler = (e: KeyboardEvent) => {
    if (!state) return;

    switch (e.key) {
      case "ArrowLeft":
      case "ArrowUp":
      case "PageUp":
        e.preventDefault();
        e.stopPropagation();
        navigateToSlide(state.currentIndex - 1);
        break;
      case "ArrowRight":
      case "ArrowDown":
      case "PageDown":
      case " ":
        e.preventDefault();
        e.stopPropagation();
        navigateToSlide(state.currentIndex + 1);
        break;
      case "Home":
        e.preventDefault();
        e.stopPropagation();
        navigateToSlide(0);
        break;
      case "End":
        e.preventDefault();
        e.stopPropagation();
        navigateToSlide(state.frames.length - 1);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        exitPresentationMode();
        break;
      case "f":
      case "F":
        e.preventDefault();
        e.stopPropagation();
        toggleFullscreen();
        break;
      case "t":
      case "T":
        e.preventDefault();
        e.stopPropagation();
        toggleTheme();
        break;
      case "d":
      case "D":
        e.preventDefault();
        e.stopPropagation();
        downloadSlide();
        break;
    }
  };

  const resizeHandler = () => {
    if (state) navigateToSlide(state.currentIndex);
  };

  document.addEventListener("keydown", keydownHandler, true);
  window.addEventListener("resize", resizeHandler);

  state = {
    frames,
    currentIndex: 0,
    overlay,
    originalAppState,
    keydownHandler,
    resizeHandler,
  };

  await navigateToSlide(0);
}

export async function exitPresentationMode(): Promise<void> {
  if (!state) return;

  const savedState = state;
  state = null;

  savedState.overlay.remove();
  document.removeEventListener("keydown", savedState.keydownHandler, true);
  window.removeEventListener("resize", savedState.resizeHandler);
  document.body.classList.remove("excalihub-presenting");

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  try {
    await callBridge("updateScene", {
      appState: {
        scrollX: savedState.originalAppState.scrollX,
        scrollY: savedState.originalAppState.scrollY,
        zoom: savedState.originalAppState.zoom,
        frameRendering: savedState.originalAppState.frameRendering,
        viewModeEnabled: savedState.originalAppState.viewModeEnabled,
        theme: savedState.originalAppState.theme,
      },
    });
  } catch {
    // Best effort restore
  }
}
