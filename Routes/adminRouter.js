import express from "express"
import { dashboardStats, deleteUser, getAllUsers } from "../Controllers/adminController.js"
import { authorizedRole,isAuthenticated } from "../middleWare/authMiddleWare.js"
export const adminRouter = express.Router()


adminRouter.get("/getallusers",isAuthenticated,authorizedRole("Admin"),getAllUsers) // DASHBOARD
adminRouter.delete("/delete/:id",isAuthenticated,authorizedRole("Admin"),deleteUser)
adminRouter.get("/fetch/dashboard-stats",isAuthenticated,authorizedRole("Admin"),dashboardStats)