import { app } from "./app.js";
import {v2 as cloudinary} from 'cloudinary'
import { config } from "dotenv";

config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Only listen locally, not on Vercel
if (process.env.NODE_ENV !== 'production') {
  app.listen(process.env.PORT, () => {
    console.log(`Server is Running on port: ${process.env.PORT}`);
  });
}

export default app;  // ← Vercel needs this