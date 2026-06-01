 import jwt from "jsonwebtoken"
import { AsyncHandler } from "./AsyncHandler.js"
import ErrorHandler from "./errorMiddleWare.js"
import { database } from "../database/db.js"

export const isAuthenticated = AsyncHandler(async (req, res, next) => {
        
    const { token } = req.cookies;

    if (!token) {
        return next(new ErrorHandler("Please Login to access this resources", 401));
    }

   const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
console.log("DECODED:", decoded);

const user = await database.query(
    `SELECT * FROM users WHERE id = $1 LIMIT 1`,
    [decoded.id]
);

    // 🔥 VERY IMPORTANT CHECK
    if (user.rows.length === 0) {
        return next(new ErrorHandler("User not found", 404));
    }

    req.user = user.rows[0];

    next();
});


export const authorizedRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ErrorHandler("Unauthorized. Please login again.", 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new ErrorHandler(
          `Role (${req.user.role}) is not allowed to access this resource`,
          403
        )
      );
    }

    next();
  };
};

