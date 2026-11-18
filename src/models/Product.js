const mongoose = require('mongoose');
const slug = require('mongoose-slug-updater');

const productSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', immutable: true, index: true },
    productId: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    sku: { type: String, default: '' },
    price: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    description: { type: String },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    archivedAt: { type: Date, default: null },
    instock: { type: Boolean, default: true },
    stock: { type: Number, default: 0 },
    images: [
      {
        url: { type: String, required: true },
        public_id: { type: String, required: true },
      },
    ],
    salePercent: { type: Number, default: 0, min: 0, max: 100 },
    details: { type: String },
    fitType: {
      type: String,
      enum: ['regular', 'relaxed', 'boxy', 'slim', 'oversized', 'standard'],
      default: 'regular',
    },
    materialTag: { type: String, default: '', trim: true, index: true },
    collectionTag: { type: String, default: '', trim: true, index: true },
    isPreOrderOnly: { type: Boolean, default: false },
    ropThreshold: { type: Number, default: 15, min: 0 },
    specs: {
      fabricComposition: { type: String, default: '' },
      gsmWeight: { type: Number, default: null },
      shrinkageRate: { type: String, default: '' },
      stitchSpec: { type: String, default: '' },
      originNote: { type: String, default: '' },
      careInstructions: [{ type: String }],
      qcChecklist: [{ type: String }],
      certifications: [{ type: String }],
    },
    costBreakdown: {
      materialCost: { type: Number, default: 0 },
      manufacturingCost: { type: Number, default: 0 },
      qcLogisticsCost: { type: Number, default: 0 },
      nullPrice: { type: Number, default: 0 },
      traditionalRetailPrice: { type: Number, default: 0 },
    },
    sizeGuide: {
      unit: { type: String, default: 'cm' },
      modelInfo: { type: String, default: '' },
      headers: [{ type: String }],
      rows: [[{ type: String }]],
    },
    personalizationConfig: {
      enabled: { type: Boolean, default: false },
      allowMonogram: { type: Boolean, default: true },
      allowInnerLabel: { type: Boolean, default: true },
      maxMonogramChars: { type: Number, default: 3, min: 1, max: 5 },
      monogramFee: { type: Number, default: 45000, min: 0 },
      innerLabelFee: { type: Number, default: 25000, min: 0 },
      extraLeadDays: { type: Number, default: 2, min: 0 },
      allowedPlacements: {
        type: [String],
        default: ['left_cuff', 'hem', 'inner_neck', 'chest_pocket'],
      },
      allowedFonts: {
        type: [String],
        default: ['serif_minimal', 'sans_architect', 'italic_atelier'],
      },
      allowedThreadColors: {
        type: [
          {
            name: { type: String, required: true },
            hex: { type: String, required: true },
          },
        ],
        default: [
          { name: 'Đen Obsidian', hex: '#161614' },
          { name: 'Trắng Ngà', hex: '#F3F1EC' },
          { name: 'Xám Đá', hex: '#73706A' },
          { name: 'Nâu Đất Mộc', hex: '#8C7A6B' },
          { name: 'Xanh Rêu Tối', hex: '#3F5E45' },
        ],
      },
    },
    rate: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    fitSummary: {
      runs_small: { type: Number, default: 0 },
      true_to_size: { type: Number, default: 0 },
      runs_large: { type: Number, default: 0 },
    },
    slug: { type: String, slug: 'name', unique: true },
    views: { type: Number, default: 0 },
    selledNumber: { type: Number, default: 0 },
  },
  {
    toJSON: {
      transform: (doc, ret) => {
        if (ret.description !== undefined)
          ret.description = require('../utils/safeHtml')(ret.description);
        return ret;
      },
    },
    timestamps: true,
    optimisticConcurrency: true,
  },
);
productSchema.index({ brand: 1, category: 1 });
productSchema.index({ instock: 1, stock: -1 });

mongoose.plugin(slug);
module.exports = mongoose.model('Product', productSchema);
