"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("./database/prisma");
async function reset() {
    console.log('Deleting all files...');
    await prisma_1.prisma.file.deleteMany();
    console.log('Resetting sync tokens...');
    await prisma_1.prisma.cloudAccount.updateMany({
        data: {
            syncToken: null,
            syncStatus: 'idle',
            fileCount: 0
        }
    });
    console.log('Done!');
}
reset()
    .then(() => process.exit(0))
    .catch(e => {
    console.error(e);
    process.exit(1);
});
