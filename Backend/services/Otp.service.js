import crypto from "crypto";
import Otp from "../model/Otp.model.js";
import { sendOtpEmail } from "../utils/mailer.js";

const OTP_TTL_MS = 10 * 60 * 1000;        // code 10 min valid
const RESEND_COOLDOWN_MS = 60 * 1000;     // resend 60 sec baad
const MAX_ATTEMPTS = 5;                   // 5 galat tries ke baad code dead

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const httpError = (message, statusCode) =>
    Object.assign(new Error(message), { statusCode });

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

function hashOtp(email, otp) {
    if (!process.env.OTP_SECRET) {
        throw httpError("Server misconfigured: OTP_SECRET missing", 500);
    }
    return crypto
        .createHmac("sha256", process.env.OTP_SECRET)
        .update(`${email}:${otp}`)
        .digest("hex");
}

export async function sendOtpService(rawEmail, purpose = "signup") {
    const email = normalizeEmail(rawEmail);
    if (!EMAIL_REGEX.test(email)) {
        throw httpError("Please enter a valid email address", 400);
    }

    // Resend cooldown (spam / email bombing se bachne ke liye)
    const existing = await Otp.findOne({ email, purpose });
    if (existing) {
        const waitMs = RESEND_COOLDOWN_MS - (Date.now() - existing.lastSentAt.getTime());
        if (waitMs > 0) {
            throw httpError(`Please wait ${Math.ceil(waitMs / 1000)}s before requesting a new code`, 429);
        }
    }

    // Cryptographically secure 6-digit code
    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");

    await Otp.findOneAndUpdate(
        { email, purpose },
        {
            otpHash: hashOtp(email, otp),
            attempts: 0,
            lastSentAt: new Date(),
            expiresAt: new Date(Date.now() + OTP_TTL_MS)
        },
        { upsert: true, new: true }
    );

    try {
        await sendOtpEmail(email, otp, OTP_TTL_MS / 60000);
    } catch (err) {
        console.error("OTP email failed:", err.message);
        await Otp.deleteOne({ email, purpose });
        throw httpError("Could not send the verification email. Please try again.", 500);
    }

    return {
        expiresInSeconds: OTP_TTL_MS / 1000,
        resendAfterSeconds: RESEND_COOLDOWN_MS / 1000
    };
}

// Code check karta hai (delete nahi karta; success ke baad clearOtpService call karo)
export async function verifyOtpService(rawEmail, code, purpose = "signup") {
    const email = normalizeEmail(rawEmail);
    const submitted = String(code || "").trim();

    if (!/^\d{6}$/.test(submitted)) {
        throw httpError("Enter the 6-digit verification code", 400);
    }

    // Attempt pehle atomically count hota hai, taake parallel requests se brute force na ho
    const record = await Otp.findOneAndUpdate(
        { email, purpose, expiresAt: { $gt: new Date() } },
        { $inc: { attempts: 1 } },
        { new: true }
    );

    if (!record) {
        throw httpError("Code expired or not requested. Please request a new code.", 400);
    }

    if (record.attempts > MAX_ATTEMPTS) {
        await Otp.deleteOne({ _id: record._id });
        throw httpError("Too many wrong attempts. Please request a new code.", 429);
    }

    const expected = Buffer.from(record.otpHash, "hex");
    const actual = Buffer.from(hashOtp(email, submitted), "hex");

    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
        const left = MAX_ATTEMPTS - record.attempts;
        throw httpError(
            left > 0 ? `Invalid code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Invalid code. Please request a new code.",
            400
        );
    }

    return true;
}

export async function clearOtpService(rawEmail, purpose = "signup") {
    await Otp.deleteOne({ email: normalizeEmail(rawEmail), purpose });
}