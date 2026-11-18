const mongoose = require('mongoose');

const productVariantSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    sku: { type: String, required: true, unique: true, trim: true, uppercase: true },
    colorName: { type: String, required: true, trim: true },
    colorHex: { type: String, required: true, trim: true, default: '#1C1C1A' },
    size: {
      type: String,
      required: true,
      enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'ONESIZE'],
      index: true,
    },
    priceDelta: {
      type: Number,
      default: 0,
      validate: Number.isSafeInteger,
    },
    stock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
    },
    ropThreshold: {
      type: Number,
      default: 10,
      min: 0,
      validate: Number.isSafeInteger,
    },
    images: [
      {
        url: { type: String, required: true },
        public_id: { type: String, default: '' },
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  },
);

productVariantSchema.index({ productId: 1, colorName: 1, size: 1 }, { unique: true });
productVariantSchema.index({ productId: 1, isActive: 1, stock: -1 });

module.exports = mongoose.model('ProductVariant', productVariantSchema);
