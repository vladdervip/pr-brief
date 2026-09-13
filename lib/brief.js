function fileHints(files) {
  const paths = files.map((f) => f.filename.toLowerCase());
  const hints = [];
  if (paths.some((p) => /migration|schema|prisma|sql/.test(p))) {
    hints.push("есть изменения схемы/миграций — риск данных");
  }
  if (paths.some((p) => /(^|\/)(auth|permission|oauth|jwt)/.test(p))) {
    hints.push("затронут auth/permissions");
  }
  if (paths.some((p) => /(api|route|controller|handler)/.test(p))) {
    hints.push("меняются API/роуты — проверить контракт");
  }
  if (paths.some((p) => /(ui|component|page|view|css|style)/.test(p))) {
    hints.push("есть UI — проверить визуально");
  }
  if (paths.some((p) => /test|spec|e2e/.test(p))) {
    hints.push("есть тесты — плюс к уверенности");
  }
  return hints;
}

function verdict({ draft, additions, deletions, changedFiles, mergeableState }) {
  if (draft) {
    return { level: "блокеры", text: "Draft — на мерж не смотрим, пока не готово." };
  }
  if (mergeableState === "dirty") {
    return { level: "блокеры", text: "Конфликты с базой — сначала ребейз/мерж main." };
  }
  const churn = additions + deletions;
  if (changedFiles > 40 || churn > 2000) {
    return {
      level: "осторожно",
      text: "Большой дифф — разобрать по кускам, не мержить вслепую.",
    };
  }
  if (changedFiles > 15 || churn > 500) {
    return {
      level: "осторожно",
      text: "Средний объём — нужен быстрый продакт-просмотр и smoke.",
    };
  }
  return {
    level: "можно смотреть",
    text: "Компактный PR — можно быстро оценить и решать по мержу.",
  };
}

export function buildTemplateBrief(pr, files) {
  const additions = files.reduce((s, f) => s + (f.additions || 0), 0);
  const deletions = files.reduce((s, f) => s + (f.deletions || 0), 0);
  const changedFiles = files.length;
  const hints = fileHints(files);
  const v = verdict({
    draft: Boolean(pr.draft),
    additions,
    deletions,
    changedFiles,
    mergeableState: pr.mergeable_state,
  });

  const body = (pr.body || "").trim();
  const userFacing =
    body.slice(0, 400) ||
    `Автор описал мало. По названию: «${pr.title}». Смотри список файлов ниже.`;

  const topFiles = files
    .slice()
    .sort((a, b) => b.changes - a.changes)
    .slice(0, 8)
    .map((f) => `• ${f.filename} (+${f.additions}/-${f.deletions})`)
    .join("\n");

  return {
    title: pr.title,
    url: pr.html_url,
    author: pr.user?.login || "unknown",
    draft: Boolean(pr.draft),
    sections: {
      userImpact: userFacing,
      risk:
        hints.length > 0
          ? hints.map((h) => `• ${h}`).join("\n")
          : "Явных красных флагов по путям файлов нет — всё равно глянуть критичные сценарии.",
      size: `${changedFiles} файлов, +${additions} / -${deletions}\n\nТоп файлов:\n${topFiles || "—"}`,
      verdict: `${v.level.toUpperCase()}\n${v.text}`,
    },
    meta: {
      level: v.level,
      additions,
      deletions,
      changedFiles,
      mode: "template",
    },
  };
}

export async function enrichWithOpenAI(brief, pr, files) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return brief;

  const fileList = files
    .slice(0, 40)
    .map((f) => `${f.filename} (+${f.additions}/-${f.deletions})`)
    .join("\n");

  const prompt = `Ты помогаешь продакт-менеджеру. По данным PR напиши краткий бриф на русском, без воды.
Верни строго JSON с ключами: userImpact, risk, verdictNote (короткие абзацы или буллеты через \n).

Название: ${pr.title}
Описание: ${(pr.body || "").slice(0, 1500)}
Draft: ${pr.draft}
Файлы:\n${fileList}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Отвечай только валидным JSON." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);

  return {
    ...brief,
    sections: {
      ...brief.sections,
      userImpact: parsed.userImpact || brief.sections.userImpact,
      risk: parsed.risk || brief.sections.risk,
      verdict: parsed.verdictNote
        ? `${brief.meta.level.toUpperCase()}\n${parsed.verdictNote}`
        : brief.sections.verdict,
    },
    meta: { ...brief.meta, mode: "openai" },
  };
}
