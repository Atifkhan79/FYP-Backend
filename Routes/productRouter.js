import express from "express";
import { isAuthenticated, authorizedRole } from "../middleWare/authMiddleWare.js";
import { createProduct,deleteProduct, deleteProductReview, fetchAIFilteredProduct, fetchAllProducts, fetchSingleProduct, postProductReview, updateProduct } from "../Controllers/productController.js";


export const productRouter = express.Router();

/**
 * POST /admin/create
 * - Only Admin users
 * - Supports multiple image uploads (up to 5)
 * - Uses upload.fields() for better control
 */
productRouter.post(
  "/admin/create",
  isAuthenticated,
  authorizedRole("Admin"),createProduct
);
productRouter.get("/",fetchAllProducts)
productRouter.put("/admin/update/:productId",isAuthenticated,authorizedRole("Admin"),updateProduct)
productRouter.delete("/admin/delete/:productId",isAuthenticated,authorizedRole('Admin'),deleteProduct)
productRouter.get("/singleProduct/:productId",fetchSingleProduct)
productRouter.put("/post-new/review/:productId",isAuthenticated,postProductReview)
productRouter.delete(
  "/delete/review/:reviewId",
  isAuthenticated,
  deleteProductReview
);
productRouter.post("/ai-search",isAuthenticated,fetchAIFilteredProduct)