const mongoose = require('mongoose');

const b2bQuoteSchema = new mongoose.Schema(
  {
    quoteCode: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    companyName: { type: String, required: true, trim: true, maxlength: 200 },
    taxCode: { type: String, trim: true, maxlength: 40, default: '' },
    contactName: { type: String, required: true, trim: true, maxlength: 120 },
    contactEmail: { type: String, required: true, trim: true, lowercase: true },
    contactPhone: { type: String, required: true, trim: true, maxlength: 30 },
    useCase: {
      type: String,
      enum: ['corporate_uniform', 'onboarding_kit', 'client_gifting', 'event_merch', 'other'],
      default: 'corporate_uniform',
    },
    brandingStyle: {
      type: String,
      enum: ['subtle_cuff', 'subtle_hem', 'inner_woven_label', 'gift_box_emboss', 'custom'],
      default: 'subtle_cuff',
    },
    logoFileUrl: { type: String, default: '' },
    logoPublicId: { type: String, default: '' },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
        productName: { type: String, required: true, trim: true },
        quantity: { type: Number, required: true, min: 10 },
        colorPreference: { type: String, default: '' },
        sizeBreakdown: { type: String, default: '' },
        unitQuotePrice: { type: Number, default: 0, min: 0 },
      },
    ],
    totalEstimatedQty: { type: Number, default: 0, min: 0 },
    targetDeliveryDate: { type: Date, default: null },
    notes: { type: String, maxlength: 2000, default: '' },
    status: {
      type: String,
      enum: [
        'submitted',
        'reviewing',
        'quoted',
        'deposit_pending',
        'in_production',
        'delivered',
        'completed',
        'rejected',
      ],
      default: 'submitted',
      index: true,
    },
    quotedTotalAmount: { type: Number, default: 0, min: 0 },
    depositPercent: { type: Number, default: 50, min: 0, max: 100 },
    depositPaidAmount: { type: Number, default: 0, min: 0 },
    balancePaidAmount: { type: Number, default: 0, min: 0 },
    paymentTerms: {
      type: String,
      default: 'Đặt cọc 50% khi ký xác nhận, 50% khi nghiệm thu giao hàng',
    },
    adminNotes: { type: String, default: '' },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    statusHistory: [
      {
        status: { type: String, required: true },
        note: { type: String, default: '' },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      },
    ],
  },
  {
    timestamps: true,
  },
);

b2bQuoteSchema.index({ createdAt: -1 });
module.exports = mongoose.model('B2BQuote', b2bQuoteSchema);
