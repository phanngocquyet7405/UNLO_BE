const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware.authenticate);
router.use(authMiddleware.requireAdmin);

router.get('/analytics/unit-economics', analyticsController.unitEconomics);
router.get('/personalization-queue', analyticsController.personalizationQueue);
router.patch('/personalization-queue/:orderId/:lineId', analyticsController.updatePersonalizationStatus);

module.exports = router;
