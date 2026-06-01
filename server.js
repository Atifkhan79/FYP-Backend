import { app } from "./app.js";
import {v2 as cloudinary} from 'cloudinary'

cloudinary.config({
  cloud_name: "dlerqh6wh",
  api_key:"414781631326826",
  api_secret:"piyLQlu5Xi4_ZfC_bzqTRqnHf4E"
});


app.listen(process.env.PORT,()=>{
    console.log(`Server is Running on port: ${process.env.PORT}`);
    
})