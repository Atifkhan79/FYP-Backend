import fs from "fs";
import { v2 as cloudinary } from "cloudinary";
import { database } from "../database/db.js";
import { AsyncHandler } from "../middleWare/AsyncHandler.js";
import ErrorHandler from "../middleWare/errorMiddleWare.js";
import { getAIRecommendation } from "../utils/getAIRecomendation.js";

/**
 * @desc    Create a new product (Admin only)
 * @route   POST /admin/create
 * @access  Admin
 */
export const createProduct = AsyncHandler(async (req, res, next) => {
  const { name, description, price, category, stock } = req.body;
  const created_by = req.user.id;

  // 1️⃣ Validate required fields
  if (!name || !description || !price || !category || !stock) {
    return next(
      new ErrorHandler("Please provide complete product details.", 400),
    );
  }

  const uploadedImages = [];

  // 2️⃣ Check if files are uploaded
  if (req.files && req.files.images) {
    // Convert to array in case only 1 image is uploaded
    const images = Array.isArray(req.files.images)
      ? req.files.images
      : [req.files.images];

    for (const image of images) {
      // 3️⃣ Upload using tempFilePath
      if (!image.tempFilePath) {
        console.error("Missing tempFilePath for Cloudinary upload", image);
        continue; // skip invalid file
      }

      const result = await cloudinary.uploader.upload(image.tempFilePath, {
        folder: "Ecommerce_Product_Images",
        width: 1000,
        crop: "scale",
      });

      uploadedImages.push({
        url: result.secure_url,
        public_id: result.public_id,
      });

      // 4️⃣ Remove temp file if you used temp files
      fs.unlinkSync(image.tempFilePath);
    }
  }
  // 1️⃣ Get raw price string
  const priceString = (price || "").toString().trim();

  // 2️⃣ Remove any $ or commas
  const cleanedPrice = priceString.replace(/[^0-9.]/g, ""); // keeps only digits and dot

  // 3️⃣ Convert to number
  const numericPrice = parseFloat(cleanedPrice);

  if (!cleanedPrice || isNaN(numericPrice)) {
    console.log("Received price:", price); // debug
    return next(new ErrorHandler("Price must be a valid number", 400));
  }

  // 5️⃣ Insert product into database
  const product = await database.query(
    `INSERT INTO products (name, description, price, category, stock, images, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      name,
      description,
      numericPrice,
      category,
      stock,
      JSON.stringify(uploadedImages),
      created_by,
    ],
  );

  // 6️⃣ Return success response
  res.status(201).json({
    success: true,
    message: "Product created successfully.",
    product: product.rows[0],
  });
});

// GET ALL products with diffrent Method
export const fetchAllProducts = AsyncHandler(async (req, res, next) => {
  /// Extract from URL
  const { availability, price, category, ratings, search } = req.query;

  const page = parseInt(req.query.page) || 1; //page → current page number from query or defaults to 1

  const limit = 10; // limit → number of products per page (10)
  const offset = (page - 1) * limit; //offset → how many products to skip for pagination.Formula: (page - 1) * limit

  const conditions = []; //conditions → stores SQL conditions like p.price BETWEEN $1 AND $2
  const values = []; //values → array of actual values to replace $1, $2, ... safely
  let index = 1; // index → placeholder counter for $1, $2, $3

  // Filter Products by Availability
  if (availability === "in-stock") {
    conditions.push("p.stock > 5");
  } else if (availability === "limited") {
    conditions.push("p.stock > 0 AND p.stock <= 5");
  } else if (availability === "out-of-stock") {
    conditions.push("p.stock = 0");
  }

  // Filter Products by Price
  if (price) {
    const [minPrice, maxPrice] = price.split("-");
    if (minPrice && maxPrice) {
      conditions.push(`p.price BETWEEN $${index} AND $${index + 1}`);
      values.push(minPrice, maxPrice);
      index += 2;
    }
  }

  // Filter Products by Category
  if (category) {
    conditions.push(`p.category ILIKE $${index}`);
    values.push(`%${category}%`);
    index++;
  }

  // Filter Products by Ratings
  if (ratings) {
    conditions.push(`p.ratings >= $${index}`);
    values.push(ratings);
    index++;
  }

  // Filte Products by Search
  if (search) {
    conditions.push(
      `(p.name ILIKE $${index} OR p.description ILIKE $${index})`,
    );
    values.push(`%${search}%`);
    index++;
  }

  /*Combines all conditions into a single WHERE clause.

Joins with AND to ensure all filters apply together.

If no conditions → whereClause is empty. */
  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Total Count  1. //Runs a query to count all filtered products (for pagination info).
  2; //Returns total number of matching products.
  const totalProductsResult = await database.query(
    `SELECT COUNT(*) FROM products p ${whereClause}`,
    values,
  );

  const totalProducts = parseInt(totalProductsResult.rows[0].count);

  // Add pagination safely
  values.push(limit);
  values.push(offset);

  const query = `
    SELECT p.*, COUNT(r.id) AS review_count
    FROM products p
    LEFT JOIN reviews r ON p.id = r.product_id
    ${whereClause}
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT $${index}
    OFFSET $${index + 1}
  `;

  const result = await database.query(query, values);

  // New Products
  const newProductsResult = await database.query(`
    SELECT p.*, COUNT(r.id) AS review_count
    FROM products p
    LEFT JOIN reviews r ON p.id = r.product_id
    WHERE p.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT 8
  `);

  // Top Rated
  const topRatedResult = await database.query(`
    SELECT p.*, COUNT(r.id) AS review_count
    FROM products p
    LEFT JOIN reviews r ON p.id = r.product_id
    WHERE p.ratings >= 4.5
    GROUP BY p.id
    ORDER BY p.ratings DESC, p.created_at DESC
    LIMIT 8
  `);

  res.status(200).json({
    success: true,
    products: result.rows,
    totalProducts,
    newProducts: newProductsResult.rows,
    topRatedProducts: topRatedResult.rows,
  });
});

// Upadate Products
export const updateProduct = AsyncHandler(async (req, res, next) => {
  const { productId } = req.params; // collect product id from url

  const { name, description, price, category, stock } = req.body; // collect data from model

  // 1️⃣ Validate required fields
  if (!name || !description || !price || !category || !stock) {
    return next(
      new ErrorHandler("Please provide complete product details.", 400),
    );
  }

  // 2️⃣ Check if product exists // founding product // if available
  const product = await database.query(`SELECT * FROM products WHERE id = $1`, [
    productId,
  ]);

  // if not available sent response to user producut not found
  if (product.rows.length === 0) {
    return next(new ErrorHandler("Product not found", 400));
  }

  //price methods to show in doller
  // 1️⃣ Convert price to string and trim
  const priceString = (price || "").toString().trim();

  // 2️⃣ Remove any non-digit and non-dot characters
  const cleanedPrice = priceString.replace(/[^0-9.]/g, "");

  // 3️⃣ Convert to number
  const numericPrice = parseFloat(cleanedPrice);

  if (!cleanedPrice || isNaN(numericPrice)) {
    return next(new ErrorHandler("Price must be a valid number", 400));
  }

  // 4️⃣ Update the product // update the product in databse
  const result = await database.query(
    `UPDATE products
     SET name = $1,
         description = $2,
         price = $3,
         category = $4,
         stock = $5
     WHERE id = $6
     RETURNING *`,
    [name, description, numericPrice, category, stock, productId],
  );

  res.status(200).json({
    success: true,
    message: "Product updated Successfully.",
    updatedProduct: result.rows[0],
  });
});

// Delete Products
export const deleteProduct = AsyncHandler(async (req, res, next) => {
  // 1️⃣ Extract the productId from the request URL parameters
  const { productId } = req.params;

  // 2️⃣ Check if the product exists in the database
  const product = await database.query(`SELECT * FROM products WHERE id = $1`, [
    productId,
  ]);

  // 3️⃣ If no product found, return an error
  if (product.rows.length === 0) {
    return next(new ErrorHandler("Product Not Found"));
  }

  // 4️⃣ Get the images array of the product (stored on Cloudinary)
  const images = product.rows[0].images;

  // 5️⃣ Delete the product from the database and return the deleted row
  const deleteResult = await database.query(
    `DELETE FROM products WHERE id = $1 RETURNING *`,
    [productId],
  );

  // 6️⃣ If deletion failed (no row returned), throw an error
  if (deleteResult.rows.length === 0) {
    return next(new ErrorHandler("Failed to Delete Product", 400));
  }

  // 7️⃣ Delete all product images from Cloudinary
  // ⚠️ Note: This currently deletes them **sequentially**, which may be slow for multiple images
  if (images && images.length > 0) {
    for (const image of images) {
      await cloudinary.uploader.destroy(image.public_id); // deletes image using its public_id
    }
  }

  // 8️⃣ Send success response to the client
  res.status(200).json({
    success: true,
    message: "Product Deleted Successfully.",
    deleteProduct: deleteResult.rows[0], // return the deleted product details
  });
});

// Fetched Single Product
export const fetchSingleProduct = AsyncHandler(async (req, res, next) => {
  // 1️⃣ Extract productId from request URL parameters
  const { productId } = req.params;

  // 2️⃣ Execute SQL query to fetch product and its reviews
  const result = await database.query(
    `SELECT p.*,
      COALESCE(
        json_agg(
          json_build_object(
            'review_id', r.id,
            'rating', r.rating,
            'comment', r.comment,
            'reviewer', json_build_object(
              'id', u.id,
              'name', u.name,
              'avatar', u.avatar
            )
          )
        ) FILTER (WHERE r.id IS NOT NULL), '[]'
      ) AS reviews
    FROM products p
    LEFT JOIN reviews r ON p.id = r.product_id  /* Join reviews table */
    LEFT JOIN users u ON r.user_id = u.id       /* Join users table for reviewer info */
    WHERE p.id = $1                             /* Filter by the requested product ID */
    GROUP BY p.id;` /* ️⃣ Group by product ID for aggregation */,
    [productId], // 9️⃣ Parameterized query to prevent SQL injection
  );

  // 10️⃣ Send response with product info and reviews
  res.status(200).json({
    success: true,
    message: "Product Fetched Successfully.",
    product: result.rows[0], // single product with nested reviews
  });
});


// POST Review Funtion
// POST Review Function
export const postProductReview = AsyncHandler(async (req, res, next) => {
  const { productId } = req.params;
  const { rating, comment } = req.body;

  // 1️⃣ Auth check
  if (!req.user?.id) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized user",
    });
  }

  const userId = req.user.id;

  // 2️⃣ Validate input
  const cleanRating = Number(rating);
  const cleanComment = comment?.trim();

  if (!cleanRating || cleanRating < 1 || cleanRating > 5 || !cleanComment) {
    return res.status(400).json({
      success: false,
      message: "Rating (1-5) and comment required",
    });
  }

  // 3️⃣ Check product exists
  const product = await database.query(
    "SELECT id FROM products WHERE id = $1",
    [productId]
  );

  if (product.rows.length === 0) {
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }

  // 4️⃣ Check existing review
  const existing = await database.query(
    "SELECT * FROM reviews WHERE product_id = $1 AND user_id = $2",
    [productId, userId]
  );

  let review;

  // 5️⃣ Update or insert review
  if (existing.rows.length > 0) {
    review = await database.query(
      `UPDATE reviews 
       SET rating = $1, comment = $2 
       WHERE product_id = $3 AND user_id = $4 
       RETURNING *`,
      [cleanRating, cleanComment, productId, userId]
    );
  } else {
    review = await database.query(
      `INSERT INTO reviews (product_id, user_id, rating, comment) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [productId, userId, cleanRating, cleanComment]
    );
  }

  // 6️⃣ Recalculate rating
  const avg = await database.query(
    `SELECT COALESCE(AVG(rating), 0) AS avg_rating 
     FROM reviews 
     WHERE product_id = $1`,
    [productId]
  );

  const avgRating = Number(avg.rows[0].avg_rating);

  await database.query(
    `UPDATE products SET ratings = $1 WHERE id = $2`,
    [avgRating, productId]
  );

  // 7️⃣ Response
  res.status(200).json({
    success: true,
    message: "Review posted successfully",
    review: review.rows[0],
  });
});

