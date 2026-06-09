// ② 자사몰 — 이 데모의 핵심. 고객 단위 풀 분석.
// KPI → RFM → 코호트 → 재구매 엔진 → 상품 구성 → 시뮬레이터.

import * as ui from "../ui.js";
import * as fmt from "../format.js";
import { makeChart, COLORS } from "../charts.js";

export function render(root, ctx) {
  const A = ctx.analytics;
  const k = A.ownKpis;
  const segColor = Object.fromEntries(A.rfm.segments.map((s) => [s.key, s.color]));
  const segLabel = Object.fromEntries(A.rfm.segments.map((s) => [s.key, s.label]));

  root.innerHTML = `
    ${ui.viewHead("② 자사몰 — 고객 단위 풀 분석",
      "자사몰은 고객 한 명 한 명의 구매 이력을 가진다. 여기서만 RFM·코호트·재구매 예측 같은 진짜 CRM이 가능하다.")}

    <div class="grid cols-4">
      ${ui.kpi({ label: "자사몰 매출 (18개월)", accent: true, value: fmt.yenWon(k.revenue),
        foot: `구독 매출 ${fmt.yenCompact(k.subRevenue)} · 비중 <b>${fmt.pct(k.subRevenueShare)}</b>` })}
      ${ui.kpi({ label: "1→2 전환율 (2차 구매율)", value: fmt.pct(A.firstToSecond.overall),
        foot: `재구매율(주문기준) ${fmt.pct(k.repeatRate)}` })}
      ${ui.kpi({ label: "활성 구독 고객", value: fmt.num(k.subscriberCount) + "명",
        foot: `전체 구매고객 ${fmt.num(k.buyers)}명 중 ${fmt.pct(k.subscriberCount / k.buyers)}` })}
      ${ui.kpi({ label: "객단가 (AOV)", value: fmt.yen(k.aov),
        foot: `자사몰 주문 ${fmt.num(k.orderCount)}건` })}
    </div>

    <!-- RFM -->
    <div class="section">
      ${ui.sectionTitle("RFM 세그먼트", "최근성·구매빈도·구매금액으로 고객을 5그룹으로 나눠 '누구를 지키고 누구를 되살릴지' 가른다.")}
      ${ui.explain("전체 고객에게 똑같이 마케팅하면 돈이 샌다. 충성 고객은 지키고(구독 유도), 이탈위험은 케어하고, 휴면은 되살리는 식으로 타깃을 나누면 같은 돈으로 더 많은 매출을 만든다.")}
      <div class="grid cols-2" style="margin-top:14px">
        ${ui.card("세그먼트별 규모 · 매출기여", "막대=고객수, 색=세그먼트", ui.chartBox("rfmChart", "tall"))}
        ${ui.card("세그먼트 특징", "", segTable(A.rfm.segments))}
      </div>
    </div>

    <!-- 코호트 -->
    <div class="section">
      ${ui.sectionTitle("월별 코호트 리텐션", "첫 구매 '월'로 고객을 묶고, 이후 개월차에 다시 산 비율. 진한 칸이 오래 이어질수록 '안 새는' 장사다.")}
      ${ui.explain("가입 시점이 다른 고객을 같은 출발선에 세워 비교한다. 시간이 지나도 색이 진하게 유지되면 재구매가 잘 도는 것이고, 빠르게 옅어지면 양동이에 구멍이 난 것이다. 리텐션 개선의 효과를 한눈에 본다.")}
      <div class="card" style="margin-top:14px">
        ${ui.chartBox("cohortChart", "tall")}
        ${ui.note("진한 칸 = 해당 개월차에 재구매한 고객 비율이 높음. M+0은 첫 구매월이라 항상 100%.")}
      </div>
    </div>

    <!-- 재구매 엔진 -->
    <div class="section">
      ${ui.sectionTitle("재구매 엔진 — 오늘 챙길 고객", "마지막 구매 + 상품 소진일수로 '곧 떨어질 고객'을 예측한다.", "하이라이트")}
      ${ui.explain("건기식은 정해진 양을 매일 먹는 소모품이다. 한 통이 며칠분인지 알면 언제 떨어질지 계산할 수 있다. 떨어지기 직전에 먼저 챙기면 iHerb로 새기 전에 재구매를 잡는다. 이게 이탈 방어의 핵심이다.")}
      <div class="grid cols-4" style="margin-top:14px">
        ${ui.kpi({ label: "오늘 챙길 고객", accent: true, value: fmt.num(A.reorder.due.length) + "명",
          foot: "소진 임박~경과(−30~+7일)" })}
        ${ui.kpi({ label: "7일 내 소진 임박", value: fmt.num(A.reorder.within7) + "명" })}
        ${ui.kpi({ label: "이미 소진·미재구매", value: fmt.num(A.reorder.overdue) + "명" })}
        ${ui.kpi({ label: "회수 가능 매출(추정)", value: fmt.yenCompact(A.reorder.recoverable) })}
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-title">오늘 챙길 고객 리스트</div>
        <div class="card-sub">소진이 임박했거나 막 지난 비구독 고객. 세그먼트별 추천 액션을 붙였다.</div>
        <div class="tbl-wrap">${reorderTable(A.reorder.due, segColor, segLabel)}</div>
      </div>
    </div>

    <!-- 상품 구성 -->
    <div class="section">
      ${ui.sectionTitle("상품 구성 분석", "증상별 묶음 성과와 함께 구매되는 조합. 우리의 레버는 브랜드 마케팅이 아니라 큐레이션이다.")}
      ${ui.explain("미국 브랜드 인지도는 이미 수요를 만들어 준다. 우리가 매출을 키우는 방법은 '관절엔 이 세 가지'처럼 묶어 파는 큐레이션이다. 함께 사는 조합을 찾아 세트로 제안하면 객단가가 오르고 고객이 더 끈끈해진다.")}
      <div class="grid cols-2" style="margin-top:14px">
        ${ui.card("증상별 묶음(번들) 성과", "번들 상품을 2개 이상 함께 산 주문 기준", ui.chartBox("bundleChart"))}
        ${ui.card("함께 구매되는 조합 Top", "향상도(lift)=우연보다 몇 배 더 함께 사는가", `<div class="tbl-wrap">${pairTable(A.basket.pairs)}</div>`)}
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-title">증상별 추천 묶음 — 큐레이션 도구</div>
        <div class="card-sub">증상을 고르면 추천 세트와 묶음가·정기구독 옵션을 제안합니다. 큐레이션으로 객단가와 재구매를 동시에 올리는 화면입니다.</div>
        <div class="symptom-tabs" id="symptomTabs">
          ${A.basket.bundles.map((b, i) => `<button class="sym-tab ${i === 0 ? "active" : ""}" data-bundle="${b.id}">${b.name}</button>`).join("")}
        </div>
        <div id="bundleDetail"></div>
      </div>
    </div>

    <!-- 시뮬레이터 -->
    <div class="section">
      ${ui.sectionTitle("연매출 시뮬레이터", "재구매율과 구독 전환율을 올리면 연매출이 얼마나 달라지는가 — '방치 vs 실행'.", "설득 포인트")}
      ${ui.explain("분석은 결국 '하면 얼마를 더 버는가'로 말해야 한다. 슬라이더를 올리면 실행했을 때의 연매출이 즉시 바뀐다. 방치하면 잃는 금액이 곧 데이터 운영의 가치다.")}
      <div class="grid cols-2" style="margin-top:14px">
        ${ui.card("레버를 조정해 보세요", "", simControls(A.simulator))}
        ${ui.card("연매출 전망", "활성고객 × 객단가 × (구독 빈도 + 비구독 빈도)", simResult())}
      </div>
      ${ui.note("모델은 설득용 단순화 버전이다. 활성고객·객단가는 실제 데이터, 빈도 반응은 선형 가정. 실데이터 단계에서 정교화한다.", "blue")}
    </div>
  `;

  // ---- 차트 init ----
  initRfm(A.rfm);
  initCohort(A.cohort);
  initBundle(A.basket.bundles);
  wireSimulator(A.simulator);

  // ---- 증상 진단 위저드 ----
  const productById = ctx.data.productById;
  const showBundle = (bid) => {
    const b = A.basket.bundles.find((x) => x.id === bid);
    document.getElementById("bundleDetail").innerHTML = bundleDetail(b, productById);
  };
  showBundle(A.basket.bundles[0].id);
  root.querySelector("#symptomTabs").addEventListener("click", (e) => {
    const t = e.target.closest(".sym-tab");
    if (!t) return;
    root.querySelectorAll(".sym-tab").forEach((x) => x.classList.toggle("active", x === t));
    showBundle(t.dataset.bundle);
  });

  // ---- 표/위저드 버튼 (데모 발송·담기) ----
  root.addEventListener("click", (e) => {
    const row = e.target.closest(".row-act");
    if (row) {
      const r = A.reorder.due.find((x) => x.cid === row.dataset.cid);
      if (r) {
        row.textContent = "발송됨 ✓";
        row.classList.add("btn-ghost");
        ui.toast(`${r.cid} · ${r.productName} — ${r.action} (LINE) 발송 시뮬레이션 완료`);
      }
      return;
    }
    const cta = e.target.closest(".bundle-cta");
    if (cta) {
      ui.toast(`${cta.dataset.name} — ${cta.dataset.kind} 담기 시뮬레이션 완료`);
    }
  });
}

