import express from "express";
import { register,login, getUser, logOut, forgotPassword, resetPassword, updatePassword, updateProfile } from "../Controllers/authController.js";
import { isAuthenticated } from "../middleWare/authMiddleWare.js";


const userRouter = express.Router()


userRouter.post("/register",register)
userRouter.post("/login",login)
userRouter.get("/me",isAuthenticated,getUser)
userRouter.get("/logout",isAuthenticated,logOut)
userRouter.post("/password/forgot",forgotPassword)
userRouter.put("/password/reset/:token",resetPassword)
userRouter.put("/password/update",isAuthenticated,updatePassword)

// Ensure 'image' (or 'avatar') matches what's in your FormData
userRouter.put('/update-profile', isAuthenticated, updateProfile);

export default userRouter