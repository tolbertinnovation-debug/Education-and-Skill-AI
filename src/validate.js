export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const MAX_TEXT = 300;
const MAX_TEXTAREA = 15000;
export const MAX_MESSAGE_CHARS = 8000;
export const MAX_HISTORY = 30;
export const MAX_IMAGE_CHARS = 6_000_000; // ~4.5 MB image as a base64 data URL

// Checks submitted values against a list of field definitions from modules.js
// and returns a clean object with defaults filled in.
export function cleanFields(fields, values = {}) {
  if (typeof values !== 'object' || values === null || Array.isArray(values)) {
    throw new HttpError(400, 'Expected an object of field values.');
  }
  const out = {};
  for (const field of fields) {
    let value = values[field.id];
    if (value === undefined || value === null || value === '') value = field.default ?? '';

    if (field.type === 'number') {
      if (value === '') {
        out[field.id] = '';
      } else {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0 || n > 1000) {
          throw new HttpError(400, `${field.label} must be a number between 0 and 1000.`);
        }
        out[field.id] = Math.round(n);
      }
    } else {
      value = String(value).trim();
      const max = field.type === 'textarea' ? MAX_TEXTAREA : MAX_TEXT;
      if (value.length > max) throw new HttpError(400, `${field.label} is too long (max ${max} characters).`);
      if (field.type === 'select' && value && !field.options.some((o) => o.value === value)) {
        throw new HttpError(400, `Invalid choice for ${field.label}.`);
      }
      out[field.id] = value;
    }

    if (field.required && out[field.id] === '') {
      throw new HttpError(400, `${field.label} is required.`);
    }
  }
  return out;
}

// Validates chat history and converts it to Responses API input items.
export function toResponsesInput(messages, { allowImages }) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HttpError(400, 'messages must be a non-empty array.');
  }
  const recent = messages.slice(-MAX_HISTORY);
  if (recent[recent.length - 1]?.role !== 'user') {
    throw new HttpError(400, 'The last message must be from the user.');
  }
  // Only the newest image is sent; older ones would re-bill on every turn.
  const lastImageIndex = recent.findLastIndex((m) => m?.image);

  return recent.map((m, i) => {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) {
      throw new HttpError(400, 'Each message needs a role of "user" or "assistant".');
    }
    const text = typeof m.content === 'string' ? m.content : '';
    if (text.length > MAX_MESSAGE_CHARS) {
      throw new HttpError(400, `Messages are limited to ${MAX_MESSAGE_CHARS} characters.`);
    }
    if (m.role === 'assistant') return { role: 'assistant', content: text };

    if (m.image && i === lastImageIndex) {
      if (!allowImages) throw new HttpError(400, 'Images are not supported in this assistant.');
      if (typeof m.image !== 'string' || !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(m.image)) {
        throw new HttpError(400, 'Images must be PNG, JPEG, WebP or GIF.');
      }
      if (m.image.length > MAX_IMAGE_CHARS) throw new HttpError(400, 'Image is too large (max about 4 MB).');
      return {
        role: 'user',
        content: [
          { type: 'input_text', text: text || 'Please help me with this.' },
          { type: 'input_image', image_url: m.image, detail: 'auto' },
        ],
      };
    }
    if (m.image) return { role: 'user', content: text || '(shared an image earlier)' };
    if (!text.trim()) throw new HttpError(400, 'Messages cannot be empty.');
    return { role: 'user', content: text };
  });
}
