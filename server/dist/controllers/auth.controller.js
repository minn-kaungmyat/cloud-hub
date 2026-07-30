"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const auth_service_1 = require("../services/auth.service");
const asyncHandler_1 = require("../utils/asyncHandler");
class AuthController {
    static register = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const result = await auth_service_1.AuthService.registerUser(req.body);
        res.status(201).json({
            status: 'success',
            data: result,
        });
    });
    static login = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const result = await auth_service_1.AuthService.loginUser(req.body);
        res.status(200).json({
            status: 'success',
            data: result,
        });
    });
    static me = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        // req.user is attached by the requireAuth middleware
        const user = req.user;
        if (user) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { password, ...userWithoutPassword } = user;
            res.status(200).json({
                status: 'success',
                data: {
                    user: userWithoutPassword,
                },
            });
        }
    });
}
exports.AuthController = AuthController;
