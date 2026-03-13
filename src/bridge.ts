interface ExcalidrawAPI {
  updateScene: (scene: unknown) => void;
  getAppState: () => Record<string, any>;
  isDestroyed?: boolean;
}

interface BridgeMessage {
  source: string;
  id: string;
  method: string;
  args?: unknown[];
}

(function () {
  function isAPI(obj: unknown): obj is ExcalidrawAPI {
    return (
      obj != null &&
      typeof obj === "object" &&
      typeof (obj as ExcalidrawAPI).updateScene === "function" &&
      typeof (obj as ExcalidrawAPI).getAppState === "function"
    );
  }

  let cachedAPI: ExcalidrawAPI | null = null;

  function findAPI(): ExcalidrawAPI | null {
    if (cachedAPI && !cachedAPI.isDestroyed && isAPI(cachedAPI)) {
      return cachedAPI;
    }
    cachedAPI = null;

    const el = document.querySelector(".excalidraw");
    if (!el) return null;

    const fiberKey = Object.keys(el).find(
      (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
    );
    if (!fiberKey) return null;

    let fiber: any = (el as any)[fiberKey];
    const visited = new Set();

    while (fiber && !visited.has(fiber)) {
      visited.add(fiber);

      // Class component instance (App stores this.api)
      if (
        fiber.stateNode &&
        fiber.stateNode !== el &&
        !(fiber.stateNode instanceof HTMLElement)
      ) {
        if (isAPI(fiber.stateNode.api)) {
          cachedAPI = fiber.stateNode.api;
          return cachedAPI;
        }
      }

      // React hooks (useState / useRef)
      if (fiber.memoizedState) {
        let hook = fiber.memoizedState;
        while (hook) {
          const val = hook.memoizedState;
          if (isAPI(val)) { cachedAPI = val; return cachedAPI; }
          if (val && val.current && isAPI(val.current)) { cachedAPI = val.current; return cachedAPI; }
          if (hook.queue && isAPI(hook.queue.lastRenderedState)) {
            cachedAPI = hook.queue.lastRenderedState;
            return cachedAPI;
          }
          hook = hook.next;
        }
      }

      // Context provider
      if (fiber.memoizedProps && isAPI(fiber.memoizedProps.value)) {
        cachedAPI = fiber.memoizedProps.value;
        return cachedAPI;
      }

      fiber = fiber.return;
    }

    return null;
  }

  window.addEventListener("message", function (e: MessageEvent) {
    if (e.source !== window) return;
    if (!e.data || e.data.source !== "excalihub-content") return;

    const { id, method, args = [] } = e.data as BridgeMessage;
    const api = findAPI();

    if (method === "ping") {
      window.postMessage({ source: "excalihub-bridge", id, result: !!api });
      return;
    }

    if (!api) {
      window.postMessage({ source: "excalihub-bridge", id, error: "API not found" });
      return;
    }

    try {
      if (method === "getAppState") {
        const s = api.getAppState();
        window.postMessage({
          source: "excalihub-bridge",
          id,
          result: {
            scrollX: s.scrollX,
            scrollY: s.scrollY,
            zoom: { value: s.zoom.value },
            frameRendering: {
              enabled: s.frameRendering.enabled,
              name: s.frameRendering.name,
              outline: s.frameRendering.outline,
              clip: s.frameRendering.clip,
            },
            viewModeEnabled: s.viewModeEnabled,
            theme: s.theme,
          },
        });
      } else if (method === "updateScene") {
        api.updateScene(args[0]);
        window.postMessage({ source: "excalihub-bridge", id, result: true });
      } else {
        window.postMessage({ source: "excalihub-bridge", id, error: "Unknown method: " + method });
      }
    } catch (err: unknown) {
      window.postMessage({
        source: "excalihub-bridge",
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
})();
