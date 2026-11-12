// Backend/controller/changePassword.controller.js
import bcrypt from 'bcrypt'; // agar aapke project mein "bcryptjs" hai to yahan 'bcryptjs' likh dein
import Student from '../model/student.model.js';
import Token from '../model/token.model.js';

// 8-64 chars, at least one letter and one number (bcrypt only uses the first 72 bytes)
const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
const cookieOptions = { httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax' };

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;

export async function changePassword(req, res) {
    try {
        // ALWAYS the logged-in user from the token, never an id from the request body/params
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized access' });
        }

        const { currentPassword, newPassword } = req.body;

        if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Current and new password are required' });
        }
        if (!PASSWORD_RULE.test(newPassword)) {
            return res.status(400).json({
                success: false,
                message: 'New password must be 8-64 characters and include a letter and a number'
            });
        }
        if (newPassword === currentPassword) {
            return res.status(400).json({ success: false, message: 'New password must be different from the current one' });
        }

        const student = await Student.findById(userId);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const isMatch = await bcrypt.compare(currentPassword, student.Password);
        if (!isMatch) {
            // 400 (not 401) on purpose: a 401 would make the frontend try a token refresh / auto-logout
            return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        }

        student.Password = await bcrypt.hash(newPassword, 10);
        await student.save();

        // Kill every refresh token -> all other devices/sessions are logged out
        await Token.deleteMany({ userId: student._id });
        res.clearCookie('refreshToken', cookieOptions);

        return res.status(200).json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change Password Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to change password' });
    }
}