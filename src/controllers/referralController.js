const crypto = require('crypto');
const { ReferralProfile, ReferralCommission } = require('../models/Referral');
const { fail } = require('../services/pricingService');

function makeCode(name = '') {
  const prefix =
    String(name || 'NULL')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 5) || 'NULL';
  return `${prefix}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

class ReferralController {
  async getMyProfile(req, res, next) {
    try {
      let profile = await ReferralProfile.findOne({ userId: req.userId });
      if (!profile) {
        profile = await ReferralProfile.create({
          userId: req.userId,
          code: makeCode(req.user?.name),
          tier: 'member',
          commissionPercent: 8,
          refereeDiscountPercent: 5,
        });
      }
      const commissions = await ReferralCommission.find({ affiliateUserId: req.userId })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      res.json({ success: true, data: { profile, commissions } });
    } catch (err) {
      next(err);
    }
  }

  async validateCode(req, res, next) {
    try {
      const code = String(req.params.code || '')
        .trim()
        .toUpperCase();
      const profile = await ReferralProfile.findOneAndUpdate(
        { code, isActive: true },
        { $inc: { totalClicks: 1 } },
        { new: true },
      )
        .populate('userId', 'name')
        .lean();
      if (!profile) fail('Mã giới thiệu không tồn tại hoặc đã tạm dừng', 404);
      res.json({
        success: true,
        data: {
          code: profile.code,
          referrerName: profile.userId?.name || 'Thành viên NU:LL',
          tier: profile.tier,
          refereeDiscountPercent: profile.refereeDiscountPercent,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async adminProfiles(req, res, next) {
    try {
      const profiles = await ReferralProfile.find()
        .populate('userId', 'name email role')
        .sort({ totalRevenueGenerated: -1, createdAt: -1 })
        .lean();
      res.json({ success: true, data: profiles });
    } catch (err) {
      next(err);
    }
  }

  async adminUpdateProfile(req, res, next) {
    try {
      const profile = await ReferralProfile.findById(req.params._id);
      if (!profile) fail('Hồ sơ giới thiệu không tồn tại', 404);
      const { tier, commissionPercent, refereeDiscountPercent, isActive } = req.body;
      if (['member', 'stylist', 'kol_partner'].includes(tier)) profile.tier = tier;
      if (commissionPercent !== undefined) profile.commissionPercent = Number(commissionPercent);
      if (refereeDiscountPercent !== undefined)
        profile.refereeDiscountPercent = Number(refereeDiscountPercent);
      if (isActive !== undefined) profile.isActive = Boolean(isActive);
      await profile.save();
      res.json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }

  async adminCommissions(req, res, next) {
    try {
      const list = await ReferralCommission.find()
        .populate('affiliateUserId', 'name email')
        .populate('buyerUserId', 'name email')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
      res.json({ success: true, data: list });
    } catch (err) {
      next(err);
    }
  }

  async adminPayCommission(req, res, next) {
    try {
      const comm = await ReferralCommission.findById(req.params._id);
      if (!comm) fail('Khoản hoa hồng không tồn tại', 404);
      if (comm.status === 'paid') fail('Khoản hoa hồng đã được chi trả trước đó', 409);
      comm.status = 'paid';
      comm.payoutReference = String(req.body.payoutReference || '').trim();
      comm.paidAt = new Date();
      await comm.save();
      await ReferralProfile.findByIdAndUpdate(comm.profileId, {
        $inc: { totalCommissionPaid: comm.commissionAmount },
      });
      res.json({ success: true, data: comm });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ReferralController();
