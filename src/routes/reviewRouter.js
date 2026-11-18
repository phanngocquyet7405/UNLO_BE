const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/product/:productId', reviewController.listByProduct);
router.post('/product/:productId', authMiddleware.authenticate, reviewController.upsertReview);
router.delete('/:_id', authMiddleware.authenticate, reviewController.deleteReview);

module.exports = router;
