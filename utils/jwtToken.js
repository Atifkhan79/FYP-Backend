import jwt from 'jsonwebtoken'

export const sendToken = (user, statusCode, message, res) => {
    const token = jwt.sign(
        { id: user.id },
        process.env.JWT_SECRET_KEY,
        { expiresIn: "7d" }
    );

    res.cookie("token", token, {
        httpOnly: true,
        secure: true,        // ✅ fixed: removed "| true" bug
        sameSite: "None",    // ✅ required for cross-site (Netlify ↔ Vercel)
        maxAge: 7 * 24 * 60 * 60 * 1000,  // ✅ added: 7 days expiry
    });

    const { password, ...userWithoutPassword } = user;
    res.status(statusCode).json({
        success: true,
        message,
        user: userWithoutPassword,
        token,  // ✅ already sending token in body — good!
    });
};