import { Router } from 'express';
import { fileController } from '../controllers/file.controller';
import { requireAuth } from '../middlewares/requireAuth';
import { upload } from '../middlewares/upload';

const router = Router();

// Protect all file routes
router.use(requireAuth);

router.post('/sync/:accountId', fileController.syncFiles);
router.post('/sync/incremental/:accountId', fileController.incrementalSync);
router.post('/upload/:accountId', upload.single('file'), fileController.uploadFile);
router.get('/search', fileController.searchFiles);
router.get('/folder/:folderId/path', fileController.getFolderPath);
router.post('/browse', fileController.browseFiles);
router.get('/', fileController.getFiles);
router.post('/folder', fileController.createFolder);
router.post('/folders/batch', fileController.createFoldersBatch);
router.get('/:id/thumbnail', fileController.getThumbnail);
router.patch('/:id/rename', fileController.renameFile);
router.patch('/:id/move', fileController.moveFile);
router.get('/:id/download', fileController.downloadFile);
router.delete('/:id', fileController.deleteFile);

export default router;
