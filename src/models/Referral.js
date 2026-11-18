const mongoose = require('mongoose');

const referralProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    tier: {
      type: String,
      enum: ['member', 'stylist', 'kol_partner'],
      default: 'member',
    },
    commissionPercent: { type: Number, default: 8, min: 0, max: 30 },
    refereeDiscountPercent: { type: Number, default: 5, min: 0, max: 30 },
    totalClicks: { type: Number, default: 0, min: 0 },
    totalOrders: { type: Number, default: 0, min: 0 },
    totalRevenueGenerated: { type: Number, default: 0, min: 0 },
    totalCommissionEarned: { type: Number, default: 0, min: 0 },
    totalCommissionPaid: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const referralCommissionSchema = new mongoose.Schema(
  {
    profileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReferralProfile',
      required: true,
      index: true,
    },
    affiliateUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    buyerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    orderCode: { type: String, required: true },
    orderAmount: { type: Number, required: true, min: 0 },
    commissionRate: { type: Number, required: true, min: 0 },
    commissionAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'paid', 'cancelled'],
      default: 'pending',
      index: true,
    },
    payoutReference: { type: String, default: '' },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = {
  ReferralProfile: mongoose.model('ReferralProfile', referralProfileSchema),
  ReferralCommission: mongoose.model('ReferralCommission', referralCommissionSchema),
};
