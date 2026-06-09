# -*- coding: utf-8 -*-
"""
오플 재팬 데모 — 가상 데이터 생성기

목표: 실제처럼 보이는 18개월치 주문 이력을 만들어
      RFM·코호트·1→2전환·소진주기·구독·이탈 분포가 "저절로" 나오게 한다.

설계
- 자사몰 고객마다 행동 유형(1회성/재구매/구독/충성)을 부여하고,
  상품 소진주기(days_supply)를 따라 재구매를 시뮬레이션한다.
  매 재구매 시점마다 이탈 확률(=iHerb로 떠남)을 굴려 자연스러운 휴면/이탈을 만든다.
- 마켓플레이스(라쿠텐/아마존/큐텐)는 채널별 독립 주문 스트림(익명, customer_id 없음).
  → "마켓에선 고객 추적 불가"라는 현실을 데이터 구조로 반영.

실행: python3 generate_data.py  → data/*.json 생성 + 요약 통계 출력
"""

import json
import math
import os
import random
from datetime import date, timedelta

import catalog

# ---------------------------------------------------------------------------
SEED = 20260609
random.seed(SEED)

TODAY = date(2026, 6, 9)
START = date(2024, 12, 1)            # 18개월 전
WINDOW_DAYS = (TODAY - START).days

N_CUSTOMERS = 1500

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

PRODUCTS = catalog.build_products()
PROD_BY_ID = {p["id"]: p for p in PRODUCTS}
BUNDLES = catalog.BUNDLES
BUNDLE_BY_ID = {b["id"]: b for b in BUNDLES}

REGIONS = ["도쿄", "오사카", "가나가와", "아이치", "사이타마", "지바",
           "효고", "후쿠오카", "홋카이도", "교토"]
ACQ_CHANNELS = ["검색", "오가닉", "SNS", "추천", "광고"]
ACQ_WEIGHTS = [0.34, 0.22, 0.20, 0.12, 0.12]

# 고객 행동 유형 (RFM 분포가 사실적이도록 설계)
ARCHETYPES = ["one_and_done", "repeater", "subscriber", "loyal"]
ARCH_WEIGHTS = [0.34, 0.38, 0.16, 0.12]

# 첫 구매에서 고를 1차 니즈(카테고리) 가중치
NEED_CATS = ["joint", "eye", "gut", "bone", "beauty", "multi", "etc"]
NEED_WEIGHTS = [0.22, 0.18, 0.16, 0.14, 0.12, 0.10, 0.08]

# 마켓플레이스 채널 설정: 일평균 기준 주문수, 성장계수, 가격계수, 상품선호
MARKETPLACES = {
    "rakuten": {"base": 9.0,  "growth": 1.9, "price": 1.03, "prefer": ["beauty", "multi", "eye"]},
    "amazon":  {"base": 7.0,  "growth": 2.3, "price": 0.98, "prefer": ["joint", "gut", "bone"]},
    "qoo10":   {"base": 4.0,  "growth": 1.6, "price": 0.95, "prefer": ["beauty", "etc", "eye"]},
}
CHANNEL_LABEL = {"own": "자사몰", "rakuten": "라쿠텐", "amazon": "아마존", "qoo10": "큐텐"}


# --- 보조 함수 --------------------------------------------------------------
def month_key(d):
    return f"{d.year:04d}-{d.month:02d}"


def sub_interval(days_supply):
    """소진일수 → 가장 가까운 표준 구독 주기(30/60/90/120/150일)."""
    options = [30, 60, 90, 120, 150]
    return min(options, key=lambda x: abs(x - days_supply))


