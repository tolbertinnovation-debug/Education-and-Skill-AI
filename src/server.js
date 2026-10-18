import 'dotenv/config';
import OpenAI from 'openai';
import { createApp } from './app.js';

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY. Copy .env.example to .env and add your key.');
  process.exit(1);
}

const app = createApp({
  openai: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  model: process.env.OPENAI_MODEL || 'gpt-5-mini',
  accessCode: process.env.APP_ACCESS_CODE,
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE || 20),
  orgName: process.env.ORG_NAME,
  orgContactUrl: process.env.ORG_CONTACT_URL,
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Education & Skills AI running at http://localhost:${port}`);
});
