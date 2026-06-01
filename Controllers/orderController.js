import ErrorHandler from "../middleWare/errorMiddleWare.js";
import { AsyncHandler } from "../middleWare/AsyncHandler.js";
import { database } from "../database/db.js";
import { generatePaymentIntent } from "../utils/generatePaymentIntent.js";

// Controller to place a new order
export const placeNewOrder = AsyncHandler(async (req, res, next) => {
  // 🔹 Destructure shipping details and cart items from request body
  const {
    full_name,
    state,
    city,
    country,
    address,
    pincode,
    phone,
    orderedItems,
  } = req.body;

  // 🔹 Validate required shipping fields
  if (
    !full_name ||
    !state ||
    !city ||
    !country ||
    !address ||
    !pincode ||
    !phone
  ) {
    return next(
      new ErrorHandler("Please provide complete shipping details.", 400),
    );
  }

  // 🔹 Ensure orderedItems is always an array
  // If coming from form-data it may be a string, so parse it
  const items = Array.isArray(orderedItems)
    ? orderedItems
    : JSON.parse(orderedItems);

  // 🔹 Validate cart is not empty
  if (!items || items.length === 0) {
    return next(new ErrorHandler("No items in cart.", 400));
  }

  // 🔹 Extract product IDs from cart
  const productIds = items.map((item) => item.product.id);

  // 🔹 Fetch product details from database
  const { rows: products } = await database.query(
    `SELECT id, price, stock, name FROM products WHERE id = ANY($1::uuid[])`,
    [productIds],
  );

  // 🔹 Initialize total price
  let total_price = 0;

  // 🔹 Arrays to store bulk insert values and placeholders
  const values = [];
  const placeholders = [];

  // 🔹 Loop through each cart item
  items.forEach((item, index) => {
    // 🔹 Find product from DB that matches cart item
    const product = products.find((p) => p.id === item.product.id);

    // 🔹 If product does not exist
    if (!product) {
      return next(
        new ErrorHandler(`Product not found for ID: ${item.product.id}`, 404),
      );
    }

    // 🔹 Check stock availability
    if (item.quantity > product.stock) {
      return next(
        new ErrorHandler(
          `Only ${product.stock} units available for ${product.name}`,
          400,
        ),
      );
    }

    // 🔹 Calculate total for this item
    const itemTotal = product.price * item.quantity;

    // 🔹 Add to overall order total
    total_price += itemTotal;

    // 🔹 Push values for bulk insert into order_items table
    // First value (null) will later be replaced with orderId
    values.push(
      null, // order_id (will be replaced later)
      product.id,
      item.quantity,
      product.price,
      item.product.images[0].url || "",
      product.name,
    );

    // 🔹 Calculate placeholder offset
    const offset = index * 6;

    // 🔹 Generate placeholders dynamically
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`,
    );
  });

  // 🔹 Define tax rate (18%)
  const tax_price = 0.18;

  // 🔹 Shipping rule (free if order >= $50)
  const shipping_price = total_price >= 50 ? 0 : 2;

  // 🔹 Calculate final total with tax + shipping
  total_price = Math.round(
    total_price + total_price * tax_price + shipping_price,
  );

  // 🔹 Insert order into orders table
  const orderResult = await database.query(
    `INSERT INTO orders (buyer_id, total_price, tax_price, shipping_price)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.user.id, total_price, tax_price, shipping_price],
  );

  // 🔹 Get newly created order ID
  const orderId = orderResult.rows[0].id;

  // 🔹 Replace null order_id values with real orderId
  for (let i = 0; i < values.length; i += 6) {
    values[i] = orderId;
  }

  // 🔹 Insert all cart items into order_items table (bulk insert)
  await database.query(
    `
    INSERT INTO order_items (order_id, product_id, quantity, price, image, title)
    VALUES ${placeholders.join(", ")} RETURNING *
    `,
    values,
  );

  // 🔹 Insert shipping details into shipping_info table
  await database.query(
    `
    INSERT INTO shipping_info
    (order_id, full_name, state, city, country, address, pincode, phone)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `,
    [orderId, full_name, state, city, country, address, pincode, phone],
  );

  // 🔹 Generate Stripe payment intent
  const paymentResponse = await generatePaymentIntent(orderId, total_price);

  // 🔹 If payment intent creation fails
  if (!paymentResponse.success) {
    return next(new ErrorHandler("Payment failed. Try again.", 500));
  }

  // 🔹 Send success response with Stripe client secret
  res.status(200).json({
    success: true,
    message: "Order placed successfully. Please proceed to payment.",
    paymentIntent: paymentResponse.clientSecret,
    total_price,
  });
});

