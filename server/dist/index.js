"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const pino_1 = __importDefault(require("pino"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const cloudAccount_routes_1 = __importDefault(require("./routes/cloudAccount.routes"));
const file_routes_1 = __importDefault(require("./routes/file.routes"));
const errorHandler_1 = require("./middlewares/errorHandler");
const app = (0, express_1.default)();
const logger = (0, pino_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const PORT = process.env.PORT || 3000;
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
// API Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/cloud-accounts', cloudAccount_routes_1.default);
app.use('/api/files', file_routes_1.default);
// Global Error Handler (must be last)
app.use(errorHandler_1.errorHandler);
app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
});
