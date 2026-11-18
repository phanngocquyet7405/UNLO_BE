const express = require('express');
const router = express.Router();
const returnController = require('../controllers/returnController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/', authMiddleware.authenticate, returnController.createRequest);
router.get('/my-returns', authMiddleware.authenticate, returnController.myReturns);
router.get(
  '/admin',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  returnController.adminList,
);
router.patch(
  '/admin/:_id',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  returnController.adminProcess,
);

module.exports = router;
