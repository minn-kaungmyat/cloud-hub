"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("./database/prisma");
const file_service_1 = require("./services/file.service");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
async function run() {
    const accounts = await prisma_1.prisma.cloudAccount.findMany();
    console.log(`Found ${accounts.length} accounts`);
    for (const account of accounts) {
        console.log(`Syncing account: ${account.id}`);
        const synced = await file_service_1.fileService.syncFiles(account.id, account.userId);
        console.log(`Synced ${synced} files`);
    }
}
run().catch(console.error).finally(() => prisma_1.prisma.$disconnect());
