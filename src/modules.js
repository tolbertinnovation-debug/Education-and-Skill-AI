// The four assistants. Each module declares:
//   - contextFields: settings shown above the chat (exam board, subject, ...)
//   - systemPrompt(ctx, config): instructions sent to the model for chat
//   - starters: example questions shown in an empty chat
//   - tools: one-shot generators (form -> document) built from the same context
//
// The browser renders forms from this registry via GET /api/config, and the
// server validates every submitted value against it, so adding a tool here is
// all it takes to ship it.

import { EXAM_BOARDS, SUBJECTS, EXPLANATION_LANGUAGES, examBoardName } from './curricula.js';

const COMMON_RULES = `
General rules:
- Format answers in Markdown with short paragraphs, headings and lists where they help.
- Write maths in plain readable notation (x^2, √x, 3/4, ≤, π) and show working step by step.
- If you are not sure about a fact, say so. Never invent statistics, quotes, deadlines, fees or URLs.
- Be warm, encouraging and respectful. Assume the user may be on a phone with limited data, so be concise unless asked for detail.
- Refuse requests to help cheat in a live exam, to forge documents, or to misrepresent facts on official applications, and offer an honest alternative.`;

const examBoardField = {
  id: 'examBoard',
  label: 'Exam / curriculum',
  type: 'select',
  options: EXAM_BOARDS.map((b) => ({ value: b.id, label: b.name })),
  default: 'waec',
};

const subjectField = {
  id: 'subject',
  label: 'Subject',
  type: 'select',
  options: SUBJECTS.map((s) => ({ value: s, label: s })),
  default: 'Mathematics',
};

const levelField = {
  id: 'level',
  label: 'Class / level',
  type: 'select',
  options: [...new Set(EXAM_BOARDS.flatMap((b) => b.levels))].map((l) => ({ value: l, label: l })),
  default: 'SS3',
};

const languageField = {
  id: 'language',
  label: 'Explain in',
  type: 'select',
  options: EXPLANATION_LANGUAGES.map((l) => ({ value: l, label: l })),
  default: 'English',
};

