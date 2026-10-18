// Exam boards and subjects the tutor and teacher assistant are aligned to.
// The AI is told to follow these syllabi, but official syllabus documents
// remain the source of truth, and the prompts say so.

export const EXAM_BOARDS = [
  { id: 'waec', name: 'WAEC – WASSCE (West Africa)', levels: ['SS1', 'SS2', 'SS3'] },
  { id: 'neco', name: 'NECO – SSCE (Nigeria)', levels: ['SS1', 'SS2', 'SS3'] },
  { id: 'jamb', name: 'JAMB – UTME (Nigeria)', levels: ['SS3 / UTME candidate'] },
  { id: 'bece', name: 'BECE – Junior Secondary', levels: ['JSS1', 'JSS2', 'JSS3', 'JHS1', 'JHS2', 'JHS3'] },
  { id: 'liberia-waec', name: 'WAEC Liberia – WASSCE / 9th Grade', levels: ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'] },
  { id: 'npse', name: 'NPSE – Primary (Sierra Leone)', levels: ['Class 5', 'Class 6'] },
  { id: 'kcse', name: 'KCSE (Kenya)', levels: ['Form 1', 'Form 2', 'Form 3', 'Form 4'] },
  { id: 'cambridge', name: 'Cambridge IGCSE', levels: ['Year 10', 'Year 11'] },
  { id: 'other', name: 'Other / General', levels: ['Primary', 'Junior secondary', 'Senior secondary', 'University'] },
];

export const SUBJECTS = [
  'English Language',
  'Mathematics',
  'Further Mathematics',
  'Biology',
  'Chemistry',
  'Physics',
  'Agricultural Science',
  'Economics',
  'Government',
  'Literature in English',
  'Geography',
  'History',
  'Financial Accounting',
  'Commerce',
  'Civic Education',
  'Christian Religious Studies',
  'Islamic Religious Studies',
  'Computer Studies / ICT',
  'Basic Science',
  'Basic Technology',
  'Social Studies',
  'French',
];

export const EXPLANATION_LANGUAGES = [
  'English',
  'Simple English',
  'Nigerian Pidgin',
  'Liberian English',
  'Krio',
  'Yoruba',
  'Hausa',
  'Igbo',
  'Twi',
  'Swahili',
  'French',
];

export function examBoardName(id) {
  return EXAM_BOARDS.find((b) => b.id === id)?.name ?? id;
}
