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
    showIntro(data.meta);
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

// 인트로 표지 — 대표가 맥락 없이 차트부터 보지 않도록 한 장으로 프레이밍
function showIntro(meta) {
  const ov = document.createElement("div");
  ov.className = "intro-cover";
  ov.innerHTML = `
    <div class="intro-card">
      <div class="intro-badge">개념증명 데모 · 가상 데이터</div>
      <h1 class="intro-title">오플 재팬 · 고객 인텔리전스 대시보드</h1>
      <p class="intro-lead">데이터로 일본 사업을 운영하면 매출이 어떻게 움직이는가</p>
      <div class="intro-points">
        <div class="ip"><span class="ip-k">무엇인가</span>한국 본사가 일본 사업(자사몰 + 라쿠텐·아마존·큐텐)을 한 화면에서 들여다보는 내부 관리 대시보드 시안</div>
        <div class="ip"><span class="ip-k">왜 보나</span>건기식은 재구매·정기구독이 매출 엔진. "분석 → 재구매 유도"로 iHerb 이탈을 막는 그림을 보여줍니다</div>
        <div class="ip"><span class="ip-k">데이터</span>실제 운영 데이터가 아닌 가상 데이터입니다. 화면과 분석 로직으로 컨셉을 설득하는 용도</div>
      </div>
      <div class="intro-core">마켓은 신규 획득 채널, 자사몰은 구독·LTV 엔진. 데이터로 운영하면 자사몰 연매출 약 +20% 업사이드.</div>
      <button class="btn btn-primary intro-go" id="intro-go">대시보드 둘러보기</button>
    </div>`;
  document.body.appendChild(ov);
  document.getElementById("intro-go").addEventListener("click", () => {
    ov.classList.add("hide");
    setTimeout(() => { ov.remove(); resizeAll(); }, 220);
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
