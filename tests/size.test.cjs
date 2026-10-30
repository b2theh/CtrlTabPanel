const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../size.uc.js"), "utf8");

function setup(value, { integer = false, throws = false } = {}) {
  let unload;
  const host = {
    canvasWidth: 160,
    canvasHeight: 100,
    _openPanel(marker) {
      if (throws) throw new Error("Native failure");
      // Same width and centering formula as Zen 1.24b on a 1920px screen.
      const width = Math.min(1920 * 0.99, this.canvasWidth * 1.25 * 7);
      return { width, left: (1920 - width) / 2, marker, height: this.canvasHeight };
    },
  };
  const original = host._openPanel;
  const window = {
    ctrlTab: host,
    addEventListener() {},
    removeEventListener() {},
    addUnloadListener(callback) { unload = callback; },
  };
  const context = vm.createContext({
    window,
    location: { href: "chrome://browser/content/browser.xhtml" },
    Services: {
      prefs: {
        PREF_INT: 64,
        getPrefType() { return integer ? 64 : 32; },
        getStringPref(key, fallback) { return value ?? fallback; },
        getIntPref(key, fallback) { return value ?? fallback; },
      },
    },
  });
  vm.runInContext(source, context);
  return { host, window, original, reload: () => vm.runInContext(source, context), unload: () => unload() };
}

test("all Sine sizes change geometry, preserve centering and restore capture sizes", () => {
  const preferences = require("../preferences.json");
  assert.equal(preferences[0].defaultValue, "100");
  for (const { value } of preferences[0].options) {
    const { host } = setup(value);
    const result = host._openPanel("forwarded");
    const expected = Math.min(1920 * 0.99, 1400 * Number(value) / 100);
    assert.equal(result.width, expected);
    assert.equal(result.left + result.width / 2, 960);
    assert.equal(result.marker, "forwarded");
    assert.equal(host.canvasWidth, 160);
    assert.equal(host.canvasHeight, 100);
  }
});

test("default and invalid settings use 100%; outliers are clamped", () => {
  for (const value of [undefined, "", "invalid", "Infinity", "0", "-10"]) {
    assert.equal(setup(value).host._openPanel().width, 1400);
  }
  assert.equal(setup("20").host._openPanel().width, 910);
  assert.equal(setup("900").host._openPanel().width, 1820);
  assert.equal(setup(80, { integer: true }).host._openPanel().width, 1120);
});

test("capture sizes are restored even when native opening throws", () => {
  const { host } = setup("65", { throws: true });
  assert.throws(() => host._openPanel(), /Native failure/);
  assert.equal(host.canvasWidth, 160);
  assert.equal(host.canvasHeight, 100);
});

test("reload does not compound scale and Sine unload restores native handler", () => {
  const { host, original, reload, unload, window } = setup("80");
  reload();
  assert.equal(host._openPanel().width, 1120);
  unload();
  assert.equal(host._openPanel, original);
  assert.equal(window.arcCtrlTabSize, undefined);
});

test("unload preserves a subsequent third-party handler", () => {
  const { host, unload } = setup("80");
  const other = () => "another mod";
  host._openPanel = other;
  unload();
  assert.equal(host._openPanel, other);
});
