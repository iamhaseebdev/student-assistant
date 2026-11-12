import Student from "../model/student.model.js";
import Token from "../model/token.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const SALT_ROUNDS = 10;

// Secrets .env se call-time par read hote hain (dotenv load order ka masla nahi aata)
const accessSecret = () => {
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is missing in .env");
    return process.env.JWT_SECRET;
};

const refreshSecret = () => {
    if (!process.env.JWT_REFRESH_SECRET) throw new Error("JWT_REFRESH_SECRET is missing in .env");
    return process.env.JWT_REFRESH_SECRET;
};

// Password Validation Helper
const isStrongPassword = (password) => {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return regex.test(password);
};

async function createStudentService(StudentData) {
    // NOTE: Role yahan se hata diya hai. Public signup se koi bhi Role: "admin" bhej kar
    // admin ban sakta tha. Admin account DB/seed script se banao.
    const { StudentName, StudentEmail, Password } = StudentData;

    if (!StudentName || !StudentEmail || !Password) {
        throw new Error('Data is missing!');
    }

    if (!isStrongPassword(Password)) {
        throw new Error(
            'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&).'
        );
    }

    const hashpassword = await bcrypt.hash(Password, SALT_ROUNDS);

    const user = await Student.create({
        StudentName,
        StudentEmail,
        Password: hashpassword
    });

    return user;
}

async function loginStudentService(StudentData) {
    const { StudentEmail, Password } = StudentData;

    if (!StudentEmail || !Password) {
        throw new Error('Data is missing!');
    }

    const user = await Student.findOne({ StudentEmail });

    if (!user) {
        throw new Error('Invalid Credentials');
    }

    const match = await bcrypt.compare(Password, user.Password);

    if (!match) {
        throw new Error('Invalid Credentials');
    }

    const accessToken = jwt.sign(
        {
            id: user._id,
            email: user.StudentEmail,
            name: user.StudentName,
            role: user.Role
        },
        accessSecret(),
        { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
        { id: user._id },
        refreshSecret(),
        { expiresIn: "7d" }
    );

    await Token.deleteMany({ userId: user._id });
    await Token.create({
        userId: user._id,
        token: refreshToken
    });

    return { accessToken, refreshToken, user };
}

async function refreshAccessTokenService(incomingRefreshToken) {
    if (!incomingRefreshToken) {
        throw new Error('Refresh Token is required');
    }

    const decoded = jwt.verify(incomingRefreshToken, refreshSecret());

    const tokenDoc = await Token.findOne({ userId: decoded.id, token: incomingRefreshToken });
    if (!tokenDoc) {
        throw new Error('Invalid or expired refresh token');
    }

    const user = await Student.findById(decoded.id);
    if (!user) {
        throw new Error('User not found');
    }

    const accessToken = jwt.sign(
        {
            id: user._id,
            email: user.StudentEmail,
            name: user.StudentName,
            role: user.Role
        },
        accessSecret(),
        { expiresIn: "15m" }
    );

    // Refresh token har baar badalna fragile hai: agar page reload ho jaye ya do tabs ek saath refresh karein
    // to naya token cookie tak nahi pahunchta, cookie aur DB ka token alag ho jata hai aur user logout ho jata hai.
    // Isliye token sirf expiry ke qareeb (24 ghante se kam bacha ho) tab badalte hain.
    const msLeft = decoded.exp * 1000 - Date.now();
    if (msLeft > 24 * 60 * 60 * 1000) {
        return { accessToken, refreshToken: incomingRefreshToken };
    }

    const newRefreshToken = jwt.sign(
        { id: user._id },
        refreshSecret(),
        { expiresIn: "7d" }
    );

    tokenDoc.token = newRefreshToken;
    await tokenDoc.save();

    return { accessToken, refreshToken: newRefreshToken };
}

async function logoutStudentService(userId) {
    await Token.deleteMany({ userId });
}

export {
    createStudentService,
    loginStudentService,
    refreshAccessTokenService,
    logoutStudentService
};