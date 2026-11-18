const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/', campaignController.list);
router.get('/:idOrSlug', campaignController.getDetail);
router.post('/', authMiddleware.authenticate, authMiddleware.requireAdmin, campaignController.create);
router.patch(
  '/:_id/stage',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  campaignController.updateStage,
);
router.post(
  '/:_id/trigger-moq-refund',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  campaignController.triggerMoqFailedRefund,
);

module.exports = router;