function contextLine(ctx) {
  return Object.entries(ctx)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${k === 'examBoard' ? examBoardName(v) : v}`)
    .join('; ');
}

export const MODULES = [
  {
    id: 'tutor',
    name: 'Exam Tutor',
    icon: '📚',
    tagline: 'A personal tutor that follows your exam syllabus (WAEC, NECO, JAMB, BECE and more).',
    contextFields: [
      examBoardField,
      subjectField,
      levelField,
      languageField,
      {
        id: 'style',
        label: 'Teaching style',
        type: 'select',
        options: [
          { value: 'guide', label: 'Guide me step by step (hints first)' },
          { value: 'explain', label: 'Explain fully, then check me' },
        ],
        default: 'guide',
      },
    ],
    supportsImages: true,
    starters: [
      'Explain how to solve quadratic equations by completing the square.',
      'Give me a WAEC-style question on this topic and mark my answer.',
      'What topics come up most often in this subject?',
      'I keep failing comprehension questions. How do I improve?',
    ],
    systemPrompt: (ctx) => `You are a patient, expert secondary-school tutor for students in Africa.
Student context: ${contextLine(ctx)}.

How to teach:
- Align explanations, terminology and examples to the ${examBoardName(ctx.examBoard)} syllabus for ${ctx.subject} at ${ctx.level} level. Use local, familiar examples (markets, naira/cedis/Liberian dollars/leones, farming, football, local foods and places).
- ${ctx.style === 'explain'
      ? 'Explain the concept fully with a worked example, then give the student one similar question to try.'
      : 'Use a Socratic approach: do not hand over the final answer immediately. Ask what the student already knows, give one hint at a time, and let them attempt each step. If they are stuck after two hints, show the worked solution.'}
- When the student asks for practice, write questions in the style and mark allocation of the real exam (objective/multiple-choice and theory/essay), then mark their answer like an examiner: marks awarded, what earned marks, what lost marks, and the model answer.
- Point out common examiner complaints and exam technique (showing working, units, answering exactly what is asked, time management).
- Explain in ${ctx.language}. Keep technical terms in English (as used in the exam) and define them.
- If the student uploads a photo of a question or their working, read it carefully and help with it.
- If asked about the exact official syllabus, exam dates or registration, give your best guidance and tell them to confirm on the official exam-body website or with their school.
${COMMON_RULES}`,
    tools: [
      {
        id: 'study-plan',
        name: 'Study plan',
        description: 'A week-by-week revision timetable up to your exam date.',
        fields: [
          { id: 'subjects', label: 'Subjects you are writing', type: 'textarea', placeholder: 'English, Maths, Biology, Chemistry, Physics, Economics, Civic Education…', required: true },
          { id: 'examDate', label: 'Exam date (approx.)', type: 'text', placeholder: 'e.g. May next year' },
          { id: 'hours', label: 'Study hours per week', type: 'number', default: 10 },
          { id: 'weak', label: 'Weak topics / worries', type: 'textarea', placeholder: 'e.g. organic chemistry, essay writing, logarithms' },
        ],
        prompt: (v, ctx) => `Create a realistic, week-by-week revision plan for a ${ctx.level} student preparing for ${examBoardName(ctx.examBoard)}.
Subjects: ${v.subjects}
Exam date: ${v.examDate || 'not given — assume 12 weeks'}
Available study time: ${v.hours || 10} hours per week.
Weak areas: ${v.weak || 'not given'}.
Prioritise high-yield syllabus topics and weak areas, interleave subjects, include weekly past-question practice and full timed mock papers near the end, and add rest. Present it as a table per week, followed by short tips on how to use past questions effectively.`,
      },
      {
        id: 'revision-notes',
        name: 'Revision notes',
        description: 'Concise exam-focused notes on any topic, with key definitions and likely questions.',
        fields: [
          { id: 'topic', label: 'Topic', type: 'text', placeholder: 'e.g. Photosynthesis, Simultaneous equations, Concord', required: true },
        ],
        prompt: (v, ctx) => `Write concise, exam-focused revision notes on "${v.topic}" for ${ctx.subject}, ${ctx.level}, aligned to the ${examBoardName(ctx.examBoard)} syllabus. Explain in ${ctx.language}.
Include: key definitions, core ideas, formulas or diagrams described in words where relevant, a worked example, common mistakes examiners report, a memory aid, and 3 exam-style practice questions with brief answers at the end.`,
      },
      {
        id: 'mark-answer',
        name: 'Mark my answer',
        description: 'Paste a question and your answer; get examiner-style marks and feedback.',
        fields: [
          { id: 'question', label: 'Question', type: 'textarea', required: true },
          { id: 'marks', label: 'Total marks', type: 'number', default: 10 },
          { id: 'answer', label: 'Your answer', type: 'textarea', required: true },
        ],
        prompt: (v, ctx) => `Act as a ${examBoardName(ctx.examBoard)} examiner for ${ctx.subject}. Mark this answer out of ${v.marks || 10}.
Question:
${v.question}

Student's answer:
${v.answer}

Give: the score, a marking breakdown (what earned and lost marks), a model answer that would score full marks, and two specific tips to improve. Explain in ${ctx.language}.`,
      },
    ],
  },

  {
    id: 'teacher',
    name: 'Teacher Assistant',
    icon: '🧑‍🏫',
    tagline: 'Cut the paperwork: lesson plans, schemes of work, tests, marking and report comments.',
    contextFields: [
      examBoardField,
      subjectField,
      levelField,
      { id: 'country', label: 'Country', type: 'text', default: 'Nigeria', placeholder: 'e.g. Nigeria, Ghana, Liberia' },
    ],
    starters: [
      'Give me 5 engaging ways to start a lesson on fractions with no projector.',
      'How do I manage a class of 80 students during group work?',
      'Suggest a practical for osmosis using cheap local materials.',
      'Help me differentiate this lesson for slow and fast learners.',
    ],
    systemPrompt: (ctx) => `You are an experienced teaching assistant for secondary-school teachers in Africa.
Teacher context: ${contextLine(ctx)}.

How to help:
- Produce practical, ready-to-use documents in the formats used in ${ctx.country} schools (lesson notes/lesson plans with objectives, entry behaviour, instructional materials, presentation steps, evaluation, assignment; schemes of work by week).
- Align content to the ${examBoardName(ctx.examBoard)} syllabus for ${ctx.subject} at ${ctx.level}.
- Assume large classes, limited textbooks and unreliable electricity unless told otherwise; suggest low-cost local teaching materials.
- Save the teacher time: be direct, use tables and templates they can copy, and keep student data out of your answers beyond what they gave you.
${COMMON_RULES}`,
    tools: [
      {
        id: 'lesson-plan',
        name: 'Lesson plan / lesson note',
        description: 'A complete lesson note in the standard school format.',
        fields: [
          { id: 'topic', label: 'Topic', type: 'text', required: true },
          { id: 'duration', label: 'Duration (minutes)', type: 'number', default: 40 },
          { id: 'classSize', label: 'Class size', type: 'number', default: 45 },
          { id: 'resources', label: 'Available resources', type: 'text', placeholder: 'chalkboard, textbook, no electricity…' },
        ],
        prompt: (v, ctx) => `Write a complete lesson note for ${ctx.subject}, ${ctx.level} (${examBoardName(ctx.examBoard)} syllabus, ${ctx.country}).
Topic: ${v.topic}. Duration: ${v.duration || 40} minutes. Class size: ${v.classSize || 45}. Resources: ${v.resources || 'chalkboard and textbook only'}.
Use the standard format: subject, class, topic, sub-topic, duration, behavioural objectives (SMART), previous knowledge / entry behaviour, instructional materials, reference books, introduction, presentation (step-by-step teacher and student activities with timings), evaluation questions, summary / board notes, and assignment.`,
      },
      {
        id: 'scheme-of-work',
        name: 'Scheme of work',
        description: 'A term-long week-by-week scheme of work.',
        fields: [
          { id: 'term', label: 'Term', type: 'select', options: ['First term', 'Second term', 'Third term'].map((t) => ({ value: t, label: t })), default: 'First term' },
          { id: 'weeks', label: 'Number of teaching weeks', type: 'number', default: 12 },
          { id: 'notes', label: 'Topics to include / notes', type: 'textarea' },
        ],
        prompt: (v, ctx) => `Create a ${v.weeks || 12}-week scheme of work for ${ctx.subject}, ${ctx.level}, ${v.term}, aligned to the ${examBoardName(ctx.examBoard)} syllabus in ${ctx.country}.
${v.notes ? `Teacher notes: ${v.notes}\n` : ''}Present it as a table: Week | Topic | Sub-topics / content | Learning activities | Resources | Assessment. Include revision and examination weeks.`,
      },
      {
        id: 'assessment',
        name: 'Test / exam builder',
        description: 'Objective and theory questions with a marking scheme.',
        fields: [
          { id: 'topics', label: 'Topics covered', type: 'textarea', required: true },
          { id: 'objective', label: 'Number of objective (MCQ) questions', type: 'number', default: 10 },
          { id: 'theory', label: 'Number of theory questions', type: 'number', default: 3 },
        ],
        prompt: (v, ctx) => `Write a ${ctx.subject} test for ${ctx.level} in ${examBoardName(ctx.examBoard)} style covering: ${v.topics}.
Section A: ${v.objective ?? 10} objective questions with options A–D.
Section B: ${v.theory ?? 3} theory questions with mark allocations.
Then give a separate MARKING SCHEME: the answer key for Section A and point-by-point marking guides for Section B. Mix easy, medium and hard questions.`,
      },
      {
        id: 'grade-work',
        name: 'Mark student work',
        description: 'Paste a student response and a rubric; get a mark and feedback to share.',
        fields: [
          { id: 'task', label: 'Question / task', type: 'textarea', required: true },
          { id: 'rubric', label: 'Rubric or marking guide (optional)', type: 'textarea' },
          { id: 'work', label: 'Student work', type: 'textarea', required: true },
        ],
        prompt: (v, ctx) => `Mark this ${ctx.subject} (${ctx.level}) student work.
Task:
${v.task}

Marking guide:
${v.rubric || 'None provided — use a fair examiner-style marking guide and state it.'}

Student work:
${v.work}

Return: a suggested score with justification against the guide, two strengths, two areas to improve, and a short encouraging comment the teacher can write on the script. Note anything the teacher should double-check.`,
      },
      {
        id: 'report-comments',
        name: 'Report card comments',
        description: 'Personalised comments for a whole class from names and scores.',
        fields: [
          { id: 'students', label: 'Students (one per line: name – score – notes)', type: 'textarea', required: true, placeholder: 'Ada – 78 – participates well\nKwame – 45 – often absent' },
          { id: 'tone', label: 'Tone', type: 'select', options: ['Formal', 'Warm', 'Brief'].map((t) => ({ value: t, label: t })), default: 'Warm' },
        ],
        prompt: (v, ctx) => `Write a ${v.tone.toLowerCase()} end-of-term report card comment (1–2 sentences) for each student in ${ctx.subject}, ${ctx.level}. Be specific, honest and encouraging; mention a next step for each. Return a table: Student | Score | Comment.
Students:
${v.students}`,
      },
      {
        id: 'letter',
        name: 'Letter / memo',
        description: 'Letters to parents, notices, or memos to the principal.',
        fields: [
          { id: 'audience', label: 'To', type: 'text', placeholder: 'Parents of SS2 students', required: true },
          { id: 'purpose', label: 'Purpose / key points', type: 'textarea', required: true },
        ],
        prompt: (v, ctx) => `Write a clear, polite school letter to: ${v.audience}. Country: ${ctx.country}. Key points:
${v.purpose}
Use the formal letter conventions common in ${ctx.country} schools, with placeholders in [brackets] for names, dates and signatures.`,
      },
    ],
  },

  {
    id: 'career',
    name: 'Career Coach',
    icon: '💼',
    tagline: 'Job-skills coaching: CVs, interviews, skill roadmaps and first jobs.',
    contextFields: [
      { id: 'country', label: 'Job market (country)', type: 'text', default: 'Nigeria' },
      { id: 'targetRole', label: 'Target role', type: 'text', placeholder: 'e.g. Junior data analyst' },
      {
        id: 'experience',
        label: 'Experience',
        type: 'select',
        options: ['Student / no experience', 'Graduate / NYSC', '1–3 years', '3–7 years', '7+ years', 'Career changer'].map((e) => ({ value: e, label: e })),
        default: 'Graduate / NYSC',
      },
    ],
    starters: [
      'Run a mock interview for my target role. Ask one question at a time.',
      'What skills should I learn first, and where can I learn them for free?',
      'How do I answer "Tell me about yourself"?',
      'How can I find remote jobs safely and avoid scams?',
    ],
    systemPrompt: (ctx) => `You are a practical career coach for young people and job seekers in Africa.
User context: ${contextLine(ctx)}.

How to coach:
- Ground advice in the ${ctx.country} job market and in remote/international work where relevant. Be honest about competition and realistic timelines.
- Favour free or low-cost learning paths and portfolio projects that prove skill.
- For mock interviews: ask ONE question at a time, wait for the answer, then give brief feedback (what was strong, what to improve, a stronger sample answer using STAR) before the next question.
- For CVs: prioritise measurable achievements, clear formatting that passes applicant-tracking systems, and local conventions (e.g. NYSC, national service).
- Warn about job scams (upfront fees, too-good-to-be-true pay) when relevant.
${COMMON_RULES}`,
    tools: [
      {
        id: 'cv-review',
        name: 'CV review & rewrite',
        description: 'Paste your CV; get a scored review and an improved version.',
        fields: [
          { id: 'cv', label: 'Your CV (paste text)', type: 'textarea', required: true },
          { id: 'job', label: 'Job description (optional)', type: 'textarea' },
        ],
        prompt: (v, ctx) => `Review this CV for a ${ctx.targetRole || 'suitable'} role in ${ctx.country} (${ctx.experience}).
${v.job ? `Target job description:\n${v.job}\n` : ''}
CV:
${v.cv}

Give: an overall score out of 10, the top 5 fixes ranked by impact, keywords missing for the role, then a fully rewritten CV in clean Markdown. Do not invent experience, employers, grades or certificates — use [placeholders] where the user should add real details.`,
      },
      {
        id: 'cover-letter',
        name: 'Cover letter',
        description: 'A tailored cover letter from your background and the job ad.',
        fields: [
          { id: 'job', label: 'Job description', type: 'textarea', required: true },
          { id: 'background', label: 'Your background / key achievements', type: 'textarea', required: true },
        ],
        prompt: (v, ctx) => `Write a concise, specific cover letter (under 350 words) for this job in ${ctx.country}.
Job:
${v.job}

Candidate background:
${v.background}

Only use facts provided by the candidate.`,
      },
      {
        id: 'roadmap',
        name: 'Skills roadmap',
        description: 'A month-by-month plan to become job-ready for a role.',
        fields: [
          { id: 'current', label: 'Current skills', type: 'textarea', required: true },
          { id: 'months', label: 'Months available', type: 'number', default: 6 },
          { id: 'hours', label: 'Hours per week', type: 'number', default: 10 },
          { id: 'device', label: 'Device / internet', type: 'text', placeholder: 'e.g. smartphone only, laptop with limited data' },
        ],
        prompt: (v, ctx) => `Create a ${v.months || 6}-month skills roadmap to become job-ready as a ${ctx.targetRole || 'role of the user\'s choice'} in ${ctx.country}.
Current skills: ${v.current}
Time: ${v.hours || 10} hours/week. Device/internet: ${v.device || 'not stated'}.
For each month: skills to learn, free or low-cost resources (name well-known platforms only; do not invent URLs), a portfolio project, and a checkpoint. Finish with how to find and apply for jobs and the certifications that are actually valued locally.`,
      },
      {
        id: 'interview-prep',
        name: 'Interview question bank',
        description: 'Likely interview questions with strong sample answers.',
        fields: [
          { id: 'company', label: 'Company / sector (optional)', type: 'text' },
          { id: 'background', label: 'Your background (optional)', type: 'textarea' },
        ],
        prompt: (v, ctx) => `List the 12 most likely interview questions for a ${ctx.targetRole || 'entry-level'} role${v.company ? ` at ${v.company}` : ''} in ${ctx.country} (${ctx.experience}): behavioural, technical and situational. For each, explain what the interviewer is looking for and give a strong sample answer${v.background ? ` tailored to this background: ${v.background}` : ''}. End with 5 smart questions the candidate can ask.`,
      },
    ],
  },

  {
    id: 'abroad',
    name: 'Study Abroad',
    icon: '✈️',
    tagline: 'Guidance on applications, scholarships and visas.',
    contextFields: [
      { id: 'homeCountry', label: 'Home country', type: 'text', default: 'Nigeria' },
      { id: 'destination', label: 'Destination(s)', type: 'text', placeholder: 'e.g. UK, Canada, Germany, USA' },
      {
        id: 'studyLevel',
        label: 'Level',
        type: 'select',
        options: ['Undergraduate', "Master's", 'PhD', 'Diploma / foundation', 'Exchange / short course'].map((e) => ({ value: e, label: e })),
        default: "Master's",
      },
      { id: 'field', label: 'Field of study', type: 'text', placeholder: 'e.g. Public Health' },
    ],
    starters: [
      'Which countries are best for me on a tight budget?',
      'What fully funded scholarships fit my profile?',
      'How do I show proof of funds for a student visa?',
      'Do I need IELTS, or are there waivers?',
    ],
    systemPrompt: (ctx, config) => `You are a study-abroad advisor helping African students plan and apply to study overseas. You work alongside ${config.orgName}, whose human advisors can help with personalised applications.
Student context: ${contextLine(ctx)}.

How to advise:
- Cover the full journey: choosing countries, programmes and universities; entry requirements and credential equivalence (WAEC/WASSCE, NECO, degree classes, CGPA); English tests and waivers; application timelines; personal statements/SOPs and references; scholarships and funding; student visas and proof of funds; pre-departure and arrival.
- Visa rules, fees, deadlines and scholarship terms change often. Give general guidance, clearly mark anything time-sensitive, and always tell the student to confirm on the official government immigration website, the university's site, or the scholarship's official page. Never invent deadlines, amounts or URLs.
- Warn clearly about fraud: fake admission letters, fake scholarships that charge fees, bought bank statements and unlicensed agents. Never help falsify documents or funds.
- Be realistic about costs and chances, and suggest affordable and fully funded options.
- When the student needs hands-on help (document review, application submission, visa interview prep), mention that ${config.orgName} advisors can help${config.orgContactUrl ? ` (${config.orgContactUrl})` : ''}.
${COMMON_RULES}`,
    tools: [
      {
        id: 'roadmap',
        name: 'Application roadmap',
        description: 'A month-by-month timeline from research to departure.',
        fields: [
          { id: 'intake', label: 'Target intake', type: 'text', placeholder: 'e.g. September next year', required: true },
          { id: 'grades', label: 'Your grades / results', type: 'text', placeholder: 'e.g. Second Class Upper, CGPA 3.8/5' },
          { id: 'budget', label: 'Budget (or "need full funding")', type: 'text' },
        ],
        prompt: (v, ctx) => `Build a month-by-month study-abroad roadmap for a student from ${ctx.homeCountry} targeting ${ctx.studyLevel} in ${ctx.field || 'their chosen field'} in ${ctx.destination || 'suitable countries'} for the ${v.intake} intake.
Grades: ${v.grades || 'not given'}. Budget: ${v.budget || 'not given'}.
Include: research and shortlisting, tests (IELTS/TOEFL/Duolingo/GRE as relevant), document preparation (transcripts, WAEC results verification, references, SOP), scholarship deadlines to look out for (described by type, verified by the student), applications, offers, deposits, visa, accommodation and travel. Present as a table plus a checklist. Mark time-sensitive items "verify on official site".`,
      },
      {
        id: 'scholarships',
        name: 'Scholarship strategy',
        description: 'Scholarship types and well-known programmes that match your profile.',
        fields: [
          { id: 'profile', label: 'Your profile', type: 'textarea', placeholder: 'grades, work experience, leadership, community service…', required: true },
        ],
        prompt: (v, ctx) => `Suggest a scholarship strategy for a ${ctx.studyLevel} applicant from ${ctx.homeCountry} in ${ctx.field || 'their field'} targeting ${ctx.destination || 'any country'}.
Profile:
${v.profile}

List well-established scholarship programmes and funding types that plausibly fit (government, university, foundation, research assistantships), with eligibility in general terms and how competitive they are. Do not state exact deadlines or amounts — tell the student to verify each on the official page. Then give advice on making the application stand out, and red flags for scholarship scams.`,
      },
      {
        id: 'visa',
        name: 'Visa preparation',
        description: 'Student visa checklist, proof-of-funds guidance and interview practice.',
        fields: [
          { id: 'country', label: 'Visa for which country', type: 'text', required: true },
          { id: 'concerns', label: 'Concerns (refusals, funding, gaps…)', type: 'textarea' },
        ],
        prompt: (v, ctx) => `Prepare a student from ${ctx.homeCountry} for a ${v.country} student visa (${ctx.studyLevel}).
Concerns: ${v.concerns || 'none stated'}.
Give: the typical document checklist, how proof of funds generally works and common mistakes, how to show ties to home and genuine study intent, common refusal reasons, and 10 likely visa interview questions with guidance on honest, strong answers. State clearly that requirements and fees change and must be checked on the official ${v.country} government immigration website.`,
      },
      {
        id: 'sop-review',
        name: 'Personal statement / SOP review',
        description: 'Detailed feedback and an improved draft of your statement.',
        fields: [
          { id: 'program', label: 'Programme & university', type: 'text' },
          { id: 'statement', label: 'Your statement', type: 'textarea', required: true },
        ],
        prompt: (v, ctx) => `Review this ${ctx.studyLevel} personal statement / statement of purpose${v.program ? ` for ${v.program}` : ''} in ${ctx.field || 'the applicant\'s field'}.
Statement:
${v.statement}

Give: an overall assessment, what admissions readers will like, the biggest weaknesses (clichés, vagueness, structure, fit with the programme, career goals), line-level suggestions, and then a revised version that keeps the applicant's own voice and facts. Do not add achievements they did not mention.`,
      },
    ],
  },
];

export function getModule(id) {
  return MODULES.find((m) => m.id === id);
}

// The JSON the browser needs to render the UI (no prompt text).
export function publicConfig(config) {
  return {
    orgName: config.orgName,
    orgContactUrl: config.orgContactUrl,
    requiresAccessCode: Boolean(config.accessCode),
    modules: MODULES.map((m) => ({
      id: m.id,
      name: m.name,
      icon: m.icon,
      tagline: m.id === 'abroad' ? `${m.tagline} With ${config.orgName}.` : m.tagline,
      contextFields: m.contextFields,
      starters: m.starters,
      supportsImages: Boolean(m.supportsImages),
      supportsQuiz: m.id === 'tutor',
      tools: m.tools.map(({ id, name, description, fields }) => ({ id, name, description, fields })),
    })),
  };
}
