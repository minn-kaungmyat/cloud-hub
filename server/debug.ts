import 'dotenv/config';
import { prisma } from './src/database/prisma';

async function run() {
  // 1. Check what parentIds root-level Google Drive folders have
  const rootFolders = await prisma.file.findMany({
    where: { isFolder: true },
    select: { name: true, parentId: true, isShared: true, providerFileId: true },
    orderBy: { name: 'asc' },
  });

  // Find distinct parentIds that don't correspond to any file in the DB
  const allProviderIds = new Set(rootFolders.map(f => f.providerFileId));
  const orphanParentIds = new Set<string>();
  for (const f of rootFolders) {
    if (f.parentId && !allProviderIds.has(f.parentId)) {
      orphanParentIds.add(f.parentId);
    }
  }
  
  console.log('=== Orphan Parent IDs (not matching any file in DB) ===');
  for (const pid of orphanParentIds) {
    const count = await prisma.file.count({ where: { parentId: pid } });
    console.log(`  ${pid} -> ${count} files`);
  }

  // 2. Check the 6 folders that currently show with parentId=null
  const nullParentFolders = await prisma.file.findMany({
    where: { parentId: null, isFolder: true },
    select: { name: true, isShared: true },
    orderBy: { name: 'asc' },
  });
  console.log('\n=== Folders with parentId=null (what CloudHub shows at root) ===');
  nullParentFolders.forEach(f => console.log(`  ${f.name} | shared: ${f.isShared}`));
  
  // 3. Count shared status
  const sharedCount = await prisma.file.count({ where: { isShared: true } });
  const notSharedCount = await prisma.file.count({ where: { isShared: false } });
  console.log(`\n=== Shared Stats ===`);
  console.log(`  isShared=true: ${sharedCount}`);
  console.log(`  isShared=false: ${notSharedCount}`);

  // 4. Check some of the null-parent files (non-folder)
  const nullParentFiles = await prisma.file.findMany({
    where: { parentId: null, isFolder: false },
    select: { name: true, isShared: true, mimeType: true },
    take: 10,
    orderBy: { name: 'asc' },
  });
  console.log(`\n=== Files with parentId=null (first 10) ===`);
  nullParentFiles.forEach(f => console.log(`  ${f.name} | shared: ${f.isShared} | mime: ${f.mimeType}`));
  
  process.exit(0);
}

run().catch(console.error);