// ---------- RFM ----------
function segTable(segments) {
  const rows = segments.map((s) => [
    `${ui.dot(s.color)}<b>${s.label}</b>`,
    `${fmt.num(s.count)}명`,
    fmt.pct(s.revenueShare),
    `${s.avgRecency}일 / ${s.avgFrequency.toFixed(1)}회`,
    `<span class="muted">${s.desc}</span>`,
  ]);
  return ui.table(["세그먼트", "고객수", "매출기여", "평균 최근/빈도", "특징"], rows);
}

function initRfm(rfm) {
  const seg = rfm.segments;
  makeChart(document.getElementById("rfmChart"), {
    grid: { left: 8, right: 60, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (p) => {
        const s = seg[p[0].dataIndex];
        return `<b>${s.label}</b><br>고객 ${fmt.num(s.count)}명<br>매출기여 ${fmt.pct(s.revenueShare)}`;
      },
    },
    xAxis: { type: "value", axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: COLORS.grid } } },
    yAxis: { type: "category", data: seg.map((s) => s.label), inverse: true,
      axisLine: { show: false }, axisTick: { show: false } },
    series: [{
      type: "bar", barWidth: "55%",
      data: seg.map((s) => ({ value: s.count, itemStyle: { color: s.color, borderRadius: [0, 5, 5, 0] } })),
      label: { show: true, position: "right", formatter: (p) => fmt.num(p.value) + "명",
        color: COLORS.ink, fontWeight: 600 },
    }],
  });
}

