import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const { rows: accounts } = await pool.query("SELECT id, user_id FROM cloud_accounts WHERE provider = 'google-drive' LIMIT 1");
  if (accounts.length === 0) return console.log('No account');
  const account = accounts[0];

  const token = jwt.sign({ id: account.user_id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });
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
