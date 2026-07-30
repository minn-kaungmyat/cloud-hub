"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
    const { rows: accounts } = await pool.query("SELECT id, user_id FROM cloud_accounts WHERE provider = 'google-drive' LIMIT 1");
    if (accounts.length === 0)
        return console.log('No account');
    const account = accounts[0];
    const token = jsonwebtoken_1.default.sign({ id: account.user_id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });
    console.log('JWT:', token);
    console.log(`Syncing account ${account.id}...`);
    const res = await fetch(`http://localhost:3000/api/files/sync/${account.id}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    console.log('Status:', res.status);
    console.log(await res.text());
}
run().catch(console.error).finally(() => pool.end());
