const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    rating: { type: Number, required: true, min: 1, max: 5 },
    fitRating: {
      type: String,
      enum: ['runs_small', 'true_to_size', 'runs_large'],
      default: 'true_to_size',
    },
    reviewerHeightCm: { type: Number, min: 100, max: 230, default: null },
    reviewerWeightKg: { type: Number, min: 30, max: 200, default: null },
    purchasedVariantSummary: { type: String, default: '', maxlength: 120 },
    verifiedPurchase: { type: Boolean, default: false },
    comment: { type: String, trim: true, maxlength: 1500 },
    imgs: [
      {
        url: { type: String },
      },
    ],
  },
  {
    timestamps: true,
  },
);

ratingSchema.index({ productId: 1, createdAt: -1 });
ratingSchema.index({ userId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('Rating', ratingSchema);
