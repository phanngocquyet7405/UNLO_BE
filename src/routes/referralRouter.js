const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/me', authMiddleware.authenticate, referralController.getMyProfile);
router.get('/validate/:code', referralController.validateCode);
router.get(
  '/admin/profiles',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  referralController.adminProfiles,
);
router.patch(
  '/admin/profiles/:_id',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  referralController.adminUpdateProfile,
);
router.get(
  '/admin/commissions',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  referralController.adminCommissions,
);
router.patch(
  '/admin/commissions/:_id/pay',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  referralController.adminPayCommission,
);

module.exports = router;