// Contoller to Fetch Single Order 
export const fetchSingleOrder = AsyncHandler(async (req, res, next) => {
  const { orderId } = req.params;

  // Fetch a single order with its items and shipping info
const result = await database.query(`

-- 🔹 Select everything from orders table
SELECT  
    o.*,  

    -- 🔹 Aggregate all order_items into a JSON array
    COALESCE( 
        json_agg( 
            json_build_object( 
                -- Build custom JSON object for each order item
                'order_item_id', oi.id, 
                'order_id', oi.order_id, 
                'product_id', oi.product_id, 
                'quantity', oi.quantity, 
                'price', oi.price 
            ) 
        ) 

        -- 🔹 Prevent null values if no items exist
        FILTER (WHERE oi.id IS NOT NULL), 
        
        -- 🔹 If no items found, return empty array instead of null
        '[]' 
    ) AS order_items, 

    -- 🔹 Create a JSON object for shipping information
    json_build_object( 
        'full_name', s.full_name, 
        'state', s.state, 
        'city', s.city, 
        'country', s.country, 
        'address', s.address, 
        'pincode', s.pincode, 
        'phone', s.phone 
    ) AS shipping_info 

-- 🔹 Main table: orders
FROM orders o 

-- 🔹 Join order_items to orders
LEFT JOIN order_items oi ON o.id = oi.order_id 

-- 🔹 Join shipping_info to orders
LEFT JOIN shipping_info s ON o.id = s.order_id 

-- 🔹 Filter by specific order ID
WHERE o.id = $1 o.paid_at IS NOT NULL

-- 🔹 Required because we are using aggregation (json_agg)
GROUP BY o.id, s.id;
`,[orderId]);

res.status(200).json({
    success : true,
    message : "Order Fetched",
    orders : result.rows[0]
})


});


// 🔹 Controller to fetch My all orders of logged-in user
export const fecthMyOrders = AsyncHandler(async (req,res,next) => {

    // 🔹 Execute SQL query to get orders of current user
    const result  = await database.query(`

    -- 🔹 Select all columns from orders table
    SELECT o.*, 

    -- 🔹 Aggregate all order items into a JSON array
    COALESCE( 
        json_agg( 
            json_build_object( 
                -- 🔹 Build custom JSON object for each order item
                'order_item_id', oi.id, 
                'order_id', oi.order_id, 
                'product_id', oi.product_id, 
                'quantity', oi.quantity, 
                'price', oi.price, 
                'image', oi.image, 
                'title', oi.title 
            )  
        ) 
        
        -- 🔹 Avoid null entries inside aggregation
        FILTER (WHERE oi.id IS NOT NULL), 
        
        -- 🔹 If no order items exist, return empty array instead of null
        '[]' 
    ) AS order_items, 

    -- 🔹 Create a JSON object for shipping details
    json_build_object( 
        'full_name', s.full_name, 
        'state', s.state, 
        'city', s.city, 
        'country', s.country, 
        'address', s.address, 
        'pincode', s.pincode, 
        'phone', s.phone 
    ) AS shipping_info  

    -- 🔹 Main table
    FROM orders o 

    -- 🔹 Join order_items table
    LEFT JOIN order_items oi ON o.id = oi.order_id 

    -- 🔹 Join shipping_info table
    LEFT JOIN shipping_info s ON o.id = s.order_id 

    -- 🔹 Fetch only orders of logged-in user
    WHERE o.buyer_id = $1 

    -- 🔹 Required because json_agg is used
    GROUP BY o.id, s.id

    `,
    // 🔹 Pass logged-in user's ID securely (prevents SQL injection)
    [req.user.id]
    )

    // 🔹 Send success response
    res.status(200).json({
        success : true,
        message : "All your orders are fetched",
        myOrders : result.rows,
    })

})


