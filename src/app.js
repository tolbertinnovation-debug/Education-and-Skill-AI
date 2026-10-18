import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { MODULES, getModule, publicConfig } from './modules.js';
import { HttpError, cleanFields, toResponsesInput } from './validate.js';
import { QUIZ_SCHEMA, quizInstructions, sanitizeQuiz } from './quiz.js';
import { createRateLimiter } from './rateLimit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {object} options
 * @param {import('openai').default} options.openai  OpenAI client (or a test double)
 * @param {string} options.model
 * @param {string} [options.accessCode]   if set, required in the x-access-code header
 * @param {number} [options.rateLimitPerMinute]
 * @param {string} [options.orgName]
 * @param {string} [options.orgContactUrl]
 */
export function createApp(options) {
  const config = {
    model: options.model,
    accessCode: options.accessCode || '',
    orgName: options.orgName || 'TIH',
    orgContactUrl: options.orgContactUrl || '',
  };
  const openai = options.openai;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '8mb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });

  app.use(express.static(path.join(root, 'public')));
  app.use('/vendor/marked', express.static(path.join(root, 'node_modules/marked/lib')));
  app.use('/vendor/dompurify', express.static(path.join(root, 'node_modules/dompurify/dist')));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get('/api/config', (req, res) => res.json(publicConfig(config)));

  const api = express.Router();
  api.use(requireAccessCode(config.accessCode));
  api.use(createRateLimiter(options.rateLimitPerMinute ?? 20));

  // Free-form chat with one of the assistants, streamed as plain text.
  api.post('/chat', async (req, res, next) => {
    try {
      const mod = findModule(req.body?.module);
      const ctx = cleanFields(mod.contextFields, req.body?.context);
      const input = toResponsesInput(req.body?.messages, { allowImages: Boolean(mod.supportsImages) });
      await streamText(res, openai, {
        model: config.model,
        instructions: mod.systemPrompt(ctx, config),
        input,
      });
    } catch (err) {
      next(err);
    }
  });

  // One-shot document generators (lesson plans, CV reviews, visa checklists...).
  api.post('/tools/:module/:tool', async (req, res, next) => {
    try {
      const mod = findModule(req.params.module);
      const tool = mod.tools.find((t) => t.id === req.params.tool);
      if (!tool) throw new HttpError(404, 'Unknown tool.');
      const ctx = cleanFields(mod.contextFields, req.body?.context);
      const values = cleanFields(tool.fields, req.body?.values);
      await streamText(res, openai, {
        model: config.model,
        instructions: mod.systemPrompt(ctx, config),
        input: tool.prompt(values, ctx),
      });
    } catch (err) {
      next(err);
    }
  });

  // Exam-style multiple-choice quiz returned as structured JSON.
  api.post('/quiz', async (req, res, next) => {
    try {
      const mod = getModule('tutor');
      const ctx = cleanFields(mod.contextFields, req.body?.context);
      const { topic, count } = cleanFields(
        [
          { id: 'topic', label: 'Topic', type: 'text' },
          { id: 'count', label: 'Number of questions', type: 'number', default: 5 },
        ],
        req.body,
      );
      const n = Math.min(Math.max(count || 5, 1), 15);
      const response = await openai.responses.create({
        model: config.model,
        instructions: quizInstructions(ctx),
        input: `Write ${n} questions${topic ? ` on the topic "${topic}"` : ' spread across the syllabus'}.`,
        text: { format: { type: 'json_schema', name: 'quiz', schema: QUIZ_SCHEMA, strict: true } },
      });
      let quiz;
      try {
        quiz = sanitizeQuiz(JSON.parse(response.output_text));
      } catch {
        throw new HttpError(502, 'The AI returned an unreadable quiz. Please try again.');
      }
      if (quiz.questions.length === 0) throw new HttpError(502, 'No usable questions were generated. Please try again.');
      res.json(quiz);
    } catch (err) {
      next(err);
    }
  });

  app.use('/api', api);

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status;
    let message;
    if (err instanceof HttpError || (err.expose && err.status < 500)) {
      // Our own validation errors, and body-parser errors such as oversized JSON.
      status = err.status;
      message = err.message;
    } else {
      // OpenAI and unexpected errors: never echo upstream status codes (an
      // OpenAI 401 is a server misconfiguration, not the user's fault).
      status = err?.status === 429 ? 503 : 502;
      message = openAiMessage(err);
      if (!message) {
        status = 500;
        message = 'Something went wrong. Please try again.';
      }
      console.error(err);
    }
    if (res.headersSent) {
      res.end(`\n\n> ⚠️ ${message}`);
    } else {
      res.status(status).json({ error: message });
    }
  });

  return app;
}

function findModule(id) {
  const mod = getModule(id);
  if (!mod) throw new HttpError(404, `Unknown assistant. Choose one of: ${MODULES.map((m) => m.id).join(', ')}.`);
  return mod;
}

function requireAccessCode(code) {
  if (!code) return (req, res, next) => next();
  const expected = Buffer.from(code);
  return (req, res, next) => {
    const given = Buffer.from(String(req.get('x-access-code') ?? ''));
    if (given.length === expected.length && timingSafeEqual(given, expected)) return next();
    next(new HttpError(401, 'Access code required or incorrect.'));
  };
}

// Streams model output to the client as it is generated and stops the
// OpenAI request if the user navigates away.
async function streamText(res, openai, params) {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });

  const stream = await openai.responses.create({ ...params, stream: true }, { signal: controller.signal });

  res.status(200);
  res.set({
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  try {
    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        res.write(event.delta);
      } else if (event.type === 'error' || event.type === 'response.failed') {
        throw new HttpError(502, 'The AI service failed while answering. Please try again.');
      }
    }
    res.end();
  } catch (err) {
    if (controller.signal.aborted) return;
    throw err;
  }
}

function openAiMessage(err) {
  switch (err?.status) {
    case 401:
      return 'The server’s OpenAI API key is invalid. Check OPENAI_API_KEY.';
    case 403:
    case 404:
      return 'The configured OpenAI model is not available for this API key. Check OPENAI_MODEL.';
    case 429:
      return 'The AI service is busy or the API quota is used up. Please try again shortly.';
    default:
      return undefined;
  }
}