export const deleteProductReview = AsyncHandler(
  async (req, res, next) => {
    const { reviewId } = req.params;

    console.log("DELETE REVIEW ID:", reviewId);

    // 1️⃣ First find review safely
    const review = await database.query(
      `SELECT * FROM reviews WHERE id = $1 AND user_id = $2`,
      [reviewId, req.user.id]
    );

    if (review.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Review Not Found",
      });
    }

    const productId = review.rows[0].product_id;

    // 2️⃣ Delete review
    await database.query(
      `DELETE FROM reviews WHERE id = $1 AND user_id = $2`,
      [reviewId, req.user.id]
    );

    // 3️⃣ Recalculate rating safely
    const avgReview = await database.query(
      `SELECT COALESCE(AVG(rating), 0) AS avg_rating
       FROM reviews
       WHERE product_id = $1`,
      [productId]
    );

    const avgRating = Number(avgReview.rows[0].avg_rating);

    // 4️⃣ Update product rating
    await database.query(
      `UPDATE products
       SET ratings = $1
       WHERE id = $2`,
      [avgRating, productId]
    );

    // 5️⃣ Response
    res.status(200).json({
      success: true,
      message: "Review deleted successfully",
      reviewId,
    });
  }
);

export const fetchAIFilteredProduct = AsyncHandler(async (req, res, next) => {
  const { userPrompt } = req.body;

  if (!userPrompt || userPrompt.trim() === "") {
    return next(new ErrorHandler("Provide a valid prompt", 400));
  }

  try {

    /**
     * 🔥 RANKING FUNCTION
     */
    function rankProducts(products, query) {
      const q = query.toLowerCase();

      return products
        .map(p => {
          let score = 0;

          if (p.name?.toLowerCase().includes(q)) score += 5;
          if (p.category?.toLowerCase().includes(q)) score += 3;
          if (p.description?.toLowerCase().includes(q)) score += 1;

          return { ...p, score };
        })
        .sort((a, b) => b.score - a.score);
    }

    /**
     * 🔥 SAFE KEYWORDS (FIXED CRASH ISSUE)
     */
    const keywords = (userPrompt || "")
      .toLowerCase()
      .split(" ")
      .filter(word => word.length > 2);

    // fallback safety
    if (keywords.length === 0) {
      keywords.push(userPrompt);
    }

    /**
     * 🔥 SAFE SQL CONDITION BUILDER
     */
    const conditions = keywords.map(k => `
      name ILIKE '%${k}%'
      OR description ILIKE '%${k}%'
      OR category ILIKE '%${k}%'
    `).join(" OR ");

    /**
     * 🔥 DATABASE QUERY
     */
    const result = await database.query(`
      SELECT 
        id,
        name,
        description,
        category,
        price,
        images,
        stock
      FROM products
      WHERE ${conditions}
      LIMIT 200;
    `);

    let products = result.rows;

    /**
     * ❌ NO PRODUCTS FOUND
     */
    if (!products || products.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No products found matching your prompt.",
        products: [],
      });
    }

    /**
     * 🔥 SMART RANKING BEFORE AI
     */
    const ranked = rankProducts(products, userPrompt);

    const aiInputProducts = ranked.slice(0, 15).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      price: p.price,
      image: Array.isArray(p.images) ? p.images[0] : null,
    }));

    /**
     * 🤖 AI RECOMMENDATION STEP
     */
    let aiProducts;

    try {
      aiProducts = await getAIRecommendation(userPrompt, aiInputProducts);
    } catch (aiError) {
      console.error("🔥 AI ERROR:", aiError.message);

      // fallback (no AI)
      aiProducts = aiInputProducts.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        image: p.image,
      }));
    }

    /**
     * 🔥 RESPONSE
     */
    return res.status(200).json({
      success: true,
      message: "AI filtered products fetched successfully",
      totalFound: products.length,
      products: aiProducts,
    });

  } catch (error) {
    console.error("❌ ERROR MESSAGE:", error.message);
    console.error("❌ STACK TRACE:", error.stack);

    return res.status(500).json({
      success: false,
      message: error.message || "Server Error",
    });
  }
});