import express from "express"
import { deleteOrders, fecthMyOrders, fetchAllOrders, fetchSingleOrder, placeNewOrder, upadteOrderStatus } from "../Controllers/orderController.js"
import { authorizedRole, isAuthenticated } from "../middleWare/authMiddleWare.js"

export const orderRouter = express.Router()


orderRouter.post("/new",isAuthenticated,placeNewOrder)
orderRouter.get("/:orderId",isAuthenticated,fetchSingleOrder)
orderRouter.get("/order/me",isAuthenticated,fecthMyOrders)
orderRouter.get("/admin/getall",isAuthenticated,authorizedRole("Admin"),fetchAllOrders)
orderRouter.put("/admin/update/:orderId",isAuthenticated,authorizedRole('Admin'),upadteOrderStatus)
orderRouter.delete("/admin/delete/:orderId",isAuthenticated,authorizedRole('Admin'),deleteOrders)