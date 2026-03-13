(function () {
  function isAPI(obj) {
    return (
      obj &&
      typeof obj === "object" &&
      typeof obj.updateScene === "function" &&
      typeof obj.getAppState === "function"
    );
  }

  var cachedAPI = null;

  function findAPI() {
    // Return cached if still valid
    if (cachedAPI && !cachedAPI.isDestroyed && isAPI(cachedAPI)) {
      return cachedAPI;
    }
    cachedAPI = null;

    var el = document.querySelector(".excalidraw");
    if (!el) return null;

    var fiberKey = Object.keys(el).find(function (k) {
      return (
        k.startsWith("__reactFiber$") ||
        k.startsWith("__reactInternalInstance$")
      );
    });
    if (!fiberKey) return null;

    var fiber = el[fiberKey];
    var visited = new Set();

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
        var hook = fiber.memoizedState;
        while (hook) {
          var val = hook.memoizedState;
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

  window.addEventListener("message", function (e) {
    if (e.source !== window) return;
    if (!e.data || e.data.source !== "excalihub-content") return;

    var id = e.data.id;
    var method = e.data.method;
    var args = e.data.args || [];
    var api = findAPI();

    if (method === "ping") {
      window.postMessage({ source: "excalihub-bridge", id: id, result: !!api });
      return;
    }

    if (!api) {
      window.postMessage({
        source: "excalihub-bridge",
        id: id,
        error: "API not found",
      });
      return;
    }

    try {
      if (method === "getAppState") {
        var s = api.getAppState();
        window.postMessage({
          source: "excalihub-bridge",
          id: id,
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
        window.postMessage({
          source: "excalihub-bridge",
          id: id,
          result: true,
        });
      } else {
        window.postMessage({
          source: "excalihub-bridge",
          id: id,
          error: "Unknown method: " + method,
        });
      }
    } catch (err) {
      window.postMessage({
        source: "excalihub-bridge",
        id: id,
        error: err.message,
      });
    }
  });
})();
