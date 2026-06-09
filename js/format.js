// 표시 포맷 — 통화(엔 1차 + 원 병기), 숫자, 퍼센트, 날짜.
// 환율은 부팅 시 meta.fx로 1회 주입한다(실데이터 교체 시 meta만 바꾸면 됨).

let FX = { usd_jpy: 155, jpy_krw: 9.4 };

export function setFx(fx) {
  if (fx) FX = fx;
}

export function yen(n) {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

export function won(n) {
  return "₩" + Math.round(n).toLocaleString("ko-KR");
}

// 엔 1차 + 원 병기. 큰 금액은 원을 축약(억/만).
export function yenWon(jpyAmount) {
  const krw = jpyAmount * FX.jpy_krw;
  return `${yen(jpyAmount)} <span class="sub-krw">(${wonCompact(krw)})</span>`;
}

export function wonCompact(krw) {
  const v = Math.round(krw);
  if (v >= 1e8) return "₩" + (v / 1e8).toFixed(1) + "억";
  if (v >= 1e4) return "₩" + Math.round(v / 1e4).toLocaleString("ko-KR") + "만";
  return won(v);
}

export function yenCompact(jpy) {
  const v = Math.round(jpy);
  if (v >= 1e8) return "¥" + (v / 1e8).toFixed(2) + "억";
  if (v >= 1e4) return "¥" + Math.round(v / 1e4).toLocaleString("ja-JP") + "만";
  return yen(v);
}

export function num(n) {
  return Math.round(n).toLocaleString("ko-KR");
}

export function pct(x, digits = 1) {
  return (x * 100).toFixed(digits) + "%";
}

export function signedPct(x, digits = 1) {
  const s = x >= 0 ? "+" : "";
  return s + (x * 100).toFixed(digits) + "%";
}

// "2026-06" → "26년 6월"
export function monthLabel(key) {
  const [y, m] = key.split("-");
  return `${y.slice(2)}년 ${parseInt(m, 10)}월`;
}

// "2026-06-09" → "2026.06.09"
export function dateLabel(iso) {
  return iso.replaceAll("-", ".");
}

export function daysLabel(d) {
  if (d < 0) return `${-d}일 지남`;
  if (d === 0) return "오늘";
  return `${d}일 남음`;
}
