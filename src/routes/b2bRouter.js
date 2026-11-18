const express = require('express');
const router = express.Router();
const b2bController = require('../controllers/b2bController');
const authMiddleware = require('../middleware/authMiddleware');

// Optional auth middleware for RFQ submission so logged-in B2B accounts link automatically
const optionalAuth = (req, res, next) => {
  if (!req.cookies?.token && !req.headers.authorization) return next();
  return authMiddleware.authenticate(req, res, (err) => {
    if (err) return next();
    next();
  });
};

router.post('/quotes', optionalAuth, b2bController.submitQuote);
router.get('/my-quotes', authMiddleware.authenticate, b2bController.myQuotes);
router.get(
  '/admin/quotes',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  b2bController.adminList,
);
router.patch(
  '/admin/quotes/:_id',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  b2bController.adminUpdate,
);

module.exports = router;
