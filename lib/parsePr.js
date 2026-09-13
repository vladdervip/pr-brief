/**
 * Parse GitHub PR URL or shorthand into owner/repo/number.
 * Accepts:
 * - https://github.com/owner/repo/pull/123
 * - owner/repo#123
 * - owner/repo/pull/123
 */
export function parsePrRef(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Пустая ссылка на PR");

  const urlMatch = raw.match(
    /github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i
  );
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2], number: Number(urlMatch[3]) };
  }

  const shortMatch = raw.match(/^([^/\s#]+)\/([^/\s#]+)(?:#|\/pull\/)(\d+)$/i);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      number: Number(shortMatch[3]),
    };
  }

  throw new Error("Не понял ссылку. Пример: https://github.com/owner/repo/pull/1 или owner/repo#1");
}