// ---------- 코호트 히트맵 ----------
function initCohort(cohort) {
  const labels = cohort.rows.map((r) => fmt.monthLabel(r.cohort));
  const data = [];
  cohort.rows.forEach((r, yi) => {
    r.cells.forEach((v, off) => data.push([off, yi, Math.round(v * 100)]));
  });
  const xMax = Math.max(...cohort.rows.map((r) => r.cells.length)) - 1;
  makeChart(document.getElementById("cohortChart"), {
    grid: { left: 8, right: 16, top: 10, bottom: 56, containLabel: true },
    tooltip: {
      position: "top",
      formatter: (p) =>
        `${labels[p.value[1]]} 코호트 (${fmt.num(cohort.rows[p.value[1]].size)}명)<br>M+${p.value[0]}: <b>${p.value[2]}%</b> 재구매`,
    },
    xAxis: { type: "category", data: Array.from({ length: xMax + 1 }, (_, i) => "M+" + i),
      splitArea: { show: true }, axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: COLORS.axis, fontSize: 11 } },
    yAxis: { type: "category", data: labels, inverse: true,
      axisLine: { show: false }, axisTick: { show: false }, axisLabel: { fontSize: 11 } },
    visualMap: {
      min: 0, max: 60, calculable: true, orient: "horizontal", left: "center", bottom: 8,
      itemWidth: 12, itemHeight: 120, text: ["높음", "낮음"],
      inRange: { color: ["#f3f6fc", "#bcd4fb", "#5d92f4", "#2f6df0", "#1b4fc0"] },
      textStyle: { color: COLORS.axis },
    },
    series: [{
      type: "heatmap", data,
      label: { show: true, formatter: (p) => (p.value[2] >= 8 ? p.value[2] : ""), fontSize: 10, color: "#1b2740" },
      itemStyle: { borderColor: "#fff", borderWidth: 2 },
      emphasis: { itemStyle: { shadowBlur: 6, shadowColor: "rgba(0,0,0,0.2)" } },
    }],
  });
}

