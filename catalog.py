# -*- coding: utf-8 -*-
"""
오플 재팬 데모 — 상품 카탈로그 (단일 진실 원천)

여기서 정의한 상품 정보가 데이터 생성(generate_data.py)과 화면 분석의 기준이 된다.
실제 베스트셀러 17종 기반. 가격은 브리프상 USD → 일본 소매가(JPY)로 환산해 저장한다.

핵심 필드
- unit_count : 1통에 든 수량(정/캡슐/소프트젤/구미/serving)
- daily_dose : 1일 권장 섭취량
- days_supply = floor(unit_count / daily_dose)  → 한 통으로 며칠 버티는가 = 재구매 주기의 뼈대
"""

import math

# --- 환율 / 마진 (meta.json 으로도 내보내 화면에서 교체 가능) -----------------
USD_JPY = 155          # 1달러 = 155엔
JPY_KRW = 9.4          # 1엔 = 9.4원
RETAIL_MARGIN = 1.55   # 직구 편집샵 소매 마진계수 (수입원가 + 운영마진)

# 카테고리(증상/대상) 코드 → 한국어 라벨
CATEGORIES = {
    "joint":  "관절",
    "eye":    "눈",
    "gut":    "장",
    "bone":   "뼈",
    "beauty": "미용",
    "multi":  "멀티",
    "etc":    "기타",
}

# --- 상품 원본 정의 ----------------------------------------------------------
# (id, 브랜드, 한국어명, 카테고리, USD가, 단위수량, 단위명, 1일섭취, 구독가능)
_RAW = [
    ("msm",          "닥터스 베스트",   "MSM 1500mg 120정",                  "joint",   9.59, 120, "정",     2, True),
    ("glucosamine",  "솔가",            "글루코사민 히알루론산 콘드로이친 MSM 120정", "joint", 28.99, 120, "정",   2, True),
    ("boswellia",    "스완슨",          "보스웰리아 60캡",                    "joint",   5.99,  60, "캡",     1, True),
    ("greenmussel",  "스완슨",          "초록입홍합 500mg 60캡",              "joint",   6.82,  60, "캡",     1, True),

    ("lutein",       "나우푸드",        "루테인&지아잔틴 60소프트젤",          "eye",    14.99,  60, "소프트젤", 1, True),
    ("omega3",       "나우푸드",        "울트라 오메가3 180소프트젤",          "eye",    25.99, 180, "소프트젤", 2, True),
    ("astaxanthin",  "솔가",            "아스타잔틴 60소프트젤",               "eye",    16.99,  60, "소프트젤", 1, True),

    ("jarrow_eps",   "자로우",          "자로우도피러스 EPS 유산균 120캡",     "gut",    29.99, 120, "캡",     1, True),
    ("healthy_pro",  "헬시오리진",      "프로바이오틱 300억 150캡",            "gut",    39.99, 150, "캡",     1, True),
    ("zenwise",      "젠와이즈",        "소화효소+프로바이오틱 180캡",         "gut",    29.99, 180, "캡",     2, True),

    ("calmagzinc",   "21세기",          "칼슘마그네슘아연+D3 90정",            "bone",    5.29,  90, "정",     3, True),
    ("d3mk7",        "나우푸드",        "메가 D3&MK-7 5000IU 120캡",          "bone",   18.29, 120, "캡",     1, True),
    ("calmag",       "나우푸드",        "칼슘&마그네슘 250정",                "bone",   16.99, 250, "정",     2, True),

    ("multigummy",   "센트룸",          "우먼/맨 멀티구미 90정",               "multi",  19.99,  90, "구미",   2, True),
    ("collagen",     "닥터스 베스트",   "콜라겐 1&3 파우더 200g",             "beauty", 10.99,  30, "회",     1, True),
    ("biotin",       "컨트리라이프",    "비오틴 맥시헤어 90정",               "beauty", 15.99,  90, "정",     1, True),
    ("ps300",        "더블우드",        "포스파티딜세린 300mg 120캡",         "etc",    14.29, 120, "캡",     1, True),
]

# --- 증상/대상별 묶음(번들) 정의 --------------------------------------------
# 화면의 "상품 구성 분석"과 데이터 생성의 동시구매 경향에 함께 쓰인다.
BUNDLES = [
    {"id": "joint",  "name": "관절 케어 세트",  "category": "joint",  "products": ["msm", "glucosamine", "boswellia"]},
    {"id": "eye",    "name": "눈 건강 세트",    "category": "eye",    "products": ["lutein", "omega3", "astaxanthin"]},
    {"id": "gut",    "name": "장 건강 세트",    "category": "gut",    "products": ["jarrow_eps", "zenwise"]},
    {"id": "bone",   "name": "뼈 튼튼 세트",    "category": "bone",   "products": ["calmagzinc", "d3mk7"]},
    {"id": "beauty", "name": "이너뷰티 세트",   "category": "beauty", "products": ["collagen", "biotin"]},
]


def _price_jpy(usd):
    """USD 원가 → 일본 소매가(JPY). 10엔 단위 반올림으로 가격다운 숫자."""
    raw = usd * USD_JPY * RETAIL_MARGIN
    return int(round(raw / 10.0) * 10)


def build_products():
    """카탈로그를 화면/데이터가 쓰는 완성 형태(dict 리스트)로 만든다."""
    products = []
    for pid, brand, name, cat, usd, count, unit, dose, sub in _RAW:
        price_jpy = _price_jpy(usd)
        products.append({
            "id": pid,
            "brand": brand,
            "name_ko": name,
            "category": cat,
            "category_label": CATEGORIES[cat],
            "price_usd": usd,
            "price_jpy": price_jpy,
            "price_krw": int(round(price_jpy * JPY_KRW / 10.0) * 10),
            "unit_count": count,
            "unit_label": unit,
            "daily_dose": dose,
            "days_supply": math.floor(count / dose),   # 한 통 소진 일수
            "subscribable": sub,
        })
    return products


def products_by_id():
    return {p["id"]: p for p in build_products()}


if __name__ == "__main__":
    # 빠른 점검: 소진일수 분포를 눈으로 확인
    for p in build_products():
        print(f"{p['id']:14s} {p['category_label']:3s} "
              f"¥{p['price_jpy']:>6,}  {p['unit_count']:>3}{p['unit_label']}/{p['daily_dose']}일분 "
              f"→ {p['days_supply']:>3}일")
