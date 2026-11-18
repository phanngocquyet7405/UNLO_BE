const mongoose = require('mongoose');

const returnRequestSchema = new mongoose.Schema(
  {
    rmaCode: { type: String, required: true, unique: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['exchange_size', 'refund'],
      required: true,
      default: 'exchange_size',
    },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        productName: { type: String, required: true },
        originalVariantId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ProductVariant',
          default: null,
        },
        originalVariantSummary: { type: String, default: '' },
        targetVariantId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'ProductVariant',
          default: null,
        },
        targetVariantSummary: { type: String, default: '' },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, default: 0, min: 0 },
      },
    ],
    reason: {
      type: String,
      enum: ['wrong_size', 'fit_preference', 'fabric_defect', 'stitch_defect', 'wrong_item', 'other'],
      required: true,
    },
    note: { type: String, maxlength: 1000, default: '' },
    evidenceImages: [{ type: String }],
    status: {
      type: String,
      enum: ['requested', 'approved', 'item_received', 'completed', 'rejected'],
      default: 'requested',
      index: true,
    },
    refundAmount: { type: Number, default: 0, min: 0 },
    linkedRefundId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReceiptRefund', default: null },
    adminNote: { type: String, default: '' },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    processedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

returnRequestSchema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model('ReturnRequest', returnRequestSchema);
