// ★ 분석 산식 — 이 데모의 두뇌.
// RFM · 코호트 · 1→2전환 · 소진주기(재구매 엔진) · 장바구니 · LTV · 시뮬레이터 · 채널비교.
// 각 함수 위에 "무엇이고 왜 매출로 연결되는가"를 주석으로 적었다.

// ---------- 공통 헬퍼 ----------
const DAY = 86400000;
const d = (iso) => new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
const daysBetween = (a, b) => Math.round((b - a) / DAY);
const monthKey = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
const monthIndex = (dt) => dt.getFullYear() * 12 + dt.getMonth();

// 5분위 점수: 값이 클수록 1~5점. thresholds = [q20,q40,q60,q80]
function quintileScorer(values) {
  const s = [...values].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const t = [q(0.2), q(0.4), q(0.6), q(0.8)];
  return (v) => (v <= t[0] ? 1 : v <= t[1] ? 2 : v <= t[2] ? 3 : v <= t[3] ? 4 : 5);
}

function orderRevenue(o) {
  return o.order_total_jpy;
}

// ===========================================================================
export function buildAnalytics(data) {
  const today = d(data.meta.today);
  const { ownOrders, marketplaceOrders, customers, products, productById, subscriptions } = data;

  // 고객별 자사몰 주문(시간순)
  const ordersByCustomer = new Map();
  for (const o of ownOrders) {
    if (!ordersByCustomer.has(o.customer_id)) ordersByCustomer.set(o.customer_id, []);
    ordersByCustomer.get(o.customer_id).push(o);
  }
  for (const arr of ordersByCustomer.values()) arr.sort((a, b) => d(a.order_date) - d(b.order_date));

  // 한 번씩만 계산해 재사용(액션 센터가 여러 결과를 함께 쓴다)
  const ownKpisR = ownKpis();
  const rfmR = rfm();
  const reorderR = reorderEngine();
  const basketR = basketAnalysis();
  const ltvR = ltvComparison();

  return {
    today,
    ownKpis: ownKpisR,
    rfm: rfmR,
    cohort: cohort(),
    firstToSecond: firstToSecond(),
    reorder: reorderR,
    basket: basketR,
    ltv: ltvR,
    simulator: simulatorBase(),
    monthly: monthlySeries(),
    channels: channelComparison(),
    sku: skuByChannel(),
    funnel: marketplaceFunnel(),
    actions: buildActions(ownKpisR, rfmR, reorderR, basketR, ltvR),
  };

  // ---------- ② 자사몰 KPI ----------
  // 재구매율 = 재구매 주문 비중(전체 주문 중 첫구매가 아닌 주문).
  // 1→2 전환율 = 구매 고객 중 2회 이상 산 비율(가장 어렵고 LTV를 가장 잘 예측).
  function ownKpis() {
    const revenue = ownOrders.reduce((s, o) => s + orderRevenue(o), 0);
    const orderCount = ownOrders.length;
    const aov = revenue / orderCount;
    const buyers = ordersByCustomer.size;
    const firstOrders = buyers; // 고객당 첫 주문 1건
    const repeatRate = (orderCount - firstOrders) / orderCount;

    let active90 = 0;
    for (const arr of ordersByCustomer.values()) {
      if (daysBetween(d(arr[arr.length - 1].order_date), today) <= 90) active90++;
    }
    const subscriberCount = customers.filter((c) => c.is_subscriber).length;
    const subRevenue = ownOrders.filter((o) => o.is_subscription_order).reduce((s, o) => s + orderRevenue(o), 0);

    return {
      revenue, orderCount, aov, buyers, active90, repeatRate,
      subscriberCount, subRevenueShare: subRevenue / revenue, subRevenue,
    };
  }

  // ---------- RFM 세그먼트 ----------
  // 각 고객을 Recency(최근성)·Frequency(빈도)·Monetary(금액)로 5점화하고
  // 규칙으로 5개 세그먼트에 배치 → "누구를 지킬지/되살릴지" 타깃을 가른다.
  function rfm() {
    const rows = [];
    for (const [cid, arr] of ordersByCustomer) {
      const recency = daysBetween(d(arr[arr.length - 1].order_date), today);
      const frequency = arr.length;
      const monetary = arr.reduce((s, o) => s + orderRevenue(o), 0);
      rows.push({ cid, recency, frequency, monetary });
    }
    const rScore = quintileScorer(rows.map((x) => -x.recency)); // 최근일수록 고점
    const fScore = quintileScorer(rows.map((x) => x.frequency));
    const mScore = quintileScorer(rows.map((x) => x.monetary));

    const SEG = {
      champion: { key: "champion", label: "충성", desc: "최근·자주·많이. 지켜야 할 핵심", color: "#2f6df0" },
      loyal: { key: "loyal", label: "우량", desc: "꾸준한 중간층. 키우면 충성으로", color: "#13a89e" },
      new: { key: "new", label: "신규", desc: "막 들어온 1~2회. 2차 구매가 관건", color: "#7a5af5" },
      atrisk: { key: "atrisk", label: "이탈위험", desc: "잘 사다 조용해짐. iHerb로 새는 중", color: "#e8893b" },
      dormant: { key: "dormant", label: "휴면", desc: "오래전 1~2회. 되살리기 캠페인 대상", color: "#9aa3b2" },
    };

    const seg = new Map();
    for (const row of rows) {
      const R = rScore(-row.recency), F = fScore(row.frequency), M = mScore(row.monetary);
      let s;
      if (R >= 4 && F >= 4) s = "champion";
      else if (R <= 2 && (F >= 3 || M >= 4)) s = "atrisk";
      else if (R >= 4 && F <= 2) s = "new";
      else if (R <= 2 && F <= 2) s = "dormant";
      else s = "loyal";
      row.segment = s;
      row.R = R; row.F = F; row.M = M;
      if (!seg.has(s)) seg.set(s, { ...SEG[s], count: 0, revenue: 0, recencySum: 0, freqSum: 0 });
      const g = seg.get(s);
      g.count++; g.revenue += row.monetary; g.recencySum += row.recency; g.freqSum += row.frequency;
    }
    const totalRev = rows.reduce((s, r) => s + r.monetary, 0);
    const segments = ["champion", "loyal", "new", "atrisk", "dormant"]
      .filter((k) => seg.has(k))
      .map((k) => {
        const g = seg.get(k);
        return {
          ...g,
          revenueShare: g.revenue / totalRev,
          avgRecency: Math.round(g.recencySum / g.count),
          avgFrequency: g.freqSum / g.count,
        };
      });
    const byCustomer = new Map(rows.map((r) => [r.cid, r]));
    return { segments, byCustomer, totalRev };
  }

  // ---------- 코호트 리텐션 ----------
  // 첫구매 '월'로 고객을 묶고, 이후 N개월차에 다시 산 비율을 표(히트맵)로.
  // "구멍난 양동이"를 눈으로 보여줘 리텐션이 개선되는지 진단한다.
  function cohort() {
    const firstMonthOf = new Map();
    const activeMonths = new Map(); // cid -> Set(monthIndex)
    for (const [cid, arr] of ordersByCustomer) {
      firstMonthOf.set(cid, monthIndex(d(arr[0].order_date)));
      const set = new Set(arr.map((o) => monthIndex(d(o.order_date))));
      activeMonths.set(cid, set);
    }
    const cohortKeys = [...new Set([...firstMonthOf.values()])].sort((a, b) => a - b);
    const maxOffset = monthIndex(today) - cohortKeys[0];
    const rows = cohortKeys.map((cm) => {
      const members = [...firstMonthOf].filter(([, m]) => m === cm).map(([cid]) => cid);
      const span = monthIndex(today) - cm;
      const cells = [];
      for (let off = 0; off <= span; off++) {
        const retained = members.filter((cid) => activeMonths.get(cid).has(cm + off)).length;
        cells.push(retained / members.length);
      }
      const ym = `${Math.floor(cm / 12)}-${String((cm % 12) + 1).padStart(2, "0")}`;
      return { cohort: ym, size: members.length, cells };
    });
    return { rows, maxOffset };
  }

  // ---------- 1→2 전환율(2차 구매율) ----------
  // 첫 구매 고객이 두 번째 구매까지 가는 비율. 전체 + 유입경로별 + 코호트 추세.
  function firstToSecond() {
    let buyers = 0, second = 0;
    const byChannel = {};
    for (const [cid, arr] of ordersByCustomer) {
      const ch = data.customerById[cid].acquisition_channel;
      byChannel[ch] = byChannel[ch] || { buyers: 0, second: 0 };
      buyers++; byChannel[ch].buyers++;
      if (arr.length >= 2) { second++; byChannel[ch].second++; }
    }
    const channelRows = Object.entries(byChannel)
      .map(([ch, v]) => ({ channel: ch, rate: v.second / v.buyers, buyers: v.buyers }))
      .sort((a, b) => b.rate - a.rate);
    return { overall: second / buyers, buyers, second, channelRows };
  }

  // ---------- 소진주기 예측(재구매 엔진) — 하이라이트 ----------
  // 고객별 '마지막 구매 + 소진일수'로 떨어질 시점을 추정해
  // "오늘 챙길 고객"을 뽑고, 세그먼트별 추천 액션을 붙인다(iHerb 이탈 선제 차단).
  function reorderEngine() {
    const rfmRes = rfm();
    const rows = [];
    for (const [cid, arr] of ordersByCustomer) {
      const cust = data.customerById[cid];
      // 상품별 마지막 구매 → 가장 먼저 소진되는 상품이 다음 재구매 트리거
      const lastByProduct = new Map();
      for (const o of arr) {
        for (const it of o.items) {
          const prev = lastByProduct.get(it.product_id);
          const od = d(o.order_date);
          if (!prev || od > prev.date) lastByProduct.set(it.product_id, { date: od, qty: it.qty });
        }
      }
      let soonest = null;
      for (const [pid, info] of lastByProduct) {
        const p = productById[pid];
        const supplyDays = p.days_supply * info.qty;
        const depletion = new Date(info.date.getTime() + supplyDays * DAY);
        const daysUntil = daysBetween(today, depletion);
        if (!soonest || daysUntil < soonest.daysUntil) {
          soonest = { pid, product: p, lastDate: info.date, depletion, daysUntil };
        }
      }
      if (!soonest) continue;
      const seg = rfmRes.byCustomer.get(cid).segment;
      rows.push({
        cid, segment: seg, region: cust.region,
        isSubscriber: cust.is_subscriber,
        productName: `${soonest.product.brand} ${soonest.product.name_ko}`,
        lastDate: soonest.lastDate.toISOString().slice(0, 10),
        depletion: soonest.depletion.toISOString().slice(0, 10),
        daysUntil: soonest.daysUntil,
        reorderValue: soonest.product.price_jpy,
        action: recommendAction(seg, soonest.daysUntil, cust.is_subscriber),
      });
    }

    // "오늘 챙길 고객" = 비구독 + 소진 임박/경과(−30 ~ +7일), 너무 오래된 휴면은 제외
    const due = rows
      .filter((r) => !r.isSubscriber && r.daysUntil <= 7 && r.daysUntil >= -30)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    const within7 = due.filter((r) => r.daysUntil >= 0).length;
    const overdue = due.filter((r) => r.daysUntil < 0).length;
    const recoverable = due.reduce((s, r) => s + r.reorderValue, 0);

    return { rows, due, within7, overdue, recoverable };
  }

  function recommendAction(seg, daysUntil, isSub) {
    if (isSub) return "구독 유지 확인";
    if (seg === "atrisk" || daysUntil < -14) return "이탈위험 케어(쿠폰·리마인더)";
    if (seg === "champion" || seg === "loyal") return "정기구독 전환 제안";
    if (daysUntil <= 7) return "재구매 리마인더";
    return "관찰";
  }

  // ---------- 장바구니 분석(함께 구매) ----------
  // 같은 주문에 함께 담긴 상품쌍의 동시구매를 support·confidence·lift로 계산.
  // 증상 번들 성과와 묶어 큐레이션/세트(객단가↑·고착화)로 연결한다.
  function basketAnalysis() {
    const N = ownOrders.length;
    const single = new Map(); // pid -> 주문수
    const pair = new Map();   // "a|b" -> 동시 주문수
    for (const o of ownOrders) {
      const ids = [...new Set(o.items.map((it) => it.product_id))];
      for (const id of ids) single.set(id, (single.get(id) || 0) + 1);
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const key = [ids[i], ids[j]].sort().join("|");
          pair.set(key, (pair.get(key) || 0) + 1);
        }
    }
    const pairs = [...pair.entries()]
      .map(([key, cnt]) => {
        const [a, b] = key.split("|");
        const support = cnt / N;
        const confidence = cnt / single.get(a); // a를 산 주문 중 b도 산 비율
        const lift = support / ((single.get(a) / N) * (single.get(b) / N));
        return {
          a, b, cnt, support, confidence, lift,
          aName: productById[a].name_ko, bName: productById[b].name_ko,
        };
      })
      .filter((p) => p.cnt >= 5)
      .sort((a, b) => b.lift - a.lift);

    // 증상 번들 성과: 번들 상품을 2개 이상 함께 산 주문수·매출
    const bundles = data.meta.bundles.map((bd) => {
      const set = new Set(bd.products);
      let orders = 0, revenue = 0;
      for (const o of ownOrders) {
        const hit = o.items.filter((it) => set.has(it.product_id));
        if (hit.length >= 2) {
          orders++;
          revenue += hit.reduce((s, it) => s + it.unit_price_jpy * it.qty, 0);
        }
      }
      const setPrice = bd.products.reduce((s, pid) => s + productById[pid].price_jpy, 0);
      return { ...bd, orders, revenue, setPrice,
        productNames: bd.products.map((pid) => productById[pid].name_ko) };
    }).sort((a, b) => b.revenue - a.revenue);

    return { pairs: pairs.slice(0, 12), bundles };
  }

  // ---------- LTV 비교(구독 vs 1회성) ----------
  // 두 그룹의 1인당 누적매출·구매빈도를 비교하고 12개월 예상 LTV를 추정.
  // 구독이 매출 엔진임을 수치로 증명 → 정기구독 추진의 근거.
  function ltvComparison() {
    const groups = { sub: [], once: [] };
    for (const [cid, arr] of ordersByCustomer) {
      const cust = data.customerById[cid];
      const revenue = arr.reduce((s, o) => s + orderRevenue(o), 0);
      const first = d(arr[0].order_date);
      // 관측연수 = 첫 구매 후 지켜본 기간(하한 90일). 짧은 관측이 빈도를 부풀리지 않게.
      const obsYears = Math.max(90, daysBetween(first, today)) / 365;
      (cust.is_subscriber ? groups.sub : groups.once).push({ revenue, orders: arr.length, obsYears, aov: revenue / arr.length });
    }
    const summarize = (g) => {
      const n = g.length;
      const avgRevenue = g.reduce((s, x) => s + x.revenue, 0) / n;
      const avgOrders = g.reduce((s, x) => s + x.orders, 0) / n;
      const avgAov = g.reduce((s, x) => s + x.aov, 0) / n;
      // 그룹 단위 연 구매빈도 = 총주문 ÷ 총관측연수 (개인별 평균보다 안정적)
      const annualFreq = g.reduce((s, x) => s + x.orders, 0) / g.reduce((s, x) => s + x.obsYears, 0);
      const projLtv12 = avgAov * annualFreq; // 단순 12개월 예상 LTV
      return { n, avgRevenue, avgOrders, avgAov, annualFreq, projLtv12 };
    };
    const sub = summarize(groups.sub), once = summarize(groups.once);
    return { sub, once, ltvMultiple: sub.projLtv12 / once.projLtv12 };
  }

  // ---------- 시뮬레이터 기준값 + 모델 ----------
  // 재구매율 r·구독전환율 s를 올리면 연매출이 어떻게 변하는지.
  // 모델은 단순·투명하게: 활성고객 × AOV × (비구독 빈도(r) + 구독 빈도(s)).
  function simulatorBase() {
    const k = ownKpis();
    const ltvRes = ltvComparison();
    // 연 단위로 움직일 활성 고객 모수 = 최근 365일 내 구매 고객
    let activeBase = 0;
    for (const arr of ordersByCustomer.values()) {
      if (daysBetween(d(arr[arr.length - 1].order_date), today) <= 365) activeBase++;
    }
    const aov = k.aov;
    const r0 = k.repeatRate;                // 현재 재구매율
    const s0 = k.subscriberCount / k.buyers; // 현재 구독 전환율
    const subFreq = Math.max(ltvRes.sub.annualFreq, 2.5);  // 구독고객 연 구매빈도(안정)
    const nonsubBaseFreq = Math.max(ltvRes.once.annualFreq, 1.0);

    // 모델을 최근 12개월 실적(TTM)에 맞춰 보정 → base(r0,s0)가 실제 추세와 일치.
    const yearAgo = new Date(today.getTime() - 365 * DAY);
    const ttmRevenue = ownOrders
      .filter((o) => d(o.order_date) >= yearAgo)
      .reduce((s, o) => s + orderRevenue(o), 0);
    const rawBase = activeBase * aov * (s0 * subFreq + (1 - s0) * nonsubBaseFreq);
    const calib = ttmRevenue / rawBase;

    return { activeBase, aov, r0, s0, subFreq, nonsubBaseFreq, ttmRevenue, calib };
  }

  // ---------- 월별 매출 시계열(채널별) ----------
  function monthlySeries() {
    const map = new Map(); // monthKey -> {own,rakuten,amazon,qoo10}
    const channels = ["own", "rakuten", "amazon", "qoo10"];
    for (const o of data.orders) {
      const key = monthKey(d(o.order_date));
      if (!map.has(key)) map.set(key, { month: key, own: 0, rakuten: 0, amazon: 0, qoo10: 0 });
      map.get(key)[o.channel] += orderRevenue(o);
    }
    const months = [...map.keys()].sort();
    return { months, rows: months.map((m) => map.get(m)), channels };
  }

  // ---------- 채널 비교(매출·주문·AOV·성장률) ----------
  function channelComparison() {
    const channels = ["own", "rakuten", "amazon", "qoo10"];
    const ms = monthlySeries();
    return channels.map((ch) => {
      const list = data.orders.filter((o) => o.channel === ch);
      const revenue = list.reduce((s, o) => s + orderRevenue(o), 0);
      const orderCount = list.length;
      // 성장률: 마지막 완전월 vs 첫 완전월 (단순 비교)
      const firstM = ms.rows[1] ? ms.rows[1][ch] : ms.rows[0][ch];
      const lastM = ms.rows[ms.rows.length - 2] ? ms.rows[ms.rows.length - 2][ch] : ms.rows[ms.rows.length - 1][ch];
      const growth = firstM > 0 ? lastM / firstM - 1 : 0;
      return { channel: ch, label: data.meta.channels[ch], revenue, orderCount, aov: revenue / orderCount, growth };
    });
  }

  // ---------- SKU × 채널 성과 ----------
  function skuByChannel() {
    const channels = ["own", "rakuten", "amazon", "qoo10"];
    const map = new Map(); // pid -> {channel: {qty,revenue}}
    for (const o of data.orders) {
      for (const it of o.items) {
        if (!map.has(it.product_id)) map.set(it.product_id, {});
        const row = map.get(it.product_id);
        row[o.channel] = row[o.channel] || { qty: 0, revenue: 0 };
        row[o.channel].qty += it.qty;
        row[o.channel].revenue += it.unit_price_jpy * it.qty;
      }
    }
    const rows = [...map.entries()].map(([pid, ch]) => {
      const p = productById[pid];
      const total = channels.reduce((s, c) => s + (ch[c]?.revenue || 0), 0);
      return { pid, name: p.name_ko, brand: p.brand, category: p.category_label, channels: ch, total };
    }).sort((a, b) => b.total - a.total);
    return { rows, channels };
  }

  // ---------- (옵션) 마켓→자사몰 구독 퍼널 — 가정 기반 ----------
  // 채널 간 고객 연결이 불완전하므로 '가정' 전환율로만 그린다(주석 명시).
  function marketplaceFunnel() {
    const mktBuyers = marketplaceOrders.length; // 익명 주문을 신규 유입 대용치로
    const visitRate = 0.12, signupRate = 0.25, subRate = 0.18;
    const visit = Math.round(mktBuyers * visitRate);
    const signup = Math.round(visit * signupRate);
    const sub = Math.round(signup * subRate);
    return {
      assumed: true,
      steps: [
        { label: "마켓 구매(추정 신규)", value: mktBuyers },
        { label: "자사몰 방문(가정)", value: visit },
        { label: "자사몰 가입(가정)", value: signup },
        { label: "정기구독 전환(가정)", value: sub },
      ],
      rates: { visitRate, signupRate, subRate },
    };
  }

  // ---------- ④ 액션 센터 — 분석을 '할 일'로 ----------
  // 각 분석 결과를 "누구에게 · 무엇을 · 어떤 채널로 · 얼마 효과"의 실행 카드로 바꾼다.
  // 대상 인원은 실제 데이터에서 정확히 세고, 효과는 가정 반응률을 곱한 추정(가정 명시).
  function buildActions(k, rfmR, reorderR, basketR, ltvR) {
    const RATES = { remind: 0.30, care: 0.25, sub: 0.20, winback: 0.12, second: 0.30, cross: 0.08 };
    const aov = k.aov;

    // 세그먼트별 '비구독' 인원(액션 대상은 대개 아직 구독 안 한 고객)
    const nonSub = { champion: 0, loyal: 0, new: 0, atrisk: 0, dormant: 0 };
    for (const c of customers) {
      if (c.is_subscriber) continue;
      const row = rfmR.byCustomer.get(c.id);
      if (row) nonSub[row.segment]++;
    }
    const subUplift = Math.max(0, ltvR.sub.projLtv12 - ltvR.once.projLtv12); // 구독 전환 1인당 연매출 증분
    const subTarget = nonSub.champion + nonSub.loyal;
    const topBundle = basketR.bundles[0];

    const actions = [
      {
        id: "remind", priority: 1, icon: "⏰", title: "소진 임박 고객 리마인더",
        basis: `마지막 구매와 소진주기로 곧 떨어질 ${reorderR.due.length}명을 찾았습니다. 떨어지기 직전에 먼저 알리면 iHerb로 새기 전에 잡습니다.`,
        targetCount: reorderR.due.length, targetDesc: "비구독 · 소진 임박/경과",
        channel: "LINE · 이메일", assumption: `반응률 ${RATES.remind * 100}% 가정`,
        impact: Math.round(reorderR.recoverable * RATES.remind),
        actionLabel: "리마인더 보내기",
      },
      {
        id: "sub", priority: 1, icon: "🔁", title: "충성·우량 고객 구독 전환 제안",
        basis: `자주 사면서 아직 정기구독은 안 하는 ${subTarget}명. 구독 고객은 1인 연매출이 약 ${Math.round(subUplift).toLocaleString()}엔 더 높습니다(LTV 2배).`,
        targetCount: subTarget, targetDesc: "충성+우량 비구독",
        channel: "정기배송 제안", assumption: `수락률 ${RATES.sub * 100}% 가정`,
        impact: Math.round(subTarget * RATES.sub * subUplift),
        actionLabel: "구독 제안 보내기",
      },
      {
        id: "care", priority: 2, icon: "🛟", title: "이탈위험 고객 케어 쿠폰",
        basis: `잘 사다 조용해진 이탈위험 ${nonSub.atrisk}명. 지금이 마지막 방어 타이밍입니다.`,
        targetCount: nonSub.atrisk, targetDesc: "RFM 이탈위험 · 비구독",
        channel: "LINE · 쿠폰", assumption: `복귀율 ${RATES.care * 100}% 가정`,
        impact: Math.round(nonSub.atrisk * aov * RATES.care),
        actionLabel: "케어 쿠폰 발급",
      },
      {
        id: "second", priority: 2, icon: "🌱", title: "신규 고객 2차 구매 유도",
        basis: `막 들어온 신규 ${nonSub.new}명. 첫 재구매가 가장 어렵고, 뚫으면 LTV가 따라옵니다.`,
        targetCount: nonSub.new, targetDesc: "RFM 신규 · 비구독",
        channel: "첫구매 후 LINE 시퀀스", assumption: `2차 구매율 ${RATES.second * 100}% 가정`,
        impact: Math.round(nonSub.new * aov * RATES.second),
        actionLabel: "2차 유도 발송",
      },
      {
        id: "winback", priority: 3, icon: "📨", title: "휴면 고객 윈백 캠페인",
        basis: `오래전 사고 안 오는 휴면 ${nonSub.dormant}명. 강한 쿠폰으로 되살리기 대상입니다.`,
        targetCount: nonSub.dormant, targetDesc: "RFM 휴면 · 비구독",
        channel: "이메일 · 강한 쿠폰", assumption: `복귀율 ${RATES.winback * 100}% 가정`,
        impact: Math.round(nonSub.dormant * aov * RATES.winback),
        actionLabel: "윈백 발송",
      },
      {
        id: "cross", priority: 3, icon: "🧺", title: "추천 세트 크로스셀",
        basis: `함께 사는 조합으로 '${topBundle ? topBundle.name : "증상 세트"}' 같은 묶음을 상세페이지·장바구니에 노출해 객단가를 올립니다.`,
        targetCount: basketR.bundles.length, targetDesc: "증상 번들",
        channel: "상세페이지 · 장바구니", assumption: `크로스셀 ${RATES.cross * 100}% 가정`,
        impact: Math.round(k.orderCount * RATES.cross * (aov * 0.5)),
        actionLabel: "세트 노출 켜기",
      },
    ];
    actions.sort((a, b) => a.priority - b.priority || b.impact - a.impact);
    const totalImpact = actions.reduce((s, a) => s + a.impact, 0);
    return { actions, totalImpact, rates: RATES };
  }
}