// ---------- 재구매 엔진 테이블 ----------
function actClass(action) {
  if (action.includes("이탈위험")) return "act-care";
  if (action.includes("구독")) return "act-sub";
  if (action.includes("리마인더")) return "act-remind";
  return "act-keep";
}

function reorderTable(due, segColor, segLabel) {
  const rows = due.slice(0, 40).map((r) => [
    `<b>${r.cid}</b> <span class="muted">${r.region}</span>`,
    `<span class="chip" style="background:${segColor[r.segment]}">${segLabel[r.segment]}</span>`,
    r.productName,
    fmt.dateLabel(r.lastDate),
    fmt.dateLabel(r.depletion),
    `<span class="${r.daysUntil < 0 ? "days-neg" : "days-pos"}">${fmt.daysLabel(r.daysUntil)}</span>`,
    `<span class="action-tag ${actClass(r.action)}">${r.action}</span>`,
    fmt.yen(r.reorderValue),
    `<button class="btn btn-sm row-act" data-cid="${r.cid}">챙기기</button>`,
  ]);
  const head = ["고객", "세그먼트", "임박 상품", "마지막 구매", "예상 소진일", "잔여", "추천 액션", "예상 재구매액", ""];
  const note = due.length > 40 ? `<div class="card-sub" style="margin-top:8px">상위 40명 표시 · 전체 ${fmt.num(due.length)}명</div>` : "";
  return ui.table(head, rows) + note;
}

// ---------- 상품 구성 ----------
function initBundle(bundles) {
  makeChart(document.getElementById("bundleChart"), {
    grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (p) => {
        const b = bundles[p[0].dataIndex];
        return `<b>${b.name}</b><br>함께구매 주문 ${fmt.num(b.orders)}건<br>매출 ${fmt.yen(b.revenue)}`;
      },
    },
    xAxis: { type: "value", axisLabel: { formatter: (v) => fmt.yenCompact(v) },
      splitLine: { lineStyle: { color: COLORS.grid } }, axisLine: { show: false }, axisTick: { show: false } },
    yAxis: { type: "category", data: bundles.map((b) => b.name), inverse: true,
      axisLine: { show: false }, axisTick: { show: false } },
    series: [{
      type: "bar", barWidth: "52%",
      data: bundles.map((b, i) => ({ value: b.revenue,
        itemStyle: { color: COLORS.series[i % COLORS.series.length], borderRadius: [0, 5, 5, 0] } })),
    }],
  });
}

function pairTable(pairs) {
  const rows = pairs.map((p) => [
    `${p.aName}<br><span class="muted">＋ ${p.bName}</span>`,
    `${fmt.num(p.cnt)}건`,
    fmt.pct(p.confidence, 0),
    `<b>${p.lift.toFixed(1)}배</b>`,
  ]);
  return ui.table(["조합", "동시구매", "신뢰도", "향상도"], rows);
}

// 증상 진단 위저드 — 선택한 번들의 세트가·구독 옵션 제안
function bundleDetail(b, productById) {
  const items = b.products.map((pid) => productById[pid]);
  const rows = items.map((p) => [
    `<b>${p.brand}</b> ${p.name_ko}`,
    `${p.daily_dose}${p.unit_label}/일 · ${p.days_supply}일분`,
    fmt.yen(p.price_jpy),
  ]);
  const individual = b.setPrice;                              // 개별가 합계
  const setPrice = Math.round(individual * 0.9 / 10) * 10;    // 세트 10% 할인
  const subPrice = Math.round(individual * 0.85 / 10) * 10;   // 구독 세트 15% 할인
  const cycle = Math.min(...items.map((p) => p.days_supply)); // 먼저 떨어지는 상품 기준 주기

  return `<div class="grid cols-2" style="margin-top:14px">
    <div>${ui.table(["상품", "섭취 · 소진", "개별가"], rows)}</div>
    <div class="set-offer">
      <div class="set-row"><span>개별 합계</span><b class="strike">${fmt.yen(individual)}</b></div>
      <div class="set-row big"><span>세트가 <span class="off">10% ↓</span></span><b>${fmt.yen(setPrice)}</b></div>
      <div class="set-save">${fmt.yen(individual - setPrice)} 절약</div>
      <div class="set-row sub"><span>정기구독 세트가 <span class="off">15% ↓</span></span>
        <b>${fmt.yen(subPrice)}</b></div>
      <div class="set-cyc">약 ${cycle}일마다 자동 배송 · 세트째 구독</div>
      <div class="set-cta">
        <button class="btn bundle-cta" data-name="${b.name}" data-kind="세트">세트 담기</button>
        <button class="btn btn-primary bundle-cta" data-name="${b.name}" data-kind="정기구독 세트">정기구독으로 담기</button>
      </div>
    </div>
  </div>`;
}

