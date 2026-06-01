import ErrorHandler from '../middleWare/errorMiddleWare.js'
import {AsyncHandler} from "../middleWare/AsyncHandler.js"
import {database} from '../database/db.js'
import bcrypt from "bcrypt"
import { sendToken } from '../utils/jwtToken.js'
import { generatePasswordResetToken } from '../utils/generateResetPasswordToken.js'
import { sendEmail } from '../utils/sendEmail.js'
import {generateEmailTemplate} from '../utils/generateForgotPasswordEmailTemplate.js'
import crypto from "crypto"



// AUTHENTICATION FUNCTIONS

export const register  = AsyncHandler(async (req,res,next) => {

    const {name,email,password} = req.body

    if (!name || !email || !password) {
        return next(new ErrorHandler("Please provide All Required fields",400))
    }

    if (password.length < 8 || password.length > 16) {
        return next(new ErrorHandler("Password must be between 8 & 20 characters.",400))
    }

    const isAlreadyRegisterd = await database.query(`
        SELECT * FROM users WHERE email = $1`,[email])

        if (isAlreadyRegisterd.rows.length > 0 ) {
            return next(new ErrorHandler("User already registered with this email",400))
        }

        const hashedPassword = await bcrypt.hash(password,10)

        const user  = await database.query("INSERT INTO users (name,email,password) VALUES ($1, $2 ,$3) RETURNING * ",
            [name,email,hashedPassword]
        )

        // CREATE JWT FUNCTION FOR GIVING TOKEN TO USER
        sendToken(user.rows[0],200,"User Registered Sucessfully",res)


}) 


// Login controller
export const login = AsyncHandler(async (req, res, next) => {
  // Destructure email and password from the request body
const { email, password } = req.body;

// 1️⃣ Validate request body: make sure email and password are provided
if (!email || !password) {
    // If either is missing, throw an error
    return next(new ErrorHandler("Enter Your Email and Password", 400));
}

// 2️⃣ Query the database to find a user with the given email
const user = await database.query(
    `SELECT * FROM users WHERE email = $1 LIMIT 1`,
    [email] // parameterized query to prevent SQL injection
);

// 3️⃣ Check if user exists
if (user.rows.length === 0) {
    // No user found with this email → invalid credentials
    return next(new ErrorHandler("Invalid email or password", 401));
}

// 4️⃣ Compare the entered password with the hashed password in DB
const isPasswordMatch = await bcrypt.compare(password, user.rows[0].password);

// 5️⃣ If password does not match → invalid credentials
if (!isPasswordMatch) {
    return next(new ErrorHandler("Invalid email or password", 401));
}

// 6️⃣ If everything is valid, generate a JWT token and send it to the user
// The token must include the user's id, so middleware can verify it later
sendToken(user.rows[0], 200, "Logged In", res);
});


export const getUser  = AsyncHandler(async (req,res,next) => {
    // first create isAuthenticated middleware

    // GET USER FROM REQ
    const user = req.user
    

    // THEN SEND RESPONSE TO USER
    res.status(200).json({
        success : true,
        user,
    })

    
})


export const logOut  = AsyncHandler(async (req,res,next) => {
    
    // expire cookie diectly on the time 
    res.status(200).cookie("token","",{
        expires : new Date(Date.now()),
        httpOnly : true,
    }).json({
        success : true,
        message : "Logged out Ssuccessfully"
    })
    
})


export const forgotPassword = AsyncHandler(async (req,res,next) => {
    
    // take email from body
    const { email } = req.body;
    
    // take fronted url from database 
    const { frontedUrl } = req.query;

    // fire quaaer in database check email is availible
    let userResult = await database.query(
        `SELECT * FROM users WHERE email = $1`,
        [email]
    );
        /// if not availible send response to user | user not found
    if (userResult.rows.length === 0) {
        return next(new ErrorHandler("User not found with this email", 404));
    }

    // if user found
    const user = userResult.rows[0];

    // import something from utils means generatePasswordToken and take hashed password reset password expire and reset token 
    const { hashedToken, resetPasswordExpireTime, resetToken } =
        generatePasswordResetToken();

        // after fire query in database reset password and expire password update and also send hashedtoken password expire time and email
    await database.query(
        `UPDATE users 
         SET reset_password_token = $1, 
             reset_password_expire = to_timestamp($2) 
         WHERE email = $3`,
        [hashedToken, resetPasswordExpireTime / 1000, email]
    );

    // after that take fronted url and resettoken
    const resetPasswordUrl = `${process.env.FRONTEND_URL}/password/reset/${resetToken}`;
    // after that import generateEmailTemplate and reset Password uri
    const message = generateEmailTemplate(resetPasswordUrl);

    try {
        await sendEmail({
            email: user.email,
            subject: "Ecommerce Password Recovery",
            message,
        });

        res.status(200).json({
            success: true,
            message: `Email sent to ${user.email} successfully`,
        });

    } catch (error) {

        await database.query(
            `UPDATE users 
             SET reset_password_token = NULL, 
                 reset_password_expire = NULL 
             WHERE email = $1`,
            [email]
        );

        return next(new ErrorHandler("Email could not be sent", 500));
    }
});


