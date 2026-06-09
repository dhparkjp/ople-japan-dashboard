// ④ 액션 센터 — 분석을 '할 일'로 바꾼다.
// "누구에게 · 무엇을 · 어떤 채널로 · 얼마 효과"의 실행 카드. 버튼은 데모 시뮬레이션.

import * as ui from "../ui.js";
import * as fmt from "../format.js";

const executed = new Set();

export function render(root, ctx) {
  const A = ctx.analytics;
  const acts = A.actions.actions;

  root.innerHTML = `
    ${ui.viewHead("④ 액션 센터 — 데이터가 시키는 오늘의 할 일",
      "위 화면들이 찾아낸 것을 '바로 실행할 수 있는 일'로 정리했다. 분석은 결국 행동으로 이어져야 매출이 된다.")}

    <div class="action-banner">
      <div>
        <div class="lbl">데이터가 찾아낸 실행 가능한 액션</div>
        <div class="big">${acts.length}건</div>
      </div>
      <div class="right">
        <div class="lbl">모두 실행 시 기대 추가 매출(연, 추정)</div>
        <div class="big">+${fmt.yenCompact(A.actions.totalImpact)}
          <span style="font-size:14px;opacity:.85">(${fmt.wonCompact(A.actions.totalImpact * 9.4)})</span></div>
      </div>
    </div>

    ${ui.note("버튼은 <b>데모 시뮬레이션</b>이다(실제 발송·쿠폰 없음). 효과는 가정 반응률을 곱한 추정치다. 실서비스에선 일본 채널은 <b>LINE 공식계정</b>, 건기식 문구는 <b>薬機法</b> 검수, 마켓 고객 유인은 <b>ToS 제한</b>을 함께 고려한다.", "blue")}

    <div class="grid" style="margin-top:18px;gap:14px">
      ${acts.map(actionCard).join("")}
    </div>
  `;

  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const id = btn.dataset.act;
    const action = acts.find((a) => a.id === id);
    if (action) openExecuteModal(action);
  });
}

function actionCard(a) {
  const done = executed.has(a.id);
  return `<div class="action-card ${done ? "a-done" : ""}" id="card-${a.id}">
    <div class="ico">${a.icon}</div>
    <div>
      <div class="a-title"><span class="prio prio-${a.priority}">${prioLabel(a.priority)}</span> ${a.title}</div>
      <div class="a-basis">${a.basis}</div>
      <div class="a-meta">
        <span class="chip chip-soft">대상 ${fmt.num(a.targetCount)}${a.id === "cross" ? "종" : "명"} · ${a.targetDesc}</span>
        <span class="chip chip-soft">채널 ${a.channel}</span>
        <span class="chip chip-soft">${a.assumption}</span>
      </div>
    </div>
    <div class="a-right">
      <div class="a-impact-lbl">기대 추가 매출(연)</div>
      <div class="a-impact">+${fmt.yenCompact(a.impact)}</div>
      <button class="btn btn-primary" data-act="${a.id}">${done ? "실행됨 ✓" : a.actionLabel}</button>
    </div>
  </div>`;
}

function prioLabel(p) {
  return p === 1 ? "최우선" : p === 2 ? "권장" : "여유";
}

function openExecuteModal(a) {
  const body = `
    <div class="big-impact">
      <div class="muted" style="font-size:12px">발송 대상</div>
      <div class="n" style="color:var(--ink)">${fmt.num(a.targetCount)}${a.id === "cross" ? "종 세트" : "명"}</div>
    </div>
    <div class="row"><span class="k">채널</span><span class="v">${a.channel}</span></div>
    <div class="row"><span class="k">근거</span><span class="v" style="max-width:60%;text-align:right;font-weight:600">${a.targetDesc}</span></div>
    <div class="row"><span class="k">${a.assumption}</span><span class="v">기대 +${fmt.yenCompact(a.impact)} / 연</span></div>
    <div class="note blue" style="margin-top:14px">
      <span class="nm">데모</span>
      <span>실제로는 여기서 ${a.channel}로 ${fmt.num(a.targetCount)}${a.id === "cross" ? "종 세트를 노출" : "명에게 발송"}합니다. 지금은 시연용이라 실제 전송은 하지 않습니다.</span>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
      <button class="btn" id="modal-cancel">취소</button>
      <button class="btn btn-primary" id="modal-go">${a.actionLabel} 실행</button>
    </div>`;
  ui.modal(`${a.icon} ${a.title}`, body);
  document.getElementById("modal-cancel").addEventListener("click", ui.closeModal);
  document.getElementById("modal-go").addEventListener("click", () => {
    executed.add(a.id);
    ui.closeModal();
    const card = document.getElementById(`card-${a.id}`);
    if (card) {
      card.classList.add("a-done");
      card.querySelector("[data-act]").textContent = "실행됨 ✓";
    }
    ui.toast(`${a.title} — ${fmt.num(a.targetCount)}${a.id === "cross" ? "종" : "명"} 발송 시뮬레이션 완료 · 기대 +${fmt.yenCompact(a.impact)}`);
  });
}
