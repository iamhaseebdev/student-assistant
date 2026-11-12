import rateLimit from "express-rate-limit";

const make = (windowMinutes, limit, message, extra = {}) =>
    rateLimit({
        windowMs: windowMinutes * 60 * 1000,
        limit,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, message },
        ...extra
    });

export const otpLimiter = make(15, 5, "Too many code requests. Try again in a few minutes.");
export const registerLimiter = make(15, 10, "Too many signup attempts. Try again later.");
export const loginLimiter = make(15, 10, "Too many login attempts. Try again later.", {
    skipSuccessfulRequests: true
});