// 🔹 Controller to fetch all orders (Admin functionality)
export const fetchAllOrders = AsyncHandler(async (req,res,next) => {

    // 🔹 Execute SQL query to retrieve all orders
    const result  = await database.query(`

    -- 🔹 Select all columns from orders table
    SELECT o.*, 

    -- 🔹 Convert related order_items into JSON array
    COALESCE(
        json_agg( 
            json_build_object( 
                -- 🔹 Create structured JSON object for each order item
                'order_item_id', oi.id, 
                'order_id', oi.order_id, 
                'product_id', oi.product_id, 
                'quantity', oi.quantity, 
                'price', oi.price, 
                'image', oi.image, 
                'title', oi.title 
            ) 
        ) 
        
        -- 🔹 Exclude null rows from aggregation
        FILTER (WHERE oi.id IS NOT NULL), 
        
        -- 🔹 Return empty array if no items exist
        '[]'
    ) AS order_items, 

    -- 🔹 Convert shipping_info into nested JSON object
    json_build_object( 
        'full_name', s.full_name, 
        'state', s.state, 
        'city', s.city, 
        'country', s.country, 
        'address', s.address, 
        'pincode', s.pincode, 
        'phone', s.phone  
    ) AS shipping_info 

    -- 🔹 Main table
    FROM orders o 

    -- 🔹 Join order_items table
    LEFT JOIN order_items oi ON o.id = oi.order_id 

    -- 🔹 Join shipping_info table
    LEFT JOIN shipping_info s ON o.id = s.order_id 

    -- 🔹 Required because we are using json_agg (aggregate function)
    GROUP BY o.id, s.id

    `,[])  // 🔹 No parameters needed because we fetch all orders

    // 🔹 Send JSON response
    res.status(200).json({
        success : true,
        message : "All Order Fetched",
        orders: result.rows
    })
})


// 🔹 Controller to update the status of an order (Admin functionality)
export const upadteOrderStatus = AsyncHandler(async (req, res, next) => {

    const { status } = req.body;

    const allowedStatuses = [
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled",
    ];

    if (!status || !allowedStatuses.includes(status)) {
        return next(new ErrorHandler("Provide a valid status for order.", 400));
    }

    const { orderId } = req.params;

    const results = await database.query(`
        SELECT * FROM orders WHERE id = $1
    `, [orderId]);

    if (results.rows.length === 0) {
        return next(new ErrorHandler("Invalid order ID.", 400));
    }

    const updatedOrder = await database.query(`
        UPDATE orders SET order_status = $1 WHERE id = $2
        RETURNING *
    `, [status, orderId]);

    res.status(200).json({
        success: true,
        message: "Order status updated",
        updatedOrder: updatedOrder.rows[0]
    });
});

// 🔹 Controller to delete an order (Admin functionality)
export const deleteOrders = AsyncHandler(async (req,res,next) => {

    // 🔹 Get orderId from URL parameters
    const {orderId} = req.params

    // 🔹 Delete the order from database and return the deleted row
    const results = await database.query(`
        DELETE FROM orders 
        WHERE id = $1 
        RETURNING *
    `,[orderId]) // 🔹 Parameterized query to prevent SQL injection

    // 🔹 If no rows were returned, order ID is invalid
    if (!results || results.rows.length === 0) {
        return next(new ErrorHandler("Invalid order ID",400))
    }

    // 🔹 Send success response with deleted order details
    res.status(200).json({
        success : true,
        message : "Order Deleted.",
        order: results.rows[0]
    })
})