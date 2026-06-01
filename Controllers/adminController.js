import { database } from "../database/db.js";
import { AsyncHandler } from "../middleWare/AsyncHandler.js";
import ErrorHandler from "../middleWare/errorMiddleWare.js";
import {v2 as cloudinary} from "cloudinary"


// ADMIN ACCESS PER PAGE 10 USERS
export const getAllUsers = AsyncHandler(async (req, res, next) => {
  // -------------------------
  // 1️⃣ Pagination Setup
  // -------------------------
  const page = parseInt(req.query.page) || 1; 
  // Get the requested page from query params, default to 1 if not provided

  // -------------------------
  // 2️⃣ Total Users Count
  // -------------------------
  const totalUsersResult = await database.query(
    `SELECT COUNT(*) FROM users WHERE role = $1`,
    ["User"]
  ); 
  // Count all users with role 'User'

  const totalusers = parseInt(totalUsersResult.rows[0].count); 
  // Convert count from string to integer

  // -------------------------
  // 3️⃣ Calculate OFFSET for Pagination
  // -------------------------
  const offset = (page - 1) * 10; 
  // Calculate how many users to skip based on current page (10 users per page)

  // -------------------------
  // 4️⃣ Fetch Users for Current Page
  // -------------------------
  const users = await database.query(
    `SELECT * FROM users WHERE role = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    ["User", 10, offset]
  ); 
  // Fetch users with role 'User', order newest first, limit to 10 per page, skip `offset` users

  // -------------------------
  // 5️⃣ Send JSON Response
  // -------------------------
  res.status(200).json({
    success: true,           // Status flag
    totalusers,              // Total number of users in DB
    currentPage: page,       // Current page requested
    users: users.rows,       // Array of user objects for current page
  });
});

// DELETE USER
export const deleteUser = AsyncHandler(async (req, res, next) => {

    const { id } = req.params;

    console.log("Deleting user with ID:", id);

    // Delete the user and return deleted row
    const deletedUser = await database.query(
        `DELETE FROM users WHERE id = $1 RETURNING *`,
        [id]
    );

    if (deletedUser.rows.length === 0) {
        console.log("No user found in DB for ID:", id);
        return next(new ErrorHandler("User not Found", 404));
    }

    const avatar = deletedUser.rows[0].avatar;

    // Remove avatar from Cloudinary if exists
    if (avatar?.public_id) {
        await cloudinary.uploader.destroy(avatar.public_id);
    }

    res.status(200).json({
        success: true,
        message: "User deleted Successfully",
    });

});


// ADMIN DASHBOARD
export const dashboardStats = AsyncHandler(async (req, res, next) => {
  // -------------------------
  // 1️⃣ Date Setup
  // -------------------------
  const today = new Date(); // Current date and time
  const todayDate = today.toISOString().split("T")[0]; // Format YYYY-MM-DD for SQL

  const yesterday = new Date(today); // Copy today
  yesterday.setDate(today.getDate() - 1); // Set to yesterday
  const yesterdayDate = yesterday.toISOString().split("T")[0]; // Format YYYY-MM-DD

  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1); // 1st day of current month
  const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0); // Last day of current month

  const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1); // 1st day of previous month
  const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0); // Last day of previous month

  // -------------------------
  // 2️⃣ Total Revenue All Time
  // -------------------------
  const totalRevenueAllTimeQuery = await database.query(`
    SELECT SUM(total_price) FROM orders WHERE paid_at IS NOT NULL    
  `); // Sum of all paid orders
  const totalRevenueAllTime =
    parseFloat(totalRevenueAllTimeQuery.rows[0].sum) || 0; // Ensure 0 if null

  // -------------------------
  // 3️⃣ Total Users
  // -------------------------
  const totalUsersCountQuery = await database.query(`
    SELECT COUNT(*) FROM users WHERE role = 'User'
  `); // Count all users with role 'User'
  const totalUsersCount = parseInt(totalUsersCountQuery.rows[0].count) || 0;

  // -------------------------
  // 4️⃣ Orders Status Counts
  // -------------------------
  const orderStatusCountsQuery = await database.query(`
    SELECT order_status, COUNT(*) FROM orders WHERE paid_at IS NOT NULL GROUP BY order_status
  `); // Count of orders by status (Processing, Shipped, etc.)

  // Initialize default counts
  const orderStatusCounts = {
    Processing: 0,
    Shipped: 0,
    Delivered: 0,
    Cancelled: 0,
  };

  // Fill counts from query results
  orderStatusCountsQuery.rows.forEach((row) => {
    orderStatusCounts[row.order_status] = parseInt(row.count);
  });

  // -------------------------
  // 5️⃣ Today's Revenue
  // -------------------------
  const todayRevenueQuery = await database.query(
    `
    SELECT SUM(total_price) FROM orders WHERE created_at::date = $1 AND paid_at IS NOT NULL
  `,
    [todayDate]
  ); // Sum of all paid orders for today
  const todayRevenue = parseFloat(todayRevenueQuery.rows[0].sum) || 0;

  // -------------------------
  // 6️⃣ Yesterday's Revenue
  // -------------------------
  const yesterdayRevenueQuery = await database.query(
    `
    SELECT SUM(total_price) FROM orders WHERE created_at::date = $1 AND paid_at IS NOT NULL  
  `,
    [yesterdayDate]
  ); // Sum of all paid orders for yesterday
  const yesterdayRevenue = parseFloat(
    yesterdayRevenueQuery.rows[0].sum
  ) || 0;

  // -------------------------
  // 7️⃣ Monthly Sales for Line Chart
  // -------------------------
  const monthlySalesQuery = await database.query(`
    SELECT
      TO_CHAR(created_at, 'Mon YYYY') AS month,
      DATE_TRUNC('month', created_at) as date,
      SUM(total_price) as totalsales
    FROM orders 
    WHERE paid_at IS NOT NULL
    GROUP BY month, date
    ORDER BY date ASC
  `); // Aggregate monthly sales for chart
  const monthlySales = monthlySalesQuery.rows.map((row) => ({
    month: row.month,
    totalsales: parseFloat(row.totalsales) || 0,
  }));

  // -------------------------
  // 8️⃣ Top 5 Most Sold Products
  // -------------------------
  const topSellingProductsQuery = await database.query(`
    SELECT p.name,
      p.images->0->>'url' AS image,
      p.category,
      p.ratings,
      SUM(oi.quantity) AS total_sold
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.paid_at IS NOT NULL
    GROUP BY p.name, p.images, p.category, p.ratings
    ORDER BY total_sold DESC
    LIMIT 5
  `); // Top 5 products sold by quantity
  const topSellingProducts = topSellingProductsQuery.rows;

  // -------------------------
  // 9️⃣ Total Sales of Current Month
  // -------------------------
  const currentMonthSalesQuery = await database.query(
    `
      SELECT SUM(total_price) AS total 
      FROM orders 
      WHERE paid_at IS NOT NULL AND created_at BETWEEN $1 AND $2  
    `,
    [currentMonthStart, currentMonthEnd]
  );
  const currentMonthSales =
    parseFloat(currentMonthSalesQuery.rows[0].total) || 0;

  // -------------------------
  // 🔟 Products with low stock (<=5)
  // -------------------------
  const lowStockProductsQuery = await database.query(`
    SELECT name, stock FROM products WHERE stock <= 5 
  `);
  const lowStockProducts = lowStockProductsQuery.rows;

  // -------------------------
  // 11️⃣ Revenue Growth Rate (%)
  // -------------------------
  const lastMonthRevenueQuery = await database.query(
    `
      SELECT SUM(total_price) AS total 
      FROM orders
      WHERE paid_at IS NOT NULL AND created_at BETWEEN $1 AND $2
    `,
    [previousMonthStart, previousMonthEnd]
  );
  const lastMonthRevenue = parseFloat(lastMonthRevenueQuery.rows[0].total) || 0;

  let revenueGrowth = "0%";
  if (lastMonthRevenue > 0) {
    const growthRate =
      ((currentMonthSales - lastMonthRevenue) / lastMonthRevenue) * 100;
    revenueGrowth = `${growthRate >= 0 ? "+" : ""}${growthRate.toFixed(2)}%`;
  }

  // -------------------------
  // 12️⃣ New Users This Month
  // -------------------------
  const newUsersThisMonthQuery = await database.query(
    `
    SELECT COUNT(*) FROM users WHERE created_at >= $1 AND role = 'User'
  `,
    [currentMonthStart]
  );
  const newUsersThisMonth =
    parseInt(newUsersThisMonthQuery.rows[0].count) || 0;

  // -------------------------
  // 13️⃣ FINAL RESPONSE
  // -------------------------
  res.status(200).json({
    success: true,
    message: "Dashboard Stats Fetched Successfully",
    totalRevenueAllTime,
    todayRevenue,
    yesterdayRevenue,
    totalUsersCount,
    orderStatusCounts,
    monthlySales,
    currentMonthSales,
    topSellingProducts,
    lowStockProducts,
    revenueGrowth,
    newUsersThisMonth,
  });
});

