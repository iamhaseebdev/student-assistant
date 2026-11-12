import { 
    createStudentService, 
    loginStudentService, 
    refreshAccessTokenService, 
    logoutStudentService 
} from "../services/auth.service.js";
import { sendOtpService, verifyOtpService, clearOtpService } from "../services/Otp.service.js";

// Vercel = HTTPS. Frontend aksar alag domain pe hota hai, isliye production me
// secure:true + sameSite:'none' chahiye warna refresh-token cookie browser reject kar deta hai.
const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax'
};
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 Days

async function sendSignupOtp(req, res) {
    try {
        // TODO (recommended): yahan check lagao ke email pehle se registered na ho,
        // taake user ko code bhejne se pehle hi "already registered" pata chal jaye.
        const result = await sendOtpService(req.body.StudentEmail, "signup");

        return res.status(200).json({
            success: true,
            message: 'Verification code sent to your email',
            ...result
        });
    } catch (error) {
        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message || 'Failed to send verification code'
        });
    }
}

async function signup(req, res) {
    try {
        const { VerificationCode, ...studentData } = req.body;

        // 1. Email ownership verify (code abhi delete nahi hota)
        await verifyOtpService(studentData.StudentEmail, VerificationCode, "signup");

        // 2. Student create
        const std = await createStudentService(studentData);

        // 3. Sirf success ke baad code use-up
        await clearOtpService(studentData.StudentEmail, "signup");

        return res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: std
        });
    } catch (error) {
        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message || 'Failed to create student'
        });
    }
}

async function login(req, res) {
    try {
        const { accessToken, refreshToken, user } = await loginStudentService(req.body);

        // Refresh token ko httpOnly cookie me attach kar rahe hain
        res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: REFRESH_MAX_AGE });

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            accessToken: accessToken,
            role: user.Role
        });
    } catch (error) {
        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message || 'Failed to login'
        });
    }
}

async function refresh(req, res) {
    try {
        const incomingRefreshToken = req.cookies?.refreshToken;

        const { accessToken, refreshToken } = await refreshAccessTokenService(incomingRefreshToken);

        // Naye refresh token se cookie update karna
        res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: REFRESH_MAX_AGE });

        return res.status(200).json({
            success: true,
            message: 'Token refreshed successfully',
            accessToken: accessToken
        });
    } catch (error) {
        return res.status(error.statusCode || 401).json({
            success: false,
            message: error.message || 'Invalid or expired refresh token'
        });
    }
}

async function logout(req, res) {
    try {
        const userId = req.user?.id;

        if (userId) {
            await logoutStudentService(userId);
        }

        // Browser se refresh token cookie clear karna
        res.clearCookie('refreshToken', cookieOptions);

        return res.status(200).json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to logout'
        });
    }
}

export {
    sendSignupOtp,
    signup,
    login,
    refresh,
    logout
};