def pick_products_for_need(cat, basket_min=1, basket_max=3):
    """1차 니즈 카테고리에 맞춰 장바구니 구성(번들 기반 + 약간의 변주)."""
    if cat in BUNDLE_BY_ID:
        pool = list(BUNDLE_BY_ID[cat]["products"])
    else:
        pool = [p["id"] for p in PRODUCTS if p["category"] == cat] or [p["id"] for p in PRODUCTS]
    random.shuffle(pool)
    n = random.randint(basket_min, min(basket_max, len(pool)))
    items = pool[:n]
    # 가끔 멀티/콜라겐 같은 교차구매가 끼어든다(현실적인 장바구니)
    if random.random() < 0.18:
        extra = random.choice(["multigummy", "collagen", "omega3", "d3mk7"])
        if extra not in items:
            items.append(extra)
    return items


# --- 고객 + 자사몰 주문 생성 ------------------------------------------------
def gen_customers_and_own_orders():
    customers = []
    orders = []
    subscriptions = []
    oid = 0
    sid = 0

    for i in range(N_CUSTOMERS):
        cid = f"c_{i+1:04d}"
        # 가입일: 최근일수록 약간 더 많이(성장) — 제곱 가중으로 후반 집중
        r = random.random() ** 0.75
        signup = START + timedelta(days=int(r * WINDOW_DAYS))
        archetype = random.choices(ARCHETYPES, ARCH_WEIGHTS)[0]
        acq = random.choices(ACQ_CHANNELS, ACQ_WEIGHTS)[0]

        need = random.choices(NEED_CATS, NEED_WEIGHTS)[0]
        is_subscriber = False

        # --- 1차 주문 ---
        first_items = pick_products_for_need(need)
        oid += 1
        orders.append(_make_own_order(oid, cid, signup, first_items, is_sub=False))

        # 핵심 재구매 상품(소진주기 기준이 될 대표 상품)
        core_pid = first_items[0]
        last_date = signup

        # --- 유형별 재구매 시뮬레이션 ---
        if archetype == "one_and_done":
            # 대부분 1회로 끝(가끔 1번 더)
            if random.random() < 0.12:
                gap = int(PROD_BY_ID[core_pid]["days_supply"] * random.uniform(0.9, 1.4))
                nd = last_date + timedelta(days=gap)
                if nd <= TODAY:
                    oid += 1
                    orders.append(_make_own_order(oid, cid, nd, [core_pid], is_sub=False))

        elif archetype in ("repeater", "loyal"):
            keep = 0.72 if archetype == "repeater" else 0.90
            basket_extra = 0.15 if archetype == "repeater" else 0.40
            while True:
                if random.random() > keep:        # 이탈(iHerb로 떠남)
                    break
                supply = PROD_BY_ID[core_pid]["days_supply"]
                gap = int(supply * random.uniform(0.85, 1.25))
                nd = last_date + timedelta(days=gap)
                if nd > TODAY:
                    break
                items = [core_pid]
                if random.random() < basket_extra:  # 교차구매로 바구니 확장
                    items = pick_products_for_need(need, 1, 3)
                    if core_pid not in items:
                        items.append(core_pid)
                oid += 1
                orders.append(_make_own_order(oid, cid, nd, items, is_sub=False))
                last_date = nd
            # 충성 고객 일부는 후반에 구독 전환
            if archetype == "loyal" and random.random() < 0.45:
                is_subscriber, sid, last_date = _start_subscription(
                    cid, core_pid, last_date, orders, subscriptions, sid, oid)
                oid = _OID_HOLDER[0]

        elif archetype == "subscriber":
            # 1~2회 일반 구매 후 구독 전환
            warmups = random.randint(1, 2)
            for _ in range(warmups - 1):
                supply = PROD_BY_ID[core_pid]["days_supply"]
                gap = int(supply * random.uniform(0.85, 1.2))
                nd = last_date + timedelta(days=gap)
                if nd > TODAY:
                    break
                oid += 1
                orders.append(_make_own_order(oid, cid, nd, [core_pid], is_sub=False))
                last_date = nd
            is_subscriber, sid, last_date = _start_subscription(
                cid, core_pid, last_date, orders, subscriptions, sid, oid)
            oid = _OID_HOLDER[0]

        customers.append({
            "id": cid,
            "signup_date": signup.isoformat(),
            "email": f"user{i+1:04d}@example.com",
            "region": random.choice(REGIONS),
            "acquisition_channel": acq,
            "is_subscriber": is_subscriber,
        })

    return customers, orders, subscriptions


