"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cloudAccount_controller_1 = require("../controllers/cloudAccount.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = (0, express_1.Router)();
// OAuth flow routes (not using requireAuth because they are browser redirects)
router.get('/auth/:provider', cloudAccount_controller_1.cloudAccountController.authRedirect);
router.get('/callback/:provider', cloudAccount_controller_1.cloudAccountController.callback);
// Management routes
router.get('/', requireAuth_1.requireAuth, cloudAccount_controller_1.cloudAccountController.getAccounts);
router.delete('/:id', requireAuth_1.requireAuth, cloudAccount_controller_1.cloudAccountController.deleteAccount);
exports.default = router;
