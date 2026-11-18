const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
        campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', default: null },
        subscriptionPlanId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'SubscriptionTemplate',
        },
        boxId: { type: mongoose.Schema.Types.ObjectId, ref: 'Box' },
        bundleSelections: [
          {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
            variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant' },
          },
        ],
        quantity: { type: Number },
        lineId: String,
        gift: {
          wrap: { type: String, enum: ['none', 'classic', 'eco', 'premium'], default: 'none' },
          message: { type: String, maxlength: 500, default: '' },
        },
        customization: {
          enabled: { type: Boolean, default: false },
          monogramText: { type: String, maxlength: 5, default: '' },
          font: {
            type: String,
            enum: ['serif_minimal', 'sans_architect', 'italic_atelier'],
            default: 'serif_minimal',
          },
          threadColor: { type: String, maxlength: 40, default: '' },
          placement: {
            type: String,
            enum: ['none', 'left_cuff', 'hem', 'inner_neck', 'chest_pocket'],
            default: 'none',
          },
          innerLabelText: { type: String, maxlength: 30, default: '' },
          giftBoxType: {
            type: String,
            enum: ['none', 'minimal_kraft', 'atelier_linen'],
            default: 'none',
          },
          giftNote: { type: String, maxlength: 250, default: '' },
        },
      },
    ],
    totalPrice: { type: Number, required: true },
    isSubscribeCart: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  },
);

cartSchema.index({ userId: 1, isSubscribeCart: 1 }, { unique: true });
module.exports = mongoose.model('Cart', cartSchema);
