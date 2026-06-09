// ① 통합 관리 — 모든 채널 합산. 채널 통합 가시성.

import * as ui from "../ui.js";
import * as fmt from "../format.js";
import { makeChart, COLORS } from "../charts.js";

export function render(root, ctx) {
  const A = ctx.analytics;
  const totalRev = A.channels.reduce((s, c) => s + c.revenue, 0);
  const totalOrders = A.channels.reduce((s, c) => s + c.orderCount, 0);
  const aov = totalRev / totalOrders;
  const ownActive = A.ownKpis.active90;

  root.innerHTML = `
    ${ui.viewHead("① 통합 관리 — 전 채널 합산",
      "자사몰과 마켓플레이스(라쿠텐·아마존·큐텐)를 한 화면에서 본다. 한국 본사에서 일본 사업 전체를 가늠하는 시작점.")}

    <div class="grid cols-4">
      ${ui.kpi({ label: "전체 매출 (18개월)", accent: true, value: fmt.yenWon(totalRev),
        foot: `자사몰 ${fmt.pct(A.ownKpis.revenue / totalRev)} · 마켓 ${fmt.pct(1 - A.ownKpis.revenue / totalRev)}` })}
      ${ui.kpi({ label: "전체 주문수", value: fmt.num(totalOrders) + "건" })}
      ${ui.kpi({ label: "전체 객단가 (AOV)", value: fmt.yen(aov) })}
      ${ui.kpi({ label: "활성 고객 수", value: fmt.num(ownActive) + "명",
        foot: "자사몰 기준(90일 내) · 마켓은 고객 식별 불가" })}
    </div>

    <div class="section">
      ${ui.sectionTitle("전체 매출 추이 · 채널 구성", "월별 매출을 채널로 쌓아 본다. 색의 두께가 그 달 채널 기여.")}
      <div class="grid cols-2" style="margin-top:14px">
        ${ui.card("월별 매출 (채널 누적)", "", ui.chartBox("trendChart", "tall"), "span-2")}
      </div>
    </div>

    <div class="section">
      <div class="grid cols-2">
        ${ui.card("채널별 매출 비중", "18개월 누적", ui.chartBox("shareChart"))}
        ${ui.card("채널 비교", "매출 · 주문 · 객단가 · 성장률", `<div class="tbl-wrap">${channelTable(A.channels)}</div>`)}
      </div>
    </div>

    <div class="section">
      ${ui.sectionTitle("마켓 → 자사몰 구독 전환 퍼널", "마켓에서 처음 산 고객을 자사몰 구독으로 데려오는 그림.", "옵션 · 가정")}
      ${ui.explain("마켓플레이스는 노출과 신규 유입이 강하지만 고객을 우리가 못 잡는다. 이들을 자사몰 회원·구독으로 옮기면 비로소 재구매·LTV를 우리가 관리한다. 단, 지금은 채널 간 고객 연결이 없어 '가정' 전환율로만 그린 그림이다.")}
      <div class="card" style="margin-top:14px">
        ${ui.chartBox("funnelChart")}
        ${ui.note("채널 간 고객 단위 연결이 불완전해 실측이 아니라 <b>가정 전환율</b>(방문 12% · 가입 25% · 구독 18%)로 그린 그림이다. 실서비스에선 마켓 ToS상 고객 외부 유인이 제한되는 점도 함께 고려해야 한다.")}
      </div>
    </div>
  `;

  initTrend(A.monthly);
  initShare(A.channels);
  initFunnel(A.funnel);
}

function channelTable(channels) {
  const rows = [...channels]
    .sort((a, b) => b.revenue - a.revenue)
    .map((c) => [
      `${ui.dot(COLORS[c.channel])}<b>${c.label}</b>`,
      fmt.yenCompact(c.revenue),
      fmt.num(c.orderCount) + "건",
      fmt.yen(c.aov),
      `<span class="${c.growth >= 0 ? "days-pos" : "days-neg"}">${fmt.signedPct(c.growth, 0)}</span>`,
    ]);
  return ui.table(["채널", "매출", "주문수", "객단가", "성장률"], rows);
}

function initTrend(monthly) {
  const labels = monthly.months.map(fmt.monthLabel);
  const series = monthly.channels.map((ch) => ({
    name: ({ own: "자사몰", rakuten: "라쿠텐", amazon: "아마존", qoo10: "큐텐" })[ch],
    type: "line", stack: "total", areaStyle: { opacity: 0.85 }, symbol: "none", smooth: true,
    lineStyle: { width: 0 }, itemStyle: { color: COLORS[ch] },
    data: monthly.rows.map((r) => Math.round(r[ch])),
  }));
  makeChart(document.getElementById("trendChart"), {
    grid: { left: 8, right: 20, top: 36, bottom: 24, containLabel: true },
    legend: { top: 4, icon: "roundRect", itemWidth: 12, itemHeight: 8 },
    tooltip: { trigger: "axis", valueFormatter: (v) => fmt.yenCompact(v) },
    xAxis: { type: "category", data: labels, boundaryGap: false,
      axisLine: { lineStyle: { color: COLORS.grid } }, axisTick: { show: false },
      axisLabel: { color: COLORS.axis, fontSize: 11 } },
    yAxis: { type: "value", axisLabel: { formatter: (v) => fmt.yenCompact(v) },
      splitLine: { lineStyle: { color: COLORS.grid } } },
    series,
  });
}

function initShare(channels) {
  makeChart(document.getElementById("shareChart"), {
    tooltip: { trigger: "item", valueFormatter: (v) => fmt.yenCompact(v) },
    legend: { bottom: 0, icon: "circle", itemWidth: 9 },
    series: [{
      type: "pie", radius: ["52%", "74%"], center: ["50%", "44%"],
      avoidLabelOverlap: true, itemStyle: { borderColor: "#fff", borderWidth: 2 },
      label: { formatter: "{b}\n{d}%", fontSize: 11, color: COLORS.ink },
      data: channels.map((c) => ({ name: c.label, value: c.revenue, itemStyle: { color: COLORS[c.channel] } })),
    }],
  });
}

function initFunnel(funnel) {
  makeChart(document.getElementById("funnelChart"), {
    tooltip: { trigger: "item", formatter: (p) => `${p.name}<br><b>${fmt.num(p.value)}</b>` },
    series: [{
      type: "funnel", left: "8%", right: "8%", top: 16, bottom: 16, minSize: "24%",
      label: { formatter: (p) => `${p.name}  ${fmt.num(p.value)}`, color: "#fff", fontWeight: 600 },
      itemStyle: { borderColor: "#fff", borderWidth: 2 },
      color: ["#9aa3b2", "#7a5af5", "#2f6df0", "#13a89e"],
      data: funnel.steps.map((s) => ({ name: s.label, value: s.value })),
    }],
  });
}
