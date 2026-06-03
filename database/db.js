import { config } from "dotenv";
import pkg from "pg";
const { Pool } = pkg;

config();

export const database = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  const client = await database.connect();
  console.log("Connected to the Database Successfully");
  client.release();
} catch (error) {
  console.log("Database Connection Failed:", error);
  process.exit(1);
}