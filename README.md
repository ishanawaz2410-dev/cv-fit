# CV Fit

Paste a job posting and see how well a CV matches it:

- **Keyword coverage**: an instant check against a dictionary of 40+ analyst skills, with the posting highlighted (yellow = in the CV, red underline = missing).
- **AI fit score**: Claude compares the CV and the posting requirement by requirement, then rewrites the most relevant bullets in the employer's language, without inventing experience.
- **Tailored CV**: Claude rewrites the whole CV for the posting (reordered sections, rewritten bullets, matching skills) and the app exports it as a one-page Word file.
- **History**: saved postings stay in the browser so roles can be compared.

Built by Fathima Isha Nawaz.

## How it works

| File | What it does |
|---|---|
| `index.html` | The whole front end: inputs, keyword engine, highlighting, results and Word export (docx library from a CDN). Plain HTML, CSS and JavaScript. |
| `api/analyze.js` | A Vercel serverless function. It builds the prompt and calls the Anthropic API, so the API key stays on the server. |

## Deploy your own

1. Push this folder to a GitHub repository.
2. In Vercel, choose **Add New → Project** and import the repository. No build settings are needed.
3. In **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY`: your key from console.anthropic.com (required)
   - `ACCESS_CODE`: any password you choose (recommended, so strangers can't spend your credits)
4. Redeploy. Open the site, paste a posting and tap **Get AI suggestions**. Enter your access code the first time.

The keyword check works without any API key.
