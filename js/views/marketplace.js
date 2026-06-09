// ③ 마켓플레이스 — 채널·상품 단위만. 고객 단위 분석 불가.

import * as ui from "../ui.js";
import * as fmt from "../format.js";
import { makeChart, COLORS } from "../charts.js";

const MKT = ["rakuten", "amazon", "qoo10"];
const MKT_LABEL = { rakuten: "라쿠텐", amazon: "아마존", qoo10: "큐텐" };

export function render(root, ctx) {
  const A = ctx.analytics;
  const mkt = A.channels.filter((c) => MKT.includes(c.channel));
  const rev = mkt.reduce((s, c) => s + c.revenue, 0);
  const ord = mkt.reduce((s, c) => s + c.orderCount, 0);

  root.innerHTML = `
    ${ui.viewHead("③ 마켓플레이스 — 채널 · 상품 단위",
      "라쿠텐·아마존·큐텐의 매출과 SKU 성과를 본다. 단, 마켓은 고객 데이터를 주지 않아 여기선 채널·상품만 다룬다.")}

    ${ui.note("마켓플레이스는 주문·매출·SKU 같은 <b>채널·상품 단위 데이터만</b> 제공한다. 고객 한 명 한 명을 식별할 수 없어 RFM·재구매 엔진 같은 고객 단위 CRM은 <b>여기선 불가능</b>하다 — 그래서 ② 자사몰이 분석의 본진이다.")}

    <div class="grid cols-4" style="margin-top:16px">
      ${ui.kpi({ label: "마켓 매출 (18개월)", accent: true, value: fmt.yenWon(rev) })}
      ${ui.kpi({ label: "마켓 주문수", value: fmt.num(ord) + "건" })}
      ${ui.kpi({ label: "마켓 객단가 (AOV)", value: fmt.yen(rev / ord) })}
      ${ui.kpi({ label: "운영 채널", value: "3개",
        foot: "라쿠텐 · 아마존 · 큐텐" })}
    </div>

    <div class="section">
      ${ui.sectionTitle("채널별 성과", "어느 마켓이 얼마를 파는가 — 매출 · 주문 · 객단가.")}
      <div class="grid cols-2" style="margin-top:14px">
        ${ui.card("채널별 매출 · 주문수", "", ui.chartBox("mktChannelChart"))}
        ${ui.card("채널 요약", "", channelTable(mkt))}
      </div>
    </div>

    <div class="section">
      ${ui.sectionTitle("SKU별 성과", "어떤 상품이 어느 채널에서 잘 팔리는가. 채널마다 강한 상품이 다르다.")}
      <div class="card" style="margin-top:14px">
        <div class="card-title">상품 × 채널 매출</div>
        <div class="card-sub">전 채널 매출 상위 SKU. 자사몰 포함 비교(자사몰은 회색).</div>
        <div class="tbl-wrap">${skuTable(A.sku)}</div>
      </div>
    </div>

    <div class="section">
      ${ui.sectionTitle("채널 간 가격 비교", "같은 상품의 채널별 평균 판매가. 가격 포지셔닝을 한눈에.")}
      <div class="card" style="margin-top:14px">
        ${ui.chartBox("priceChart", "tall")}
        ${ui.note("막대=상품별 채널 평균 단가. 채널마다 가격대를 다르게 가져가는 전략을 점검한다.")}
      </div>
    </div>
  `;

  initMktChannel(mkt);
  initPrice(A.sku);
}

function channelTable(mkt) {
  const rows = [...mkt].sort((a, b) => b.revenue - a.revenue).map((c) => [
    `${ui.dot(COLORS[c.channel])}<b>${c.label}</b>`,
    fmt.yenCompact(c.revenue),
    fmt.num(c.orderCount) + "건",
    fmt.yen(c.aov),
    `<span class="${c.growth >= 0 ? "days-pos" : "days-neg"}">${fmt.signedPct(c.growth, 0)}</span>`,
  ]);
  return ui.table(["채널", "매출", "주문수", "객단가", "성장률"], rows);
}

function initMktChannel(mkt) {
  makeChart(document.getElementById("mktChannelChart"), {
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    legend: { top: 4, data: ["매출", "주문수"], icon: "roundRect", itemWidth: 12, itemHeight: 8 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "category", data: mkt.map((c) => c.label),
      axisLine: { show: false }, axisTick: { show: false } },
    yAxis: [
      { type: "value", name: "매출", axisLabel: { formatter: (v) => fmt.yenCompact(v) },
        splitLine: { lineStyle: { color: COLORS.grid } } },
      { type: "value", name: "주문수", axisLabel: { formatter: (v) => fmt.num(v) }, splitLine: { show: false } },
    ],
    series: [
      { name: "매출", type: "bar", barWidth: "38%", yAxisIndex: 0,
        data: mkt.map((c, i) => ({ value: c.revenue, itemStyle: { color: COLORS[c.channel], borderRadius: [5, 5, 0, 0] } })),
        tooltip: { valueFormatter: (v) => fmt.yen(v) } },
      { name: "주문수", type: "line", yAxisIndex: 1, symbol: "circle", symbolSize: 7,
        lineStyle: { color: COLORS.ink, width: 2 }, itemStyle: { color: COLORS.ink },
        data: mkt.map((c) => c.orderCount), tooltip: { valueFormatter: (v) => fmt.num(v) + "건" } },
    ],
  });
}

function skuTable(sku) {
  const top = sku.rows.slice(0, 14);
  const head = ["상품", "분류", "자사몰", "라쿠텐", "아마존", "큐텐", "합계"];
  const rows = top.map((r) => {
    const cell = (ch) => (r.channels[ch] ? fmt.yenCompact(r.channels[ch].revenue) : "<span class='muted'>–</span>");
    return [
      `<b>${r.brand}</b> ${r.name}`,
      `<span class="chip chip-soft">${r.category}</span>`,
      `<span class="muted">${cell("own")}</span>`,
      cell("rakuten"), cell("amazon"), cell("qoo10"),
      `<b>${fmt.yenCompact(r.total)}</b>`,
    ];
  });
  return ui.table(head, rows);
}

function initPrice(sku) {
  // 자사몰 포함 4채널 평균 단가 비교 (상위 10 SKU)
  const top = sku.rows.slice(0, 10);
  const channels = ["own", ...MKT];
  const label = { own: "자사몰", ...MKT_LABEL };
  const avgPrice = (r, ch) => (r.channels[ch] && r.channels[ch].qty ? r.channels[ch].revenue / r.channels[ch].qty : 0);
  makeChart(document.getElementById("priceChart"), {
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    legend: { top: 4, icon: "roundRect", itemWidth: 12, itemHeight: 8 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => fmt.yen(v) },
    xAxis: { type: "category", data: top.map((r) => r.name.length > 12 ? r.name.slice(0, 11) + "…" : r.name),
      axisLabel: { interval: 0, rotate: 32, fontSize: 10, color: COLORS.axis },
      axisLine: { show: false }, axisTick: { show: false } },
    yAxis: { type: "value", axisLabel: { formatter: (v) => fmt.yenCompact(v) },
      splitLine: { lineStyle: { color: COLORS.grid } } },
    series: channels.map((ch) => ({
      name: label[ch], type: "bar", barGap: 0,
      itemStyle: { color: COLORS[ch] },
      data: top.map((r) => Math.round(avgPrice(r, ch))),
    })),
  });
}
