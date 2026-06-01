import { database } from "../database/db.js";
import Stripe from "stripe";

const stripe = new Stripe("sk_test_51Sk6fpGEnnZFi8I3V9WyZCP0EB4Bb037rwtEYu0aB2kcO8loZAIgYanaQwMmirwHISIBc6Hi228cplGQs3vYeuUp00bxDrFynP");

export async function generatePaymentIntent(orderId, totalPrice) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalPrice * 100), // ensure integer
      currency: "USD",
    });

    await database.query(
      `INSERT INTO payments(order_id, payment_type, payment_status, payment_intent_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [orderId, "Online", "Pending", paymentIntent.client_secret]
    );

    return { success: true, clientSecret: paymentIntent.client_secret };
  } catch (error) {
    console.error("Payment Error:", error);
    return { success: false, message: "Payment Failed" };
  }
}