// ---------- 시뮬레이터 ----------
function annualRev(sb, r, s) {
  // 활성고객 × 객단가 × (구독비중×구독빈도 + 비구독비중×비구독빈도(재구매율에 선형 반응))
  // calib: 모델을 최근 12개월 실적에 맞춘 보정계수 → base(r0,s0)=실제 추세.
  const nonsubFreq = sb.nonsubBaseFreq * (r / sb.r0);
  return sb.calib * sb.activeBase * sb.aov * (s * sb.subFreq + (1 - s) * nonsubFreq);
}

function simControls(sb) {
  const rStart = Math.min(0.9, sb.r0 + 0.1);
  const sStart = Math.min(0.6, sb.s0 + 0.08);
  return `<div class="sim-controls">
    <div class="sim-row">
      <label>재구매율 <span id="rVal">${fmt.pct(rStart)}</span></label>
      <input id="rSlider" type="range" min="${(sb.r0).toFixed(2)}" max="${Math.min(0.9, sb.r0 + 0.3).toFixed(2)}" step="0.01" value="${rStart.toFixed(2)}">
      <div class="hint">현재 ${fmt.pct(sb.r0)} → 끌어올릴 목표</div>
    </div>
    <div class="sim-row">
      <label>구독 전환율 <span id="sVal">${fmt.pct(sStart)}</span></label>
      <input id="sSlider" type="range" min="${(sb.s0).toFixed(2)}" max="${Math.min(0.6, sb.s0 + 0.25).toFixed(2)}" step="0.01" value="${sStart.toFixed(2)}">
      <div class="hint">현재 ${fmt.pct(sb.s0)} → 끌어올릴 목표</div>
    </div>
  </div>`;
}

function simResult() {
  return `<div class="sim-result">
    <div class="sim-box"><div class="lbl">방치 (현재 추세)</div><div class="val" id="simBase">—</div></div>
    <div class="sim-box"><div class="lbl">실행 (목표 달성)</div><div class="val" id="simAction">—</div></div>
    <div class="sim-box delta"><div class="lbl">연매출 차이</div><div class="val" id="simDelta">—</div></div>
  </div>
  <div class="card-sub" style="margin-top:14px;text-align:center" id="simMsg"></div>`;
}

function wireSimulator(sb) {
  const rS = document.getElementById("rSlider");
  const sS = document.getElementById("sSlider");
  const base = annualRev(sb, sb.r0, sb.s0);
  document.getElementById("simBase").textContent = fmt.yenCompact(base);

  function update() {
    const r = parseFloat(rS.value), s = parseFloat(sS.value);
    document.getElementById("rVal").textContent = fmt.pct(r);
    document.getElementById("sVal").textContent = fmt.pct(s);
    const action = annualRev(sb, r, s);
    const delta = action - base;
    document.getElementById("simAction").textContent = fmt.yenCompact(action);
    document.getElementById("simDelta").textContent = "+" + fmt.yenCompact(delta);
    document.getElementById("simMsg").innerHTML =
      `방치하면 연 <b>${fmt.yenCompact(delta)}</b> (${fmt.wonCompact(delta * 9.4)})를 잃는 셈 · 실행 시 <b>+${fmt.pct(delta / base, 0)}</b>`;
  }
  rS.addEventListener("input", update);
  sS.addEventListener("input", update);
  update();
}
