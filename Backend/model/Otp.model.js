import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
    {
        email: { type: String, required: true, lowercase: true, trim: true },
        purpose: { type: String, enum: ["signup", "reset"], default: "signup" },
        otpHash: { type: String, required: true },   // plain code kabhi store nahi hota
        attempts: { type: Number, default: 0 },
        lastSentAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, required: true }
    },
    { timestamps: true }
);

// Ek email + purpose ka ek hi active code
otpSchema.index({ email: 1, purpose: 1 }, { unique: true });
// MongoDB expire hone par document khud delete kar dega
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("Otp", otpSchema);