# Education & Skills AI

AI assistants for learners, teachers and job seekers in Africa, powered by the OpenAI API.

| Assistant | What it does |
|---|---|
| 📚 **Exam Tutor** | A personal tutor aligned to local curricula: WAEC/WASSCE, NECO, JAMB UTME, BECE, WAEC Liberia, NPSE, KCSE, IGCSE. It can guide step by step (Socratic) or explain fully. It explains in English, Pidgin, Krio, Yoruba, Hausa, Igbo, Twi, Swahili or French. Students can photograph a question. **Tools:** study plan, revision notes, examiner-style marking. **Practice quiz:** exam-style multiple-choice questions, marked automatically, with explanations and a list of topics to revise. |
| 🧑‍🏫 **Teacher Assistant** | Cuts paperwork. It writes lesson notes in the standard school format, termly schemes of work, tests with marking schemes, and marking and feedback on student work. It also writes report-card comments for a whole class and letters to parents. It assumes large classes and few resources. |
| 💼 **Career Coach** | Job-skills coaching: CV review and rewrite, cover letters, skills roadmaps with free resources, and interview question banks. In chat it runs mock interviews one question at a time. |
| ✈️ **Study Abroad** | Guidance on choosing countries and programmes, application timelines, scholarships, student visas and proof of funds, and personal statement / SOP review. It warns about fraud and points students to official sources. It also points students to **TIH** advisors for hands-on help. |

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env      # then put your OpenAI key in .env
npm start                 # http://localhost:3000
```

### Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | — (required) | Your OpenAI key. It stays on the server and is never sent to the browser. |
| `OPENAI_MODEL` | `gpt-5-mini` | Any model your key can use with the Responses API. For the tutor's photo feature, choose a model that accepts images. |
| `PORT` | `3000` | HTTP port. |
| `APP_ACCESS_CODE` | empty | If set, users must enter this code before using the app. **Set it before putting the app on the internet**, because every request is billed to your OpenAI account. |
| `RATE_LIMIT_PER_MINUTE` | `20` | AI requests allowed per IP per minute (`0` disables the limit). |
| `ORG_NAME` | `TIH` | Organisation named in the study-abroad assistant. |
| `ORG_CONTACT_URL` | empty | Link for the "Talk to an advisor" button in the study-abroad assistant. |

## How it works

```
public/            Browser app (plain HTML/CSS/JS, no build step)
src/server.js      Entry point: reads .env, creates the OpenAI client
src/app.js         Express routes: /api/config, /api/chat, /api/tools/:module/:tool, /api/quiz
src/modules.js     The four assistants: system prompts, settings fields, starter questions, tools
src/curricula.js   Exam boards, levels, subjects and explanation languages
src/quiz.js        JSON schema and instructions for structured quiz generation
src/validate.js    Input validation and conversion to OpenAI Responses API input
src/rateLimit.js   In-memory per-IP rate limiter
test/              Tests (they use a fake OpenAI client, so no key is needed)
```

- Chat and tool output stream from the OpenAI **Responses API** to the browser as they are generated.
- Quizzes use **Structured Outputs** (a JSON schema), so the answers can be marked in the browser.
- The browser builds every form from `/api/config`. The server checks every value against the same definitions, so users cannot pick an unknown subject or send their own system prompt.
- Each user's chat history and settings are saved in their own browser (`localStorage`). There is no database and no user accounts.

### Adding a tool or curriculum

- **New exam board, subject or language:** edit the lists in `src/curricula.js`.
- **New tool:** add an entry to the module's `tools` array in `src/modules.js`, with an `id`, `name`, `description`, `fields` and a `prompt(values, ctx)` function. The form, validation and API route are picked up automatically.

## Testing

```bash
npm test
```

## Deploying

### Render (set up in this repo)

`render.yaml` describes the whole service, so Render can create it from the repo:

1. Sign in at [render.com](https://render.com) with GitHub.
2. Click **New + → Blueprint** and choose this repository.
3. Render asks for the secret values. Enter `OPENAI_API_KEY` and `APP_ACCESS_CODE`, and optionally `ORG_CONTACT_URL`. Then click **Apply**.
4. When the build finishes, the app is live at `https://<service-name>.onrender.com`. Every push to `main` redeploys it automatically.

On the free plan the service sleeps when idle, so the first visit after a quiet period takes up to a minute. Choose a paid plan in Render if that matters.

### Other hosts

Any Node host works (Railway, Fly.io, a VPS, etc.):

1. Set `OPENAI_API_KEY`, `APP_ACCESS_CODE`, and optionally `ORG_CONTACT_URL` as environment variables.
2. Build command: `npm install`. Start command: `npm start`.
3. Set a monthly spending limit in your OpenAI dashboard.

The rate limiter keeps its counts in memory. That is fine for a single instance; if you run several instances, use a shared store.

## Notes and limitations

- The AI follows each exam syllabus as it understands it. Official syllabus documents, exam dates, visa rules, fees and scholarship deadlines change, and the assistants are told to send users to official sources for these.
- AI answers can be wrong. Students should check worked solutions, and teachers should review generated material before using it.
