import 'dotenv/config';
import { fileService } from './src/services/file.service';
import { prisma } from './src/database/prisma';

async function run() {
  const accounts = await prisma.cloudAccount.findMany();
  console.log('Found accounts:', accounts.length);
  for (const acc of accounts) {
    try {
      console.log('Syncing account:', acc.id);
      const res = await fileService.syncFiles(acc.id, acc.userId);
      console.log('Synced files:', res.count);
      
      // Verify the fix
      const rootFolders = await prisma.file.findMany({
        where: { parentId: null, isFolder: true, isShared: false, cloudAccountId: acc.id },
        select: { name: true },
        orderBy: { name: 'asc' },
      });
      console.log('\n=== Root folders (parentId=null, isShared=false) ===');
      rootFolders.forEach(f => console.log('  ', f.name));
      console.log('Total root folders:', rootFolders.length);

      const sharedCount = await prisma.file.count({ where: { isShared: true, cloudAccountId: acc.id } });
      console.log('\nShared-with-me files:', sharedCount);
    } catch(e) {
      console.error('Error syncing:', e);
    }
  }
}
run().catch(console.error);