# 구독 생성은 oid를 늘려야 해서 작은 홀더로 상태 공유
_OID_HOLDER = [0]


def _start_subscription(cid, core_pid, last_date, orders, subscriptions, sid, oid):
    """대표 상품으로 구독 시작 → 주기마다 구독 주문을 today까지 생성."""
    prod = PROD_BY_ID[core_pid]
    interval = sub_interval(prod["days_supply"])
    start = last_date + timedelta(days=int(prod["days_supply"] * random.uniform(0.8, 1.1)))
    sid += 1
    sub_status = "active"
    nd = start
    placed_any = False
    retention = 0.95
    while nd <= TODAY:
        if placed_any and random.random() > retention:   # 드물게 구독 해지
            sub_status = "cancelled"
            break
        oid += 1
        orders.append(_make_own_order(oid, cid, nd, [core_pid], is_sub=True))
        placed_any = True
        last_date = nd
        nd = nd + timedelta(days=interval)
    subscriptions.append({
        "id": f"s_{sid:04d}",
        "customer_id": cid,
        "product_id": core_pid,
        "interval_days": interval,
        "start_date": start.isoformat(),
        "status": sub_status,
    })
    _OID_HOLDER[0] = oid
    return (sub_status == "active"), sid, last_date


def _make_own_order(oid, cid, d, item_ids, is_sub):
    items = []
    total = 0
    for pid in item_ids:
        qty = 1 if random.random() < 0.82 else 2
        unit = PROD_BY_ID[pid]["price_jpy"]
        items.append({"product_id": pid, "qty": qty, "unit_price_jpy": unit})
        total += unit * qty
    _OID_HOLDER[0] = oid
    return {
        "id": f"o_own_{oid:05d}",
        "channel": "own",
        "order_date": d.isoformat(),
        "customer_id": cid,
        "items": items,
        "order_total_jpy": total,
        "is_subscription_order": is_sub,
    }


# --- 마켓플레이스 주문 생성 (익명) ------------------------------------------
def gen_marketplace_orders(start_oid):
    orders = []
    oid = start_oid
    for ch, cfg in MARKETPLACES.items():
        prefer = set(cfg["prefer"])
        # 상품별 채널 가중치: 선호 카테고리는 가중↑
        weighted = []
        for p in PRODUCTS:
            w = 3.0 if p["category"] in prefer else 1.0
            weighted.append((p["id"], w))
        pids = [x[0] for x in weighted]
        wts = [x[1] for x in weighted]

        for day in range(WINDOW_DAYS + 1):
            d = START + timedelta(days=day)
            progress = day / WINDOW_DAYS
            # 성장 추세 + 주말 약간 상승 + 노이즈
            lam = cfg["base"] * (1 + (cfg["growth"] - 1) * progress)
            if d.weekday() >= 5:
                lam *= 1.15
            lam *= random.uniform(0.8, 1.2)
            n_orders = max(0, int(round(random.gauss(lam, lam ** 0.5))))
            for _ in range(n_orders):
                k = 1 if random.random() < 0.7 else 2
                chosen = random.choices(pids, wts, k=k)
                chosen = list(dict.fromkeys(chosen))  # 중복 제거
                items = []
                total = 0
                for pid in chosen:
                    qty = 1 if random.random() < 0.85 else 2
                    unit = int(round(PROD_BY_ID[pid]["price_jpy"] * cfg["price"] / 10.0) * 10)
                    items.append({"product_id": pid, "qty": qty, "unit_price_jpy": unit})
                    total += unit * qty
                oid += 1
                orders.append({
                    "id": f"o_mkt_{oid:06d}",
                    "channel": ch,
                    "order_date": d.isoformat(),
                    "customer_id": None,          # ★ 마켓은 고객 연결 없음
                    "items": items,
                    "order_total_jpy": total,
                    "is_subscription_order": False,
                })
    return orders


