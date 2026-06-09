// 화면 조각 빌더 — 뷰들이 공통으로 쓰는 HTML 생성 헬퍼.

export function viewHead(title, desc) {
  return `<div class="view-head"><h1>${title}</h1><p>${desc}</p></div>`;
}

export function sectionTitle(title, desc = "", badge = "") {
  return `<div class="section-title">${title}${badge ? ` <span class="badge chip chip-soft">${badge}</span>` : ""}</div>
          ${desc ? `<p class="section-desc">${desc}</p>` : ""}`;
}

// 이커머스 비경험자용 "이게 왜 매출인가" 토글
export function explain(text) {
  return `<details class="explain"><summary></summary><p>${text}</p></details>`;
}

export function kpi({ label, value, foot = "", accent = false }) {
  return `<div class="card kpi ${accent ? "kpi-accent" : ""}">
    <div class="kpi-label">${label}</div>
    <div class="kpi-value">${value}</div>
    ${foot ? `<div class="kpi-foot">${foot}</div>` : ""}
  </div>`;
}

export function card(title, sub, bodyHtml, extraClass = "") {
  return `<div class="card ${extraClass}">
    ${title ? `<div class="card-title">${title}</div>` : ""}
    ${sub ? `<div class="card-sub">${sub}</div>` : ""}
    ${bodyHtml}
  </div>`;
}

export function chartBox(id, cls = "") {
  return `<div id="${id}" class="chart ${cls}"></div>`;
}

export function note(text, variant = "") {
  return `<div class="note ${variant}"><span class="nm">메모</span><span>${text}</span></div>`;
}

export function table(headers, rows, aligns = []) {
  const th = headers.map((h) => `<th>${h}</th>`).join("");
  const tr = rows
    .map((r) => "<tr>" + r.map((c) => `<td>${c}</td>`).join("") + "</tr>")
    .join("");
  return `<table class="tbl"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

export function dot(color) {
  return `<span class="dot" style="background:${color}"></span>`;
}

// ---------- 모달 / 토스트 (액션 실행 데모) ----------
export function modal(titleHtml, bodyHtml) {
  closeModal();
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.id = "modal-backdrop";
  wrap.innerHTML = `<div class="modal-card" role="dialog">
    <button class="modal-x" aria-label="닫기">×</button>
    <div class="modal-title">${titleHtml}</div>
    <div class="modal-body">${bodyHtml}</div>
  </div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener("click", (e) => { if (e.target === wrap) closeModal(); });
  wrap.querySelector(".modal-x").addEventListener("click", closeModal);
  document.addEventListener("keydown", escClose);
}

function escClose(e) { if (e.key === "Escape") closeModal(); }

export function closeModal() {
  const m = document.getElementById("modal-backdrop");
  if (m) m.remove();
  document.removeEventListener("keydown", escClose);
}

export function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast"; t.className = "toast";
    document.body.appendChild(t);
  }
  t.innerHTML = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2600);
}
