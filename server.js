import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { Octokit } from "@octokit/rest";
import { parsePrRef } from "./lib/parsePr.js";
import { buildTemplateBrief, enrichWithOpenAI } from "./lib/brief.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    hasGithubToken: Boolean(process.env.GITHUB_TOKEN),
    hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
  });
});

app.post("/api/brief", async (req, res) => {
  try {
    if (!process.env.GITHUB_TOKEN) {
      return res.status(400).json({
        error: "Нет GITHUB_TOKEN в .env — без него GitHub API не отдаст PR.",
      });
    }

    const { owner, repo, number } = parsePrRef(req.body?.pr);
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    const [{ data: pr }, { data: files }] = await Promise.all([
      octokit.pulls.get({ owner, repo, pull_number: number }),
      octokit.pulls.listFiles({ owner, repo, pull_number: number, per_page: 100 }),
    ]);

    let brief = buildTemplateBrief(pr, files);
    try {
      brief = await enrichWithOpenAI(brief, pr, files);
    } catch (e) {
      brief = {
        ...brief,
        meta: {
          ...brief.meta,
          openaiError: String(e.message || e),
        },
      };
    }

    res.json(brief);
  } catch (e) {
    const status = e.status || 400;
    res.status(status).json({ error: e.message || String(e) });
  }
});

app.listen(port, () => {
  console.log(`PR Brief → http://localhost:${port}`);
});
