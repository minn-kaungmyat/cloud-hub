import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  await pool.query("UPDATE files SET has_thumbnail = true WHERE mime_type LIKE 'image/%' OR mime_type LIKE '%pdf%';");
  console.log("Updated thumbnails in DB");
}

run().finally(() => pool.end());
