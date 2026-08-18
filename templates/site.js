/* awesome-dsh-experts 站点交互（V2）：主题切换 + Tab + 分类筛选 + 搜索 + 排序 + 精选场景 */
(function () {
  "use strict";

  /* ============================================================
     主题切换（默认暗色）
     ============================================================ */
  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem("dsh-theme"); } catch (e) {}
  // 默认暗色；若曾手动选过则沿用
  if (stored === "light" || stored === "dark") {
    root.setAttribute("data-theme", stored);
  } else {
    root.setAttribute("data-theme", "dark");
  }
  var toggle = document.getElementById("theme-toggle");
  function syncIcon() {
    if (!toggle) return;
    var cur = root.getAttribute("data-theme");
    toggle.textContent = cur === "dark" ? "☀️" : "🌙";
  }
  syncIcon();
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("dsh-theme", next); } catch (e) {}
      syncIcon();
    });
  }

  /* ============================================================
     列表页交互
     ============================================================ */
  var grid = document.getElementById("card-grid");
  if (!grid) return; // 详情页无需以下逻辑

  var input = document.getElementById("search");
  var tabsEl = document.getElementById("tabs");
  var sortEl = document.getElementById("sort");
  var filterEl = document.getElementById("filter-bar");
  var scenarioTrack = document.querySelector(".scenario-track");
  var empty = document.getElementById("empty");

  var CAT_LABELS = {
    coding: "编程开发", writing: "写作内容", design: "设计创意", data: "数据智能",
    devops: "运维云原生", legal: "法务合规", education: "教育教学", multimodal: "多模态",
    general: "通用管理", team: "专家团", uncategorized: "未分类",
  };
  var EXCLUDED_CHIP_CATS = { team: true, uncategorized: true };

  var cards = Array.prototype.slice.call(grid.querySelectorAll(".card[data-kind]"));

  var state = { kind: "expert", cat: "all", q: "", sort: "default" };

  /* ---- 根据当前 Tab 重建分类 chips ---- */
  function rebuildChips() {
    var catsPresent = {};
    cards.forEach(function (c) {
      if (c.getAttribute("data-kind") === state.kind) {
        catsPresent[c.getAttribute("data-cat")] = true;
      }
    });
    var html = '<button class="chip' + (state.cat === "all" ? " active" : "") + '" data-cat="all">全部</button>';
    Object.keys(CAT_LABELS).forEach(function (cat) {
      if (EXCLUDED_CHIP_CATS[cat]) return;            // team/uncategorized 不进入专家 chips
      if (!catsPresent[cat]) return;
      var active = state.cat === cat ? " active" : "";
      html += '<button class="chip' + active + '" data-cat="' + cat + '">' + CAT_LABELS[cat] + "</button>";
    });
    // 专家团 Tab 下，team 单独成 chip
    if (state.kind === "pack" && catsPresent.team) {
      var ta = state.cat === "team" ? " active" : "";
      html += '<button class="chip' + ta + '" data-cat="team">' + CAT_LABELS.team + "</button>";
    }
    filterEl.innerHTML = html;
  }

  /* ---- 排序比较器 ---- */
  function comparator() {
    if (state.sort === "hot") {
      return function (a, b) {
        return Number(b.getAttribute("data-hot")) - Number(a.getAttribute("data-hot"));
      };
    }
    if (state.sort === "new") {
      return function (a, b) {
        return String(b.getAttribute("data-date")).localeCompare(String(a.getAttribute("data-date")));
      };
    }
    // default：保持 catalog 顺序（data-order）
    return function (a, b) {
      return Number(a.getAttribute("data-order")) - Number(b.getAttribute("data-order"));
    };
  }

  /* ---- 应用筛选 + 排序 + 重排 ---- */
  function apply() {
    var q = state.q.trim().toLowerCase();
    var visible = 0;
    cards.forEach(function (c) {
      var hay = (
        c.getAttribute("data-name") + " " +
        c.getAttribute("data-summary") + " " +
        c.getAttribute("data-tags") + " " +
        c.getAttribute("data-cat")
      ).toLowerCase();
      var okKind = c.getAttribute("data-kind") === state.kind;
      var okCat = state.cat === "all" || c.getAttribute("data-cat") === state.cat;
      var okText = !q || hay.indexOf(q) !== -1;
      var show = okKind && okCat && okText;
      c.style.display = show ? "" : "none";
      if (show) visible++;
    });

    // 按排序重排 DOM（保持筛选结果顺序稳定）
    var sorted = cards.slice().sort(comparator());
    sorted.forEach(function (c) { grid.appendChild(c); });

    if (empty) empty.style.display = visible === 0 ? "" : "none";
  }

  /* ---- 切换到某 Tab ---- */
  function setKind(kind) {
    state.kind = kind;
    state.cat = "all"; // 切 Tab 重置分类
    if (tabsEl) {
      Array.prototype.forEach.call(tabsEl.querySelectorAll(".tab"), function (t) {
        t.classList.toggle("active", t.getAttribute("data-kind") === kind);
      });
    }
    rebuildChips();
    apply();
  }

  /* ---- 事件绑定（委托） ---- */
  if (tabsEl) {
    tabsEl.addEventListener("click", function (ev) {
      var t = ev.target.closest(".tab");
      if (t) setKind(t.getAttribute("data-kind"));
    });
  }
  if (sortEl) {
    sortEl.addEventListener("click", function (ev) {
      var b = ev.target.closest(".sort-btn");
      if (!b) return;
      state.sort = b.getAttribute("data-sort");
      Array.prototype.forEach.call(sortEl.querySelectorAll(".sort-btn"), function (x) {
        x.classList.toggle("active", x === b);
      });
      apply();
    });
  }
  if (filterEl) {
    filterEl.addEventListener("click", function (ev) {
      var c = ev.target.closest(".chip");
      if (!c) return;
      state.cat = c.getAttribute("data-cat");
      Array.prototype.forEach.call(filterEl.querySelectorAll(".chip"), function (x) {
        x.classList.toggle("active", x === c);
      });
      apply();
    });
  }
  if (input) {
    input.addEventListener("input", function () { state.q = input.value; apply(); });
  }
  if (scenarioTrack) {
    function onScenario(ev) {
      var sc = ev.target.closest(".scenario-card");
      if (!sc) return;
      var cat = sc.getAttribute("data-cat");
      // 该分类下若有专家则切到「专家」Tab，否则「专家团」
      var hasExpert = cards.some(function (c) {
        return c.getAttribute("data-cat") === cat && c.getAttribute("data-kind") === "expert";
      });
      setKind(hasExpert ? "expert" : "pack");
      state.cat = cat;
      if (filterEl) {
        Array.prototype.forEach.call(filterEl.querySelectorAll(".chip"), function (x) {
          x.classList.toggle("active", x.getAttribute("data-cat") === cat);
        });
      }
      apply();
      // 滚动到列表
      if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    scenarioTrack.addEventListener("click", onScenario);
    scenarioTrack.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onScenario(ev); }
    });
  }

  // 初始化
  rebuildChips();
  apply();
})();
