"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../database/prisma");
const AppError_1 = require("../utils/AppError");
const signToken = (id) => {
    const options = {
        expiresIn: '7d',
    };
    return jsonwebtoken_1.default.sign({ id }, process.env.JWT_SECRET, options);
};
class AuthService {
    static async registerUser(input) {
        const { email, name, password } = input;
        const existingUser = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            throw new AppError_1.AppError('Email already in use', 409);
        }
        const hashedPassword = await bcrypt_1.default.hash(password, 12);
        const user = await prisma_1.prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                avatar: name.charAt(0).toUpperCase(),
            },
        });
        const token = signToken(user.id);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password: _, ...userWithoutPassword } = user;
        return { user: userWithoutPassword, token };
    }
    static async loginUser(input) {
        const { email, password } = input;
        const user = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (!user || !(await bcrypt_1.default.compare(password, user.password))) {
            throw new AppError_1.AppError('Incorrect email or password', 401);
        }
        const token = signToken(user.id);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password: _, ...userWithoutPassword } = user;
        return { user: userWithoutPassword, token };
    }
}
exports.AuthService = AuthService;
