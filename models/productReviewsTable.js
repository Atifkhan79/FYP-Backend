import { database } from "../database/db.js";

export async function createProductReviewsTable() {
  try {
    const query = `
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        product_id UUID NOT NULL,
        user_id UUID NOT NULL,
        rating REAL NOT NULL CHECK (rating BETWEEN 0 AND 5),
        comment TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `;

    await database.query(query);

    // 🔥 Performance index
    await database.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_product_id
      ON reviews(product_id);
    `);

    console.log("✅ Reviews table created successfully");
  } catch (error) {
    console.error("❌ Failed To Create Reviews Table.", error);
    process.exit(1);
  }
}