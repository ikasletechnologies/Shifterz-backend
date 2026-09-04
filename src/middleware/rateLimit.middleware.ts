import rateLimit from "express-rate-limit";

// Phase 0.8 — express-rate-limit was already a dependency but was never
// wired into the app; every login attempt was unlimited. Configurable via
// env so operators can tune it without a code change, with defaults that
// stop credential stuffing/brute force without punishing normal mistyped
// passwords.
const windowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 min
const max = Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10; // 10 attempts / window / IP

export const loginRateLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
  // Only failed attempts count against the limit, so a user who mistypes a
  // password a couple of times and then logs in successfully is never
  // penalized for it.
  skipSuccessfulRequests: true,
});
