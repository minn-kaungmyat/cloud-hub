import { prisma } from './database/prisma';
import { fileService } from './services/file.service';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const accounts = await prisma.cloudAccount.findMany();
  console.log(`Found ${accounts.length} accounts`);
  
  for (const account of accounts) {
    console.log(`Syncing account: ${account.id}`);
    const synced = await fileService.syncFiles(account.id, account.userId);
    console.log(`Synced ${synced} files`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