# --- 메인 -------------------------------------------------------------------
def main():
    customers, own_orders, subscriptions = gen_customers_and_own_orders()
    mkt_orders = gen_marketplace_orders(start_oid=0)
    all_orders = own_orders + mkt_orders
    all_orders.sort(key=lambda o: o["order_date"])

    meta = {
        "generated_for": "오플 재팬 — 고객 인텔리전스 & 멀티채널 통합 대시보드 (데모)",
        "seed": SEED,
        "today": TODAY.isoformat(),
        "period_start": START.isoformat(),
        "period_end": TODAY.isoformat(),
        "fx": {"usd_jpy": catalog.USD_JPY, "jpy_krw": catalog.JPY_KRW},
        "channels": CHANNEL_LABEL,
        "categories": catalog.CATEGORIES,
        "bundles": BUNDLES,
        "counts": {
            "customers": len(customers),
            "own_orders": len(own_orders),
            "marketplace_orders": len(mkt_orders),
            "subscriptions": len(subscriptions),
        },
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    _write("products.json", PRODUCTS)
    _write("customers.json", customers)
    _write("orders.json", all_orders)
    _write("subscriptions.json", subscriptions)
    _write("meta.json", meta)

    _print_summary(customers, own_orders, mkt_orders, subscriptions)


def _write(name, obj):
    path = os.path.join(DATA_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(path) / 1024
    print(f"  wrote {name:20s} {size:8.1f} KB")


def _print_summary(customers, own_orders, mkt_orders, subs):
    from collections import Counter, defaultdict
    print("\n=== 요약 통계 (사실성 점검) ===")
    print(f"고객 {len(customers):,}명 / 자사몰 주문 {len(own_orders):,} / "
          f"마켓 주문 {len(mkt_orders):,} / 구독 {len(subs):,}")

    # 고객별 주문수
    oc = defaultdict(int)
    last = {}
    for o in own_orders:
        oc[o["customer_id"]] += 1
        d = date.fromisoformat(o["order_date"])
        if o["customer_id"] not in last or d > last[o["customer_id"]]:
            last[o["customer_id"]] = d
    with1 = sum(1 for c in customers if oc[c["id"]] >= 1)
    with2 = sum(1 for c in customers if oc[c["id"]] >= 2)
    print(f"1→2 전환율(2차 구매율): {with2/with1*100:4.1f}%  "
          f"(평균 주문 {sum(oc.values())/len(customers):.2f}회/인)")

    n_sub = sum(1 for c in customers if c["is_subscriber"])
    print(f"활성 구독 고객: {n_sub:,}명 ({n_sub/len(customers)*100:.1f}%)")

    # Recency 분포로 휴면/이탈 가늠
    rec = [ (TODAY - last[c["id"]]).days for c in customers ]
    dormant = sum(1 for x in rec if x > 120)
    churnrisk = sum(1 for x in rec if 60 < x <= 120)
    print(f"최근구매 60일 이내 활성: {sum(1 for x in rec if x<=60):,} / "
          f"이탈위험(60~120일): {churnrisk:,} / 휴면(120일+): {dormant:,}")

    # 매출
    own_rev = sum(o["order_total_jpy"] for o in own_orders)
    mkt_rev = sum(o["order_total_jpy"] for o in mkt_orders)
    sub_rev = sum(o["order_total_jpy"] for o in own_orders if o["is_subscription_order"])
    print(f"자사몰 매출 ¥{own_rev:,} (구독 비중 {sub_rev/own_rev*100:.1f}%) / "
          f"마켓 매출 ¥{mkt_rev:,}")
    print(f"전체 매출 ¥{own_rev+mkt_rev:,}  (≈ ₩{int((own_rev+mkt_rev)*catalog.JPY_KRW):,})")


if __name__ == "__main__":
    main()
