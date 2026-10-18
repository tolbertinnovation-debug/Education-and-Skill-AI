import { examBoardName } from './curricula.js';

export const QUIZ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'questions'],
  properties: {
    title: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'options', 'answerIndex', 'explanation', 'topic'],
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answerIndex: { type: 'integer' },
          explanation: { type: 'string' },
          topic: { type: 'string' },
        },
      },
    },
  },
};

export function quizInstructions(ctx) {
  return `You write exam-standard objective (multiple-choice) questions for ${examBoardName(ctx.examBoard)} candidates.
Subject: ${ctx.subject}. Level: ${ctx.level}.
Rules:
- Match the style, wording and difficulty of real past questions, aligned to the official syllabus.
- Each question has exactly 4 options (the text only, without "A." labels), exactly one correct answer, and plausible distractors based on common student mistakes.
- answerIndex is the 0-based index of the correct option. Vary its position.
- Double-check every calculation before choosing the answer.
- explanation: 1–3 sentences showing why the answer is right (with working for calculations), written in ${ctx.language}.
- topic: the syllabus topic the question tests.
- Write maths in plain readable notation (x^2, √x, 3/4).`;
}

// Drops malformed questions rather than failing the whole quiz.
export function sanitizeQuiz(quiz) {
  const questions = (quiz?.questions ?? []).filter(
    (q) =>
      typeof q?.question === 'string' &&
      Array.isArray(q.options) &&
      q.options.length >= 2 &&
      Number.isInteger(q.answerIndex) &&
      q.answerIndex >= 0 &&
      q.answerIndex < q.options.length,
  );
  return { title: String(quiz?.title ?? 'Practice quiz'), questions };
}
