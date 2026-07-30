import { Router } from 'express';
import { cloudAccountController } from '../controllers/cloudAccount.controller';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

// OAuth flow routes (not using requireAuth because they are browser redirects)
router.get('/auth/:provider', cloudAccountController.authRedirect);
router.get('/callback/:provider', cloudAccountController.callback);

// Management routes
router.get('/', requireAuth, cloudAccountController.getAccounts);
router.delete('/:id', requireAuth, cloudAccountController.deleteAccount);

export default router;
