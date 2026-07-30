"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
    await pool.query("UPDATE files SET has_thumbnail = true WHERE mime_type LIKE 'image/%' OR mime_type LIKE '%pdf%';");
    console.log("Updated thumbnails in DB");
}
run().finally(() => pool.end());
