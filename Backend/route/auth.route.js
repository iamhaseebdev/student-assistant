import { Router } from "express";
import { sendSignupOtp, signup, login, refresh, logout } from "../controller/auth.controller.js";
import { verifyAccessToken } from "../Middleware/auth.middleware.js";
import { otpLimiter, registerLimiter, loginLimiter } from "../Middleware/Ratelimit.middleware.js";

const authRouter = Router();

authRouter.post('/SendOtp', otpLimiter, sendSignupOtp);
authRouter.post('/Register', registerLimiter, signup);
authRouter.post('/Login', loginLimiter, login);
authRouter.post('/Refresh', refresh);
authRouter.post('/Logout', verifyAccessToken, logout);

export default authRouter;