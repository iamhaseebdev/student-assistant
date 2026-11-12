import nodemailer from "nodemailer";

// Transporter lazily banta hai taake dotenv pehle load ho chuka ho
let transporter;
function getTransporter() {
    if (!transporter) {
        const port = Number(process.env.SMTP_PORT) || 465;
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || "smtp.gmail.com",
            port,
            secure: port === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    }
    return transporter;
}

export async function sendOtpEmail(to, otp, minutes = 10) {
    const html = `
    <div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
      <h2 style="margin:0 0 8px">Verify your email</h2>
      <p style="color:#475569;margin:0 0 20px">Use this code to finish creating your Notes Vault account.</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:10px;text-align:center;padding:16px;background:#f1f5f9;border-radius:8px">${otp}</div>
      <p style="color:#64748b;font-size:13px;margin:20px 0 0">This code expires in ${minutes} minutes. If you did not request it, ignore this email and do not share the code with anyone.</p>
    </div>`;

    await getTransporter().sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to,
        // Subject mein code nahi: sirf number wala subject spam filters ko spammy lagta hai
        subject: "Your Notes Vault verification code",
        text: `Use this code to finish creating your Notes Vault account: ${otp}\n\nThis code expires in ${minutes} minutes. If you did not request it, ignore this email and do not share the code with anyone.`,
        html
    });
}