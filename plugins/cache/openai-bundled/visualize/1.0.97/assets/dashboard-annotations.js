(() => {
  const blocks = "dash-block, experimental-dash-block, [data-dashboard-block]";
  const marker = "[data-annotate]";
  const hovered = "data-codex-dashboard-annotation-hover";
  const tool = "__codex_visualization_annotations__";
  const style = document.createElement("style");
  style.textContent = `[${hovered}], [${hovered}] * {
    cursor: var(--codex-dashboard-review-cursor, crosshair) !important;
  }
  @supports not (top: anchor(top)) {
    [${hovered}] {
      outline: 2px dashed var(--color-text-info, #339cff) !important;
      outline-offset: -2px;
    }
  }`;

  let mode = window.openai?.sandboxDocumentState;
  let listeners;
  let highlight;
  let anchor;
  let lastClick;

  function identifier(value) {
    return typeof value === "string" &&
      value &&
      value.trim() === value &&
      value.length <= 160
      ? value
      : null;
  }

  const content = "h1,h2,h3,h4,h5,h6,p,label,output,span,caption,figcaption,li";
  const selectors = {
    block: blocks,
    text: marker,
    tab: '[role="tab"]',
    table: "table",
    row: "tr",
    cell: "th,td",
    content,
  };
  const candidates = Object.values(selectors).join(",");
  let indexes = new WeakMap();

  function textOf(element) {
    return (element.innerText ?? "").replace(/\s+/g, " ").trim();
  }

  function semanticTarget(kind, parts, label) {
    // Keys carry authored identities. An ambiguous or oversized key falls back
    // to a meaningful ancestor rather than selecting by DOM position.
    const id = JSON.stringify(parts);
    return identifier(id) && label
      ? { kind, id, label: displayLabel(label, id) }
      : null;
  }

  function tabTarget(element) {
    const list = element.closest('[role="tablist"]');
    if (!list) return null;
    const component = list.closest("experimental-dash-tabs,dash-tabs");
    const listName =
      component?.id || list.id || list.getAttribute("aria-label");
    const label = textOf(element) || element.getAttribute("aria-label");
    const value =
      element.getAttribute("value") ||
      element.getAttribute("aria-controls") ||
      element.id ||
      label;
    return (
      value &&
      semanticTarget("tab", [listName ?? "tabs", value], label || value)
    );
  }

  function contentTarget(element) {
    const label = textOf(element) || element.getAttribute("aria-label");
    if (
      !label ||
      (element.matches("span") && element.querySelector(candidates))
    )
      return null;
    const tag = element.localName;
    const section = element.closest(
      'section[id],article[id],figure[id],[role="tabpanel"][id]',
    );
    const scope = section ? [section.id] : [];
    if (element.id)
      return semanticTarget("content", [tag, "id", element.id], label);
    if (element.matches("label[for]"))
      return semanticTarget("content", [tag, "for", element.htmlFor], label);
    if (tag === "output")
      return semanticTarget("content", [...scope, tag], label);
    return semanticTarget(
      "content",
      [...scope, tag, label.slice(0, 88)],
      label,
    );
  }

  function authored(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (
      element.closest(
        'svg,canvas,[data-codex-dashboard-review-overlay],[data-viz-container],.recharts-wrapper,[slot="viz-block-info"],[slot="viz-block-source"],[slot="layout-controls"]',
      )
    )
      return false;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      if (
        ancestor.localName === "viz-chart" ||
        ancestor.localName.startsWith("viz-chart-")
      )
        return false;
    }
    return true;
  }

  function describe(element) {
    if (!authored(element)) return null;
    const block = element.closest(blocks);
    if (
      block &&
      (!identifier(block.id) || document.getElementById(block.id) !== block)
    )
      return null;
    let target;
    if (element === block) {
      const label =
        block.getAttribute("heading") ||
        block.getAttribute("aria-label") ||
        block.querySelector("h1,h2,h3,h4,h5,h6")?.innerText ||
        block.id;
      return {
        kind: "block",
        id: block.id,
        label: displayLabel(label, block.id),
      };
    }
    const marked = identifier(element.getAttribute("data-annotate"));
    if (marked) {
      target = {
        kind: "text",
        id: marked,
        label: displayLabel(
          element.getAttribute("aria-label") || element.innerText,
          marked,
        ),
      };
    } else if (element.matches(selectors.tab)) {
      target = tabTarget(element);
    } else if (element.matches("table,tr,th,td")) {
      target = tableTarget(element);
    } else if (
      element.matches(content) &&
      !element.closest('button,[role="tab"],[contenteditable="true"]')
    ) {
      target = contentTarget(element);
    }
    return target && { ...target, ...(block && { blockId: block.id }) };
  }

  function locate(key) {
    if (!key || !Object.hasOwn(selectors, key.kind) || !identifier(key.id))
      return null;
    if (key.kind === "block") {
      const found = document.querySelectorAll("#" + CSS.escape(key.id));
      return found.length === 1 && found[0].matches(blocks) ? found[0] : null;
    }
    const scope = key.blockId
      ? locate({ kind: "block", id: key.blockId })
      : document;
    if (!scope || (key.blockId && !scope.matches(blocks))) return null;
    let kinds = indexes.get(scope);
    if (!kinds) indexes.set(scope, (kinds = new Map()));
    if (!kinds.has(key.kind)) {
      const index = new Map();
      for (const candidate of scope.querySelectorAll(selectors[key.kind])) {
        if (candidate.closest(blocks) !== (scope === document ? null : scope))
          continue;
        const target = describe(candidate);
        if (target?.kind === key.kind) {
          index.set(target.id, index.has(target.id) ? null : candidate);
        }
      }
      kinds.set(key.kind, index);
    }
    const found = kinds.get(key.kind).get(key.id);
    if (found && (key.kind === "row" || key.kind === "cell")) {
      const table = found.closest("table");
      if (locate(describe(table)) !== table) return null;
      const row = found.closest("tr");
      const rowTarget = row && describe(row);
      if (key.kind === "cell" && rowTarget && locate(rowTarget) !== row)
        return null;
    }
    return found ?? null;
  }

  function unique(element) {
    const target = element && describe(element);
    return target && locate(target) === element ? element : null;
  }

  function selectedTarget(element) {
    const target = describe(element);
    if (!target) return null;
    const declared =
      element.getAttribute("sources") ||
      element.closest(blocks)?.getAttribute("sources");
    const sources = declared
      ?.trim()
      .split(/\s+/)
      .filter((name) => name && name.length <= 120)
      .slice(0, 8);
    return sources?.length
      ? { ...target, sources: [...new Set(sources)] }
      : target;
  }

  function pick(element) {
    if (!(element instanceof Element)) return null;
    const block = element.closest(blocks);
    const marked = element.closest(marker);
    if (marked?.closest(blocks) === block && unique(marked)) return marked;
    const tab = element.closest(selectors.tab);
    if (tab && unique(tab)) return tab;
    // A formatted number inside a cell belongs to its row and column. Keep
    // headings, captions and authored text selectable elsewhere in the document.
    const cell = element.closest("th,td");
    const start = cell ?? element;
    for (let current = start; current; current = current.parentElement) {
      if (current.matches(candidates) && unique(current)) return current;
      if (current === block) break;
    }
    return null;
  }

  // The caller walks ancestors from the hit and verifies the key is unique
  // within its block. An unidentifiable cell can therefore select its row/table.
  function tableTarget(element) {
    if (!element.matches("table, tr, th, td")) return null;
    const table = element.closest("table");
    if (!table) return null;
    const section = table.closest("section[id], article[id], figure[id]");
    const caption =
      table.getAttribute("aria-label")?.trim() ||
      (table.caption && textOf(table.caption));
    const heading = section?.querySelector(
      ":scope > :is(h1,h2,h3,h4,h5,h6,figcaption)",
    );
    const title =
      caption || (heading && textOf(heading)) || table.id || "Table";
    const tableKey = table.id
      ? ["id", table.id]
      : caption
        ? ["name", caption]
        : section
          ? ["section", section.id]
          : ["table"];
    if (element === table) return semanticTarget("table", tableKey, title);

    const row = element.closest("tr");
    if (!row || row.closest("table") !== table) return null;
    const headerRow =
      table.tHead?.rows.length === 1
        ? table.tHead.rows[0]
        : !table.tHead &&
            Array.from(table.rows[0]?.cells ?? []).every((cell) =>
              cell.matches("th:not([scope=row])"),
            )
          ? table.rows[0]
          : null;
    function columnKey(cell) {
      const name = textOf(cell);
      return cell.id ? ["id", cell.id] : name ? ["name", name] : null;
    }
    if (
      element.matches("th") &&
      (row === headerRow ||
        element.scope === "col" ||
        (row.parentElement === table.tHead && element.scope !== "row"))
    ) {
      const key = columnKey(element);
      return (
        key &&
        semanticTarget(
          "cell",
          [...tableKey, "column", ...key],
          `${title} · ${textOf(element) || element.id}`,
        )
      );
    }
    if (row === headerRow || row.parentElement === table.tHead) return null;

    const first = row.cells[0];
    const header =
      Array.from(row.cells).find((cell) => cell.matches("th[scope=row]")) ||
      (first?.matches("th:not([scope=col])") ? first : null);
    const firstText = first && textOf(first);
    // Plain generated tables conventionally put a dimension or date first.
    // A measurement alone is too volatile to identify its row across refreshes.
    const dimension =
      firstText &&
      (/^\p{L}/u.test(firstText) || /^\d{4}-\d{2}-\d{2}\b/.test(firstText))
        ? firstText
        : null;
    const rowName =
      row.getAttribute("aria-label")?.trim() ||
      (header && textOf(header)) ||
      dimension ||
      row.id;
    const rowKey = row.id ? ["id", row.id] : rowName ? ["name", rowName] : null;
    if (!rowKey) return null;
    const rowParts = [...tableKey, "row", ...rowKey];
    if (element === row)
      return semanticTarget("row", rowParts, `${title} · ${rowName}`);

    // Positional matching is only meaningful for a simple rectangular table.
    // The *stored* key is the column heading, so moving the column is safe.
    const column = headerRow?.cells[element.cellIndex];
    const rectangular =
      column &&
      headerRow.cells.length === row.cells.length &&
      [...headerRow.cells, ...row.cells].every(
        (cell) => cell.colSpan === 1 && cell.rowSpan === 1,
      );
    const columnName = rectangular && textOf(column);
    const cellKey = element.id
      ? ["id", element.id]
      : rectangular && columnKey(column);
    if (!cellKey) return null;
    return semanticTarget(
      "cell",
      [...rowParts, "cell", ...cellKey],
      [title, rowName, columnName || element.id, textOf(element)]
        .filter(Boolean)
        .join(" · "),
    );
  }

  function displayLabel(value, fallback) {
    return value?.replace(/\s+/g, " ").trim().slice(0, 240) || fallback;
  }

  function mark(element) {
    if (element === highlight) return;
    highlight?.removeAttribute(hovered);
    highlight = element;
    highlight?.setAttribute(hovered, "");
    syncOverlays();
  }

  function report(target, rect, tracking = false, additional = false, point) {
    void window.openai
      .callTool(tool, {
        type: "dashboard-select",
        target,
        rect,
        ...(point && { point }),
        ...(tracking && { tracking: true }),
        ...(additional && { additional: true }),
      })
      .catch(() => {});
  }

  function select(element, additional, pointer) {
    const target = selectedTarget(element);
    if (!target) return;
    const { x, y, width, height } = element.getBoundingClientRect();
    if (!width || !height) return;
    const relative = pointer && {
      x: Math.max(0, Math.min(1, (pointer.clientX - x) / width)),
      y: Math.max(0, Math.min(1, (pointer.clientY - y) / height)),
    };
    lastClick = { target, relative };
    if (sameTarget(anchor?.key, target)) anchor.relative = relative;
    const rect = { x, y, width, height };
    report(target, rect, false, additional, pointInRect(rect, relative));
  }

  function pointInRect(rect, relative) {
    return relative && {
      x: rect.x + relative.x * rect.width,
      y: rect.y + relative.y * rect.height,
    };
  }

  function sameTarget(a, b) {
    return a?.kind === b?.kind && a?.id === b?.id && a?.blockId === b?.blockId;
  }

  function track(key) {
    if (sameTarget(anchor?.key, key)) return;
    if (key == null && anchor) lastClick = undefined;
    anchor?.stop();
    anchor = undefined;
    if (!key || !identifier(key.id)) return;
    const controller = new AbortController();
    const resize = new ResizeObserver(schedule);
    let element;
    let target;
    let frame;
    let previous;
    let dirty = true;
    function schedule() {
      if (frame == null) frame = requestAnimationFrame(measure);
    }
    function measure() {
      frame = undefined;
      if (dirty || !element?.isConnected) {
        dirty = false;
        const next = locate(key);
        if (next !== element) {
          resize.disconnect();
          element = next;
          if (element) resize.observe(element);
        }
        if (!element) {
          previous = undefined;
          return;
        }
        target = selectedTarget(element);
      }
      let { x, y, width, height } = element.getBoundingClientRect();
      if (!width || !height || !innerWidth || !innerHeight) return;
      if (
        x + width <= 0 ||
        y + height <= 0 ||
        x >= innerWidth ||
        y >= innerHeight
      ) {
        x = Math.max(0, Math.min(innerWidth - 1, x + width / 2));
        y = Math.max(0, Math.min(innerHeight - 1, y + height / 2));
        width = height = 1;
      }
      const rect = { x, y, width, height };
      if (
        previous &&
        Object.keys(rect).every((name) => rect[name] === previous[name])
      )
        return;
      previous = rect;
      report(target, rect, true, false, pointInRect(rect, anchor.relative));
    }
    const options = { signal: controller.signal, capture: true };
    window.addEventListener("scroll", schedule, options);
    window.addEventListener("resize", schedule, options);
    anchor = {
      key,
      relative: sameTarget(lastClick?.target, key) ? lastClick.relative : undefined,
      rebind(records) {
        const scope = element?.closest(blocks);
        if (
          !scope ||
          !element?.isConnected ||
          records.some(
            ({ target }) => scope.contains(target) || target.contains(scope),
          )
        ) {
          dirty = true;
          schedule();
        }
      },
      stop() {
        controller.abort();
        resize.disconnect();
        if (frame != null) cancelAnimationFrame(frame);
      },
    };
    schedule();
  }

  function intercept(event) {
    if (!event.isTrusted || event.button !== 0) return;
    const element = pick(event.target);
    if (!element) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "click") select(element, event.shiftKey, event);
  }

  function enableKeyboardTargets(signal) {
    const originalTabIndex = new Map();
    function update(element) {
      if (element.matches(candidates) && describe(element)) {
        if (element.tabIndex < 0 && !originalTabIndex.has(element)) {
          originalTabIndex.set(element, element.getAttribute("tabindex"));
          element.setAttribute("tabindex", "0");
        }
      } else {
        restore(element);
      }
    }
    function restore(element) {
      if (
        originalTabIndex.has(element) &&
        element.getAttribute("tabindex") === "0"
      ) {
        const original = originalTabIndex.get(element);
        if (original == null) element.removeAttribute("tabindex");
        else element.setAttribute("tabindex", original);
      }
      originalTabIndex.delete(element);
    }
    function scan(node) {
      if (!(node instanceof Element)) return;
      if (node.matches(candidates)) update(node);
      node.querySelectorAll(candidates).forEach(update);
    }
    scan(document.documentElement);
    const observer = new MutationObserver((mutations) => {
      const records = mutations.filter((record) => {
        if (
          record.target.parentElement?.closest(
            "[data-codex-dashboard-review-overlay]",
          )
        )
          return false;
        if (
          record.target instanceof Element &&
          record.target.closest("[data-codex-dashboard-review-overlay]")
        )
          return false;
        return (
          record.type !== "childList" ||
          [...record.addedNodes, ...record.removedNodes].some(
            (node) =>
              !(
                node instanceof Element &&
                node.matches("[data-codex-dashboard-review-overlay]")
              ),
          )
        );
      });
      if (!records.length) return;
      indexes = new WeakMap();
      anchor?.rebind(records);
      syncOverlays();
      for (const record of records) {
        if (record.type === "attributes") update(record.target);
        else record.addedNodes.forEach(scan);
      }
      if (records.some((record) => record.removedNodes.length)) {
        for (const element of originalTabIndex.keys()) {
          if (!element.isConnected) restore(element);
        }
      }
    });
    observer.observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
      attributeFilter: [
        "id",
        "role",
        "value",
        "aria-label",
        "aria-controls",
        "scope",
        "for",
        "data-annotate",
        "data-dashboard-block",
      ],
    });
    signal.addEventListener("abort", () => {
      observer.disconnect();
      for (const element of originalTabIndex.keys()) restore(element);
    });
  }

  // Keep the Slides highlight and pin in the guest's coordinate space. A
  // top-layer overlay follows its CSS anchor through scrolling and resizing
  // without changing the selected element's border, background, or layout.
  const overlays = new Map();
  style.textContent += `
    [data-codex-dashboard-review-overlay]:popover-open {
      all: initial;
      position: fixed;
      position-anchor: auto;
      inset: auto;
      left: anchor(left);
      top: anchor(top);
      width: anchor-size(width);
      height: anchor-size(height);
      position-visibility: anchors-visible;
      box-sizing: border-box;
      --review-stroke: var(--color-text-info, var(--color-token-text-link-foreground, #339cff));
      background: color-mix(in srgb, var(--review-stroke) 10%, transparent);
      outline: 2px dashed var(--review-stroke);
      outline-offset: -2px;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.28);
      overflow: visible;
      pointer-events: none;
    }
    [data-codex-dashboard-note-marker] {
      all: initial;
      position: absolute;
      left: 100%;
      top: 0;
      transform: translate(-50%, -50%);
      width: 26px;
      height: 26px;
      border-radius: 50% 50% 50% 3px;
      background: var(--color-background-info-solid, var(--review-stroke));
      box-shadow: 0 0 0 1px white, 0 4px 8px -2px rgb(0 0 0 / 16%);
    }
    [data-codex-dashboard-review-overlay="saved"] > button {
      cursor: pointer;
      pointer-events: auto;
    }
    [data-codex-dashboard-review-overlay="saved"] > button:is(:hover,:focus-visible) {
      scale: 1.08;
      transform-origin: bottom left;
    }
  `;

  function syncOverlays() {
    const wanted = new Map();
    if (listeners && document.body && "showPopover" in HTMLElement.prototype && CSS.supports("top: anchor(top)")) {
      if (highlight?.isConnected) wanted.set(highlight, "hover");
      const markers = mode?.dashboardAnnotationMarkers;
      for (const note of Array.isArray(markers) ? markers : []) {
        const source = locate(note?.target);
        if (source) wanted.set(source, "saved");
      }
      const editing = locate(mode?.dashboardAnnotationTarget);
      if (editing) wanted.set(editing, "draft");
    }
    for (const [source, overlay] of overlays) {
      if (!wanted.has(source) || !overlay.isConnected) {
        overlay.remove();
        overlays.delete(source);
      }
    }
    for (const [source, kind] of wanted) {
      let overlay = overlays.get(source);
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.setAttribute("data-codex-dashboard-review-overlay", kind);
        overlay.popover = "manual";
        document.body.append(overlay);
        overlay.showPopover({ source });
        overlays.set(source, overlay);
      }
      if (overlay.getAttribute("data-codex-dashboard-review-overlay") !== kind) {
        overlay.setAttribute("data-codex-dashboard-review-overlay", kind);
      }
      if (kind === "hover") {
        overlay.firstElementChild?.remove();
      } else {
        let pin = overlay.firstElementChild;
        if (!pin) {
          pin = document.createElement("button");
          pin.type = "button";
          pin.setAttribute("data-codex-dashboard-note-marker", "");
          pin.addEventListener("click", (event) => {
            if (!event.isTrusted) return;
            event.stopPropagation();
            select(source, false);
          });
          overlay.append(pin);
        }
        const disabled = kind === "draft";
        if (pin.disabled !== disabled) pin.disabled = disabled;
        const label = selectedTarget(source)?.label ?? "";
        if (pin.getAttribute("aria-label") !== label) pin.setAttribute("aria-label", label);
      }
    }
  }

  function sync() {
    const active =
      !document.hidden &&
      mode?.dashboardVisible !== false &&
      mode?.dashboardAnnotateMode === true &&
      mode.dashboardEditMode !== true;
    track(active ? mode.dashboardAnnotationTarget : null);
    if (active === Boolean(listeners)) {
      syncOverlays();
      return;
    }
    if (!active) {
      listeners.abort();
      listeners = undefined;
      mark(null);
      syncOverlays();
      lastClick = undefined;
      indexes = new WeakMap();
      style.remove();
      return;
    }
    listeners = new AbortController();
    const options = { capture: true, signal: listeners.signal };
    document.head.append(style);
    enableKeyboardTargets(listeners.signal);
    syncOverlays();
    window.addEventListener(
      "pointerover",
      (event) => mark(pick(event.target)),
      options,
    );
    window.addEventListener(
      "pointerout",
      (event) => {
        if (event.relatedTarget == null) mark(null);
      },
      options,
    );
    window.addEventListener(
      "focusin",
      (event) => mark(pick(event.target)),
      options,
    );
    window.addEventListener("focusout", () => mark(null), options);
    for (const name of ["pointerdown", "mousedown", "click"]) {
      window.addEventListener(name, intercept, options);
    }
    window.addEventListener(
      "keydown",
      (event) => {
        if (!event.isTrusted || event.isComposing || event.repeat) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          void window.openai
            .callTool(tool, { type: "dashboard-escape" })
            .catch(() => {});
        } else if (event.key === "Enter" || event.key === " ") {
          const element = pick(event.target);
          if (!element) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          select(element, event.shiftKey);
        }
      },
      options,
    );
  }

  window.addEventListener("openai:set_globals", (event) => {
    const globals = event.detail?.globals;
    if (globals && "sandboxDocumentState" in globals) {
      mode = globals.sandboxDocumentState;
      sync();
    }
  });
  document.addEventListener("visibilitychange", sync);
  sync();
})();
