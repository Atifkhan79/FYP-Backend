import jwt from 'jsonwebtoken'


export const sendToken = (user, statusCode, message, res) => {
    // create JWT payload with user id
    const token = jwt.sign(
        { id: user.id },        // 🔥 IMPORTANT: must include id
        process.env.JWT_SECRET_KEY,
        { expiresIn: "7d" }
    );

    // set cookie
    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    });

    // send response
    const { password, ...userWithoutPassword } = user; // remove password
    res.status(statusCode).json({
        success: true,
        message,
        user: userWithoutPassword,
        token,
    });
};