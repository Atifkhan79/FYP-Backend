import { config } from "dotenv";
import pkg from "pg";
const { Pool } = pkg;  // ← Pool, not Client

config();

export const database = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false  // ← removed "secure: true", it's not valid
  }
});

// Test connection
try {
  const client = await database.connect();
  console.log('Connected to the Database Successfully');
  client.release();  // ← important: release back to pool
} catch (error) {
  console.log("Database Connection Failed: ", error);
  process.exit(1);
}