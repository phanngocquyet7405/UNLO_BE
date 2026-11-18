const mongoose = require('mongoose');
const slug = require('mongoose-slug-updater');

const pricingTierSchema = new mongoose.Schema(
  {
    minQty: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    unitPrice: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    label: { type: String, default: '' },
  },
  { _id: false },
);

const campaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, slug: 'title', unique: true },
    type: {
      type: String,
      enum: ['group_buy', 'pre_order'],
      required: true,
      default: 'group_buy',
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    factoryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      default: null,
    },
    description: { type: String, default: '' },
    coverImage: { type: String, default: '' },
    moqTarget: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    maxCapQty: { type: Number, default: 1000, min: 1, validate: Number.isSafeInteger },
    currentOrderedQty: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    participantCount: { type: Number, default: 0, min: 0 },
    pricingTiers: {
      type: [pricingTierSchema],
      default: [],
    },
    baseUnitPrice: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    depositPercent: { type: Number, default: 100, min: 10, max: 100 },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    estimatedShipDate: { type: Date, required: true },
    status: {
      type: String,
      enum: [
        'draft',
        'active',
        'moq_reached',
        'fabric_sourcing',
        'sewing',
        'qc_checking',
        'shipping',
        'completed',
        'cancelled_moq_failed',
      ],
      default: 'active',
      index: true,
    },
    productionUpdates: [
      {
        stage: { type: String, required: true },
        note: { type: String, default: '' },
        imageUrl: { type: String, default: '' },
        updatedAt: { type: Date, default: Date.now },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      },
    ],
    refundTriggeredAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  },
);

campaignSchema.index({ status: 1, endAt: 1 });
campaignSchema.methods.resolveCurrentUnitPrice = function resolveCurrentUnitPrice(extraQty = 0) {
  const projectedQty = (this.currentOrderedQty || 0) + extraQty;
  const tiers = [...(this.pricingTiers || [])].sort((a, b) => b.minQty - a.minQty);
  const matched = tiers.find((t) => projectedQty >= t.minQty);
  return matched ? matched.unitPrice : this.baseUnitPrice;
};

mongoose.plugin(slug);
module.exports = mongoose.model('Campaign', campaignSchema);
