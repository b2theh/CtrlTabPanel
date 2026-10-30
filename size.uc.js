// ==UserScript==
// @name           CtrlTab Panel Size
// @version        1.1.0
// @description    Resize the native CtrlTab panel while keeping Zen's screen centering.
// @include        main
// ==/UserScript==

(() => {
  "use strict";

  if (location.href !== "chrome://browser/content/browser.xhtml") return;
  const host = window.ctrlTab;
  if (!host || typeof host._openPanel !== "function") return;
  // Repeated script loads must not multiply the requested scale.
  window.arcCtrlTabSize?.destroy();

  const original = host._openPanel;
  function openPanel(...args) {
    // Sine dropdowns store strings; also accept an integer set in about:config.
    const pref = "zen.mods.arc-ctrltab.size";
    let value = 100;
    try {
      value = Services.prefs.getPrefType(pref) === Services.prefs.PREF_INT
        ? Services.prefs.getIntPref(pref, 100)
        : Number(Services.prefs.getStringPref(pref, "100"));
    } catch {}
    const scale = Number.isFinite(value) && value > 0
      ? Math.min(130, Math.max(65, value)) / 100
      : 1;

    const width = this.canvasWidth;
    const height = this.canvasHeight;
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return original.apply(this, args);
    }
    try {
      // Native _openPanel uses these to calculate both width and screen position.
      // CSS makes the displayed thumbnails follow the resulting grid width.
      // Keep capture sizes unchanged outside this synchronous calculation.
      this.canvasWidth = width * scale;
      this.canvasHeight = height * scale;
      return original.apply(this, args);
    } finally {
      this.canvasWidth = width;
      this.canvasHeight = height;
    }
  }

  const controller = {
    destroy() {
      if (host._openPanel === openPanel) host._openPanel = original;
      if (window.arcCtrlTabSize === controller) delete window.arcCtrlTabSize;
      window.removeEventListener("unload", controller.destroy);
    },
  };
  host._openPanel = openPanel;
  window.arcCtrlTabSize = controller;
  window.addEventListener("unload", controller.destroy, { once: true });
  if (typeof window.addUnloadListener === "function") {
    window.addUnloadListener(controller.destroy);
  }
})();
