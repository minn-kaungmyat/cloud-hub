const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.file.updateMany({
    where: { parentId: 'root' },
    data: { parentId: null }
  });
  console.log(`Updated ${result.count} files.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
