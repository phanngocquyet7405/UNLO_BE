const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, slug: 'name', unique: true },
    logo: { type: String },
    // Server-managed ID used to clean up images; legacy URL-only logos still work.
    logoPublicId: { type: String, select: false },
    description: { type: String },
    cityAddress: { type: String },
    partnerType: {
      type: String,
      enum: ['oem_factory', 'odm_studio', 'fabric_mill', 'embroidery_atelier'],
      default: 'oem_factory',
    },
    specialties: [{ type: String, trim: true }],
    certifications: [{ type: String, trim: true }],
    moqMin: { type: Number, default: 150, min: 1 },
    leadTimeDays: { type: Number, default: 21, min: 1 },
    yearEstablished: { type: Number, default: null },
    qcPassRate: { type: Number, default: 99.0, min: 0, max: 100 },
    story: { type: String, default: '' },
    coverImage: { type: String, default: '' },
    gallery: [
      {
        url: { type: String, required: true },
        caption: { type: String, default: '' },
      },
    ],
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
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
  },
);

module.exports = mongoose.model('Brand', brandSchema);
