const form = document.getElementById("form");
const input = document.getElementById("pr");
const go = document.getElementById("go");
const status = document.getElementById("status");
const out = document.getElementById("out");

function badgeClass(level) {
  if (level === "можно смотреть") return "ok";
  if (level === "осторожно") return "warn";
  return "bad";
}

function showStatus(text, show = true) {
  status.hidden = !show;
  status.textContent = text || "";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  out.hidden = true;
  go.disabled = true;
  showStatus("Собираю бриф…");

  try {
    const res = await fetch("/api/brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pr: input.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ошибка");

    const level = data.meta?.level || "";
    out.innerHTML = `
      <div class="badge ${badgeClass(level)}">${level || "бриф"}</div>
      <h2>${escapeHtml(data.title)}</h2>
      <p class="meta">
        <a href="${escapeAttr(data.url)}" target="_blank" rel="noopener">${escapeHtml(data.url)}</a>
        · ${escapeHtml(data.author)}
        · режим: ${escapeHtml(data.meta?.mode || "?")}
        ${data.draft ? " · draft" : ""}
      </p>
      ${section("Что меняется для пользователя", data.sections.userImpact)}
      ${section("Риск / что может сломаться", data.sections.risk)}
      ${section("Объём изменений", data.sections.size)}
      ${section("Вердикт", data.sections.verdict)}
    `;
    out.hidden = false;
    showStatus("", false);
  } catch (err) {
    showStatus(err.message || String(err));
  } finally {
    go.disabled = false;
  }
});

function section(title, body) {
  return `<div class="section"><h3>${escapeHtml(title)}</h3><pre>${escapeHtml(body || "—")}</pre></div>`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(s) {
  return escapeHtml(s).replaceAll('"', "&quot;");
}
