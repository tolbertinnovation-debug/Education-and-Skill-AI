import { HttpError } from './validate.js';

// Simple fixed-window limiter per client IP, kept in memory. Good enough for
// a single server; put a shared store in front if you run several instances.
export function createRateLimiter(perMinute) {
  if (!perMinute || perMinute <= 0) return (req, res, next) => next();
  const hits = new Map();
  const windowMs = 60_000;

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (now - entry.start >= windowMs) hits.delete(ip);
  }, windowMs);
  sweep.unref();

  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip ?? 'unknown';
    let entry = hits.get(ip);
    if (!entry || now - entry.start >= windowMs) {
      entry = { start: now, count: 0 };
      hits.set(ip, entry);
    }
    entry.count += 1;
    if (entry.count > perMinute) {
      res.set('Retry-After', String(Math.ceil((entry.start + windowMs - now) / 1000)));
      return next(new HttpError(429, 'Too many requests. Please wait a minute and try again.'));
    }
    next();
  };
}
