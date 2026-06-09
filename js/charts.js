// ECharts 공통 래퍼 — 색/폰트/여백을 한 곳에서 표준화한다.
// echarts 는 index.html 의 <script>로 전역 로드된다(window.echarts).

export const COLORS = {
  own: "#2f6df0",
  rakuten: "#d6455d",
  amazon: "#e8893b",
  qoo10: "#13a89e",
  ink: "#1f2530",
  grid: "#eef1f6",
  axis: "#8a93a3",
  series: ["#2f6df0", "#13a89e", "#7a5af5", "#e8893b", "#d6455d", "#9aa3b2"],
};

const BASE_TEXT = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Kaku Gothic ProN", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  color: "#3a4250",
};

const charts = new Set();

export function makeChart(el, option) {
  const c = window.echarts.init(el, null, { renderer: "canvas" });
  c.setOption({
    textStyle: BASE_TEXT,
    color: COLORS.series,
    animationDuration: 420,
    ...option,
  });
  charts.add(c);
  return c;
}

// 화면 전환·리사이즈 시 모든 차트 크기 재계산
export function resizeAll() {
  for (const c of charts) c.resize();
}
window.addEventListener("resize", resizeAll);

export function tooltipMoney(fmt) {
  return {
    trigger: "axis",
    valueFormatter: (v) => fmt(v),
    axisPointer: { type: "shadow" },
  };
}
