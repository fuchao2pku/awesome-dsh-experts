/* awesome-dsh-experts 站点交互：主题切换 + 搜索 + 分类筛选 */
(function () {
  "use strict";

  /* ---------- 主题 ---------- */
  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem("dsh-theme"); } catch (e) {}
  if (stored === "dark" || stored === "light") {
    root.setAttribute("data-theme", stored);
  }
  var toggle = document.getElementById("theme-toggle");
  function syncToggle() {
    if (!toggle) return;
    var cur = root.getAttribute("data-theme");
    var isDark = cur
      ? cur === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    toggle.textContent = isDark ? "☀️" : "🌙";
  }
  syncToggle();
  if (toggle) {
    toggle.addEventListener("click", function () {
      var cur = root.getAttribute("data-theme");
      var isDark = cur
        ? cur === "dark"
        : window.matchMedia("(prefers-color-scheme: dark)").matches;
      var next = isDark ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("dsh-theme", next); } catch (e) {}
      syncToggle();
    });
  }

  /* ---------- 搜索 + 筛选（仅列表页） ---------- */
  var input = document.getElementById("search");
  var cards = Array.prototype.slice.call(document.querySelectorAll(".card[data-name]"));
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip[data-cat]"));
  var empty = document.getElementById("empty");
  if (!input && !cards.length) return;

  var activeCat = "all";

  function apply() {
    var q = (input ? input.value : "").trim().toLowerCase();
    var visible = 0;
    cards.forEach(function (c) {
      var hay = (
        c.getAttribute("data-name") +
        " " +
        c.getAttribute("data-summary") +
        " " +
        c.getAttribute("data-tags") +
        " " +
        c.getAttribute("data-cat")
      ).toLowerCase();
      var okCat = activeCat === "all" || c.getAttribute("data-cat") === activeCat;
      var okText = !q || hay.indexOf(q) !== -1;
      var show = okCat && okText;
      c.style.display = show ? "" : "none";
      if (show) visible++;
    });
    if (empty) empty.style.display = visible === 0 ? "" : "none";
  }

  if (input) input.addEventListener("input", apply);
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      chips.forEach(function (c) { c.classList.remove("active"); });
      chip.classList.add("active");
      activeCat = chip.getAttribute("data-cat");
      apply();
    });
  });
})();
