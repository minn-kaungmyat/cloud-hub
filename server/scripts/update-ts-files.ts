import { config } from 'dotenv';
config();
import { prisma } from '../src/database/prisma';

async function main() {
  const tsFiles = await prisma.file.findMany({
    where: {
      name: {
        endsWith: '.ts'
      }
    }
  });

  let updatedCount = 0;
  for (const file of tsFiles) {
    if (file.size > 5 * 1024 * 1024) { // > 5MB
      await prisma.file.update({
        where: { id: file.id },
        data: { mimeType: 'video/mp2t' }
      });
      updatedCount++;
    } else {
      await prisma.file.update({
        where: { id: file.id },
        data: { mimeType: 'application/typescript' }
      });
      updatedCount++;
    }
  }

  console.log(`Successfully updated ${updatedCount} .ts files!`);
}

main().catch(console.error);
