
import pkg from "pg";
const { Client } = pkg;

export const database = new Client({
  user: 'postgres',
  host: "localhost",
  database:"ecommerce_store",
  password: "Allah300300",
  port: 5432,
});


try {
    await database.connect()
    console.log('Connected to the Database Successfully ');
    
} catch (error) {
    console.log("Database Connection Failed: ",error);
    process.exit(1)
    
}