export const resetPassword = AsyncHandler(async (req, res, next) => {

    // 1️⃣ Extract the reset token from the URL parameters
    const { token } = req.params;

    // 2️⃣ Hash the token because we stored a hashed version in the database
    const resetPasswordToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

    // 3️⃣ Look up the user in the database with this token AND check token has not expired
    const user = await database.query(
        `SELECT * FROM users 
         WHERE reset_password_token = $1 
         AND reset_password_expire > NOW()`,
        [resetPasswordToken]
    );

    // 4️⃣ If no user is found, the token is invalid or expired
    if (user.rows.length === 0) {
        return next(new ErrorHandler("Invalid or expired reset token", 400));
    }

    // 5️⃣ Ensure that the request body exists and contains both password fields
    if (!req.body || !req.body.password || !req.body.confirmPassword) {
        return next(new ErrorHandler("Password and Confirm Password are required", 400));
    }

    // 6️⃣ Check if the password and confirm password match
    if (req.body.password !== req.body.confirmPassword) {
        return next(new ErrorHandler("Passwords do not match", 400));
    }

    // 7️⃣ Validate password length (between 8 and 20 characters)
    if (req.body.password.length < 8 || req.body.password.length > 20) {
        return next(new ErrorHandler("Password must be between 8 & 20 characters.", 400));
    }

    // 8️⃣ Hash the new password before storing it in the database
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    // 9️⃣ Update the user's password in the database and clear the reset token and expiry
    const updatedUser = await database.query(
        `UPDATE users 
         SET password = $1,                  
             reset_password_token = NULL,    
             reset_password_expire = NULL  
         WHERE id = $2                       
         RETURNING *`,                       
        [hashedPassword, user.rows[0].id]
    );

    // 🔟 Send a new JWT token and success response to the client
    sendToken(updatedUser.rows[0], 200, "Password reset successfully", res);
});
 


export const updatePassword = AsyncHandler(async (req, res, next) => {

    // 1️⃣ Get fields from request body
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    // 2️⃣ Check required fields
    if (!currentPassword || !newPassword || !confirmNewPassword) {
        return next(new ErrorHandler("Please provide all required fields", 400));
    }

    // 3️⃣ Compare current password
    const isPasswordMatch = await bcrypt.compare(currentPassword, req.user.password);
    if (!isPasswordMatch) {
        return next(new ErrorHandler("Current password is incorrect", 400));
    }

    // 4️⃣ Confirm new password matches
    if (newPassword !== confirmNewPassword) {
        return next(new ErrorHandler("New passwords do not match", 400));
    }

    // 5️⃣ Validate password length
    if (newPassword.length < 8 || newPassword.length > 16) {
        return next(new ErrorHandler("Password must be between 8 and 16 characters", 400));
    }

    // 6️⃣ Optional: prevent using the same password again
    const isSameAsOld = await bcrypt.compare(newPassword, req.user.password);
    if (isSameAsOld) {
        return next(new ErrorHandler("New password cannot be same as current password", 400));
    }

    // 7️⃣ Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 8️⃣ Update password in DB
    await database.query(
        `UPDATE users SET password = $1 WHERE id = $2`,
        [hashedPassword, req.user.id]
    );

    // 9️⃣ Send success response
    res.status(200).json({
        success: true,
        message: "Password updated successfully."
    });

});



// Controller to update user profile, including optional avatar image
export const updateProfile = AsyncHandler(async (req, res, next) => {
  // 1️⃣ Destructure name and email from request body
  const { name, email } = req.body;

  // 2️⃣ Basic validation: check if name and email exist and are not empty
  if (!name || !email || name.trim().length === 0 || email.trim().length === 0) {
    return next(new ErrorHandler("Please provide all required fields.", 400));
  }

  // 3️⃣ Initialize avatarData to null
  let avatarData = null;

  // 4️⃣ Handle uploaded avatar if a file is sent
  if (req.file) {
    try {
      // 4a. Delete old avatar from Cloudinary if it exists
      if (req.user?.avatar?.public_id) {
        const destroyResult = await cloudinary.uploader.destroy(req.user.avatar.public_id);
        console.log("Old avatar deletion result:", destroyResult);
      }

      // 4b. Upload new avatar to Cloudinary
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "Ecommerce_Avatars",
        width: 150,
        crop: "scale",
      });

      // 4c. Prepare avatarData object to save in database
      avatarData = {
        public_id: result.public_id,
        url: result.secure_url,
      };
    } finally {
      // 4d. Remove temporary file from local server after upload
      fs.unlinkSync(req.file.path);
    }
  }

  // 5️⃣ Prepare database query
  const query = avatarData
    ? "UPDATE users SET name = $1, email = $2, avatar = $3 WHERE id = $4"
    : "UPDATE users SET name = $1, email = $2 WHERE id = $3";

  const values = avatarData
    ? [name, email, JSON.stringify(avatarData), req.user.id]
    : [name, email, req.user.id];

  // 6️⃣ Execute query to update user in database
  await database.query(query, values);

  // 7️⃣ Fetch updated user to ensure we return correct data
  const updatedUserResult = await database.query(
    "SELECT id, name, email, avatar FROM users WHERE id = $1",
    [req.user.id]
  );

  const updatedUser = updatedUserResult.rows[0];

  // 8️⃣ Send response back to client
  res.status(200).json({
    success: true,
    message: "Profile updated successfully.",
    user: updatedUser,
  });
});