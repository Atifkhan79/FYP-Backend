import express, { urlencoded } from "express";
import { config } from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createTables } from "./utils/createTables.js";
import { errorMiddleWare } from "./middleWare/errorMiddleWare.js";
import userRouter from "./Routes/userRouter.js";
import { productRouter } from "./Routes/productRouter.js";
import fileUpload from "express-fileupload";
import { adminRouter } from "./Routes/adminRouter.js";
import Stripe from "stripe";
import { database } from "./database/db.js";
import { orderRouter } from "./Routes/orderRouter.js";

export const app = express();

config();

app.use(
  cors({
    origin: [process.env.FRONTEND_URL, process.env.DASHBOARD_URL],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);

app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "./uploads", // folder must exist
    createParentPath: true,
  }),
);

// Stripe
app.post(
  "/api/v1/payment/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = Stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (error) {
      return res.status(400).send(`Webhook Error: ${error.message || error}`);
    }

    // Handling the event
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent_client_secret = event.data.object.client_secret;

      try {
        // Update payment status
        const updatedPaymentStatus = "Paid";
        const paymentTableUpdateResult = await database.query(
          `UPDATE payments SET payment_status = $1 WHERE payment_intent_id = $2 RETURNING *`,
          [updatedPaymentStatus, paymentIntent_client_secret],
        );

        if (paymentTableUpdateResult.rows.length === 0) {
          return res.status(404).send("Payment record not found.");
        }

        const orderId = paymentTableUpdateResult.rows[0].order_id;

        // Update order paid timestamp
        await database.query(
          `UPDATE orders SET paid_at = NOW() WHERE id = $1 RETURNING *`,
          [orderId],
        );

        // Reduce stock for each ordered item
        const { rows: orderItems } = await database.query(
          `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
          [orderId],
        );

        for (const item of orderItems) {
          await database.query(
            `UPDATE products SET stock = stock - $1 WHERE id = $2`,
            [item.quantity, item.product_id],
          );
        }
      } catch (error) {
        console.error("Error processing payment webhook:", error);
        return res.status(500).send("Internal Server Error");
      }
    }

    res.status(200).send({ received: true });
  },
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api/v1/user", userRouter);
app.use("/api/v1/products", productRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/order",orderRouter)

createTables();
app.use(errorMiddleWare);
