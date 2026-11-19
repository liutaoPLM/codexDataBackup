(() => {
  const blockSelector = "dash-block[id], experimental-dash-block[id], [data-dashboard-block][id]";
  const marked = new Map();
  let state = window.openai?.sandboxDocumentState;
  let returnFocus;

  function isActive() {
    return state?.dashboardSourcePanel === true && state.dashboardVisible !== false && !document.hidden;
  }

  // Only structural labels and declared binding names cross this UI bridge.
  // The Page resolves the actual declarations and any preview in its own session.
  function catalog(selection) {
    const bindings = window.openai?.visualization?.bindings ?? {};
    const seenIds = new Set();
    const duplicateIds = new Set();
    for (const element of document.querySelectorAll("[id]")) {
      if (seenIds.has(element.id)) duplicateIds.add(element.id);
      seenIds.add(element.id);
    }
    const blocks = [];
    for (const block of document.querySelectorAll(blockSelector)) {
      const id = block.id;
      if (!id || id.length > 256 || duplicateIds.has(id)) continue;
      const selected = selection.kind === "block" && selection.id === id;
      if (blocks.length === 128 && !selected) continue;
      const title = block.getAttribute("heading")?.trim() || block.getAttribute("aria-label")?.trim()
        || block.querySelector("h1,h2,h3,h4,h5,h6")?.textContent?.trim() || id;
      const sources = (block.getAttribute("sources") ?? "").split(/\s+/)
        .filter((name) => name.length <= 64 && Object.hasOwn(bindings, name));
      if (blocks.length === 128) blocks.pop();
      blocks.push({
        id, title: title.slice(0, 256),
        description: block.getAttribute("description")?.trim().slice(0, 512),
        sources: [...new Set(sources)].slice(0, 32),
      });
    }
    if (selection.kind === "block" && !blocks.some((block) => block.id === selection.id)) return;
    if (selection.kind === "source" && !Object.hasOwn(bindings, selection.id)) return;

    const metadata = [];
    const named = new Set();
    for (const meta of document.querySelectorAll('meta[name="visualize-source"]')) {
      const name = meta.content;
      if (!Object.hasOwn(bindings, name) || name.length > 64 || named.has(name)) continue;
      named.add(name);
      const rows = meta.dataset.rows?.trim();
      metadata.push({
        name, title: meta.dataset.title?.trim().slice(0, 256),
        description: meta.dataset.description?.trim().slice(0, 512),
        entity: meta.dataset.entity?.trim().slice(0, 256),
        rows: rows && rows.length <= 64 ? rows : undefined,
      });
      if (metadata.length === 32) break;
    }
    return { selection, blocks, metadata };
  }

  async function inspect(selection) {
    if (!isActive()) return;
    const request = catalog(selection);
    if (!request) return;
    let focus = document.activeElement;
    while (focus?.shadowRoot?.activeElement) focus = focus.shadowRoot.activeElement;
    if (focus instanceof HTMLElement && focus !== document.body) returnFocus = focus;
    // A gesture can expire or the Page can unmount while the SDK is delivering it.
    try {
      await window.openai.callTool("__codex_dashboard_source_inspection__", request);
    } catch {
      // Dismissal, an expired gesture, and a stale frame have no side effects.
    }
  }

  document.addEventListener("dashboard-source-inspection", (event) => {
    if (state?.dashboardSourcePanel !== true || !(event.target instanceof Element)
      || !event.target.matches("dash-sources")) return;
    event.preventDefault();
    const selection = event.detail;
    if (selection?.kind === "all") void inspect({ kind: "all" });
    else if ((selection?.kind === "block" || selection?.kind === "source") && typeof selection.id === "string") {
      void inspect({ kind: selection.kind, id: selection.id });
    }
  });
  document.addEventListener("sourceinspect", (event) => {
    const block = event.target instanceof Element ? event.target.closest(blockSelector) : null;
    if (event.defaultPrevented || !block || block.id !== event.detail?.id || !isActive()) return;
    void inspect({ kind: "block", id: block.id });
    // An explicitly pinned, older Sources widget may also open its standalone
    // popover during this event. Close it before painting the Page panel.
    const widget = document.querySelector("dash-sources");
    if (widget) queueMicrotask(() => widget.close?.());
  }, { capture: true });
  document.addEventListener("click", (event) => {
    if (!isActive()) return;
    const trigger = event.composedPath().find((node) =>
      node instanceof HTMLButtonElement && node.getAttribute("aria-haspopup") === "dialog");
    const widget = trigger?.getRootNode().host;
    if (!widget?.matches("dash-sources")) return;
    queueMicrotask(() => {
      if (widget.shadowRoot?.querySelector('[role="dialog"]:popover-open')) {
        widget.close?.();
        void inspect({ kind: "all" });
      }
    });
  });

  function syncBlocks() {
    const open = isActive() && state.dashboardSourcesOpen && !state.dashboardEditMode;
    for (const [block, previous] of marked) {
      if (open && block.isConnected && block.interactionMode === "sources") continue;
      if (block.interactionMode === "sources") {
        block.interactionMode = previous.mode;
        block.selected = previous.selected;
      }
      marked.delete(block);
    }
    if (!open) return;
    for (const block of document.querySelectorAll(blockSelector)) {
      if (!(block.interactionMode === "view" || block.interactionMode === "sources")
        || typeof block.selected !== "boolean") continue;
      if (!marked.has(block)) marked.set(block, { mode: block.interactionMode, selected: block.selected });
      if (block.interactionMode !== "sources") block.interactionMode = "sources";
      const selected = block.id === state.dashboardSourceBlock;
      if (block.selected !== selected) block.selected = selected;
    }
  }

  window.addEventListener("openai:set_globals", (event) => {
    const globals = event.detail?.globals;
    if (!globals || !Object.hasOwn(globals, "sandboxDocumentState")) return;
    const wasOpen = state?.dashboardSourcesOpen;
    state = globals.sandboxDocumentState;
    syncBlocks();
    if (wasOpen && !state?.dashboardSourcesOpen) {
      if (isActive() && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      returnFocus = null;
    }
  });
  document.addEventListener("visibilitychange", syncBlocks);
  syncBlocks();
})();
