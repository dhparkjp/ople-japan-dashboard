// 부트스트랩 — 데이터 로드 → 분석 산출 → 네비/뷰 전환.

import { loadAll } from "./data.js";
import { buildAnalytics } from "./analytics.js";
import { setFx } from "./format.js";
import { resizeAll } from "./charts.js";
import * as integrated from "./views/integrated.js";
import * as ownstore from "./views/ownstore.js";
import * as marketplace from "./views/marketplace.js";
import * as actions from "./views/actions.js";

const VIEWS = { integrated, ownstore, marketplace, actions };
let ctx = null;
let current = "integrated";

async function boot() {
  const app = document.getElementById("app");
  try {
    const data = await loadAll();
    setFx(data.meta.fx);
    const analytics = buildAnalytics(data);
    ctx = { data, analytics };

    renderTopbarMeta(data.meta);
    bindNav();
    render(current);
  } catch (e) {
    app.innerHTML = `<div class="loading">데이터를 불러오지 못했습니다.<br>
      <b>python3 -m http.server</b> 로 실행했는지 확인해 주세요.<br>
      <span class="muted">${e.message}</span></div>`;
    console.error(e);
  }
}

function renderTopbarMeta(meta) {
  const el = document.getElementById("topbar-meta");
  const c = meta.counts;
  el.innerHTML = `데이터 기준 ${meta.period_start} ~ ${meta.period_end}<br>
    고객 ${c.customers.toLocaleString()}명 · 주문 ${(c.own_orders + c.marketplace_orders).toLocaleString()}건`;
}

function bindNav() {
  document.getElementById("nav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-btn");
    if (!btn) return;
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b === btn));
    render(btn.dataset.view);
  });
}

function render(view) {
  current = view;
  const app = document.getElementById("app");
  app.innerHTML = "";
  VIEWS[view].render(app, ctx);
  // 차트는 DOM 삽입 후 init되므로 한 박자 뒤 리사이즈로 안정화
  requestAnimationFrame(resizeAll);
}

boot();
