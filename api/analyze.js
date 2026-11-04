// Vercel serverless function: POST /api/analyze
// kind "analysis" returns the fit report; kind "cv" returns a full tailored CV as JSON.
// Keeps your Anthropic API key on the server, so it never reaches the browser.
//
// Environment variables (set in Vercel → Project → Settings → Environment Variables):
//   ANTHROPIC_API_KEY  required  your key from console.anthropic.com
//   ACCESS_CODE        optional  if set, visitors must enter this code to use AI (protects your credits)
//   ANTHROPIC_MODEL    optional  defaults to claude-sonnet-5-5

export const config = { maxDuration: 90 };

const MAX_CHARS = 12000;

function buildPrompt(cv, jd, title) {
  return `You are an honest career coach helping a junior analyst tailor her CV to one job posting.
Compare the CV and the job posting below. Never invent experience, tools, numbers or dates that are not in the CV. Rewrites may reword and reorder facts already in the CV and may use the employer's vocabulary only where the CV's facts support it; when a rewrite leans on an assumption, say so in "why".

Reply with ONLY a JSON object in this exact shape, no other text:
{
 "score": integer 0-100 (realistic overall fit, including experience level),
 "verdict": "2 sentences, plain English, should she apply and why",
 "requirements": [{"req": "short name of a requirement from the posting", "status": "strong"|"partial"|"gap", "evidence": "1 sentence citing her CV, or what is missing"}]  (8-12 items, cover the most important requirements),
 "bullets": [{"original": "the CV bullet, shortened with ... if long", "rewrite": "the tailored bullet, max 40 words", "why": "1 short sentence"}]  (the 4-5 CV bullets she should lead with, most relevant first),
 "summary": "a tailored 2-3 sentence professional summary built only from CV facts",
 "add_keywords": ["up to 8 terms from the posting she could add if true"],
 "watch_outs": ["2-4 honest risks or cautions"],
 "angle": "one sentence: the strongest angle for her cover letter"
}

JOB: ${title || "(untitled)"}
--- JOB POSTING ---
${jd}
--- CV ---
${cv}`;
}

function cvPrompt(cv, jd, title){
  return `You are an expert CV writer. Rewrite the CV below so it is tailored to the job posting, as a complete one-to-two page CV.

Strict rules:
- Use ONLY facts in the CV. Never invent employers, roles, dates, tools, numbers, certifications or responsibilities. Keep every job with its exact dates.
- You may reword bullets in the posting's vocabulary where the CV's facts support it, reorder bullets so the most relevant come first, reorder sections, reorder and regroup skills, and drop at most one or two weak bullets from older or less relevant roles.
- Most relevant role: at most 5 bullets. Each bullet starts with a strong past-tense verb, max 35 words, keeps its original numbers.
- Summary: 2-3 sentences, no first person, built only from CV facts.
- Keep the CV's spelling style (British or American).
- Do not include the person's name or contact details; the app adds them.

Reply with ONLY a JSON object in this exact shape:
{
 "headline": "short target title matching the posting, e.g. Junior Data Analyst",
 "summary": "...",
 "competencies": ["6-9 short competency phrases, most relevant first"],
 "experience": [{"role": "...", "org": "...", "location": "...", "dates": "...", "bullets": ["..."]}],
 "projects": [{"name": "...", "tools": "...", "text": "one sentence"}],
 "education": [{"degree": "...", "school": "...", "dates": "...", "details": "GPA, honours etc. or empty"}],
 "skills": [{"group": "...", "items": ["..."]}],
 "languages": "...",
 "leadership": ["..."],
 "section_order": ["summary","competencies","experience","projects","education","skills","leadership"] (reorder to suit the posting),
 "changes": ["3-6 short notes on what you changed and why"]
}

JOB: ${title || "(untitled)"}
--- JOB POSTING ---
${jd.slice(0, 12000)}
--- CV ---
${cv.slice(0, 12000)}`;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a !== -1 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({ code: "not_configured", error: "ANTHROPIC_API_KEY is not set" });
    return;
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const needed = process.env.ACCESS_CODE;
  if (needed && body.code !== needed) {
    res.status(401).json({ code: "bad_code" });
    return;
  }

  const cv = String(body.cv || "").trim();
  const jd = String(body.jd || "").trim();
  const title = String(body.title || "").slice(0, 200);
  const kind = body.kind === "cv" ? "cv" : "analysis";
  if (!cv || !jd) {
    res.status(400).json({ code: "invalid_request", error: "Both cv and jd are required" });
    return;
  }
  if (cv.length > MAX_CHARS || jd.length > MAX_CHARS) {
    res.status(413).json({ code: "prompt_too_large" });
    return;
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: kind === "cv" ? 4500 : 3000,
        messages: [{ role: "user", content: kind === "cv" ? cvPrompt(cv, jd, title) : buildPrompt(cv, jd, title) }],
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      const limited = r.status === 429;
      res.status(limited ? 429 : 502).json({
        code: limited ? "rate_limited" : "upstream_error",
        error: data?.error?.message,
      });
      return;
    }
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const result = parseJson(text);
    if (!result) {
      res.status(502).json({ code: "invalid_json" });
      return;
    }
    res.status(200).json({ result });
  } catch (e) {
    res.status(502).json({ code: "upstream_error", error: String(e?.message || e) });
  }
}
