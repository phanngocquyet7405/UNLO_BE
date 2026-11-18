const crypto = require('crypto');
const Joi = require('joi');

const giftSchema = Joi.object({
  wrap: Joi.string().valid('none', 'classic', 'eco', 'premium').default('none'),
  message: Joi.string().trim().max(500).allow('').default(''),
}).unknown(false);

const customizationSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  monogramText: Joi.string()
    .trim()
    .uppercase()
    .max(5)
    .pattern(/^[A-Z0-9.&:\-\s]*$/)
    .allow('')
    .default(''),
  font: Joi.string()
    .valid('serif_minimal', 'sans_architect', 'italic_atelier')
    .default('serif_minimal'),
  threadColor: Joi.string().trim().max(40).allow('').default(''),
  placement: Joi.string()
    .valid('none', 'left_cuff', 'hem', 'inner_neck', 'chest_pocket')
    .default('none'),
  innerLabelText: Joi.string().trim().max(30).allow('').default(''),
  giftBoxType: Joi.string().valid('none', 'minimal_kraft', 'atelier_linen').default('none'),
  giftNote: Joi.string().trim().max(250).allow('').default(''),
}).unknown(false);

const fees = Object.freeze({ none: 0, classic: 15000, eco: 15000, premium: 35000 });

const personalizationFees = Object.freeze({
  monogram: 45000,
  innerLabel: 25000,
  giftBox: Object.freeze({
    none: 0,
    minimal_kraft: 25000,
    atelier_linen: 55000,
  }),
});

function fail(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  throw e;
}

function giftFor(value) {
  if (value?.toObject) value = value.toObject();
  const { value: gift, error } = giftSchema.validate(value == null ? {} : value, {
    convert: false,
  });
  if (error) fail('Gift options không hợp lệ');
  return gift;
}

function customizationFor(value) {
  if (value?.toObject) value = value.toObject();
  if (
    !value ||
    (typeof value === 'object' &&
      !value.enabled &&
      !value.monogramText &&
      !value.innerLabelText &&
      (!value.giftBoxType || value.giftBoxType === 'none') &&
      !value.giftNote)
  ) {
    return {
      enabled: false,
      monogramText: '',
      font: 'serif_minimal',
      threadColor: '',
      placement: 'none',
      innerLabelText: '',
      giftBoxType: 'none',
      giftNote: '',
    };
  }
  const { value: customization, error } = customizationSchema.validate(value, {
    convert: true,
  });
  if (error) fail('Tùy chọn cá nhân hóa không hợp lệ');
  const hasAny =
    Boolean(customization.monogramText) ||
    Boolean(customization.innerLabelText) ||
    customization.giftBoxType !== 'none' ||
    Boolean(customization.giftNote);
  return {
    enabled: Boolean(customization.enabled && hasAny) || hasAny,
    monogramText: customization.monogramText || '',
    font: customization.font || 'serif_minimal',
    threadColor: customization.threadColor || '',
    placement: customization.placement || 'none',
    innerLabelText: customization.innerLabelText || '',
    giftBoxType: customization.giftBoxType || 'none',
    giftNote: customization.giftNote || '',
  };
}

function personalizationFeeFor(customization, productConfig = null) {
  const c = customizationFor(customization);
  if (!c.enabled) return 0;
  let unitFee = 0;
  if (c.monogramText) {
    unitFee +=
      typeof productConfig?.monogramFee === 'number'
        ? productConfig.monogramFee
        : personalizationFees.monogram;
  }
  if (c.innerLabelText) {
    unitFee +=
      typeof productConfig?.innerLabelFee === 'number'
        ? productConfig.innerLabelFee
        : personalizationFees.innerLabel;
  }
  unitFee += personalizationFees.giftBox[c.giftBoxType] || 0;
  return safeMoney(unitFee);
}

function identity(item) {
  const productId = item.productId?._id || item.productId;
  const boxId = item.boxId?._id || item.boxId;
  if (Boolean(productId) === Boolean(boxId))
    fail('Cart line phải có đúng một productId hoặc boxId');
  return `${boxId ? 'box' : 'product'}:${String(boxId || productId)}`;
}

function lineId(item) {
  const gift = giftFor(item.gift);
  const variantId = item.variantId?._id || item.variantId || null;
  const campaignId = item.campaignId?._id || item.campaignId || null;
  const customization = customizationFor(item.customization);

  // Preserve exact legacy hash when no NU:LL fashion extensions are used.
  const payload =
    variantId || campaignId || customization.enabled
      ? [
          identity(item),
          gift,
          variantId ? String(variantId) : null,
          campaignId ? String(campaignId) : null,
          customization.enabled ? customization : null,
        ]
      : [identity(item), gift];

  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function normalizeLines(items) {
  if (!Array.isArray(items) || items.length > 100) fail('Giỏ tối đa 100 dòng');
  const merged = new Map();
  for (const raw of items) {
    const item = raw?.toObject ? raw.toObject() : raw;
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999)
      fail('Số lượng không hợp lệ');
    const gift = giftFor(item.gift);
    const customization = customizationFor(item.customization);
    const variantId = item.variantId?._id || item.variantId || undefined;
    const campaignId = item.campaignId?._id || item.campaignId || undefined;
    const id = lineId({ ...item, gift, customization, variantId, campaignId });
    if (item.lineId && item.lineId !== id) fail('lineId không khớp cấu hình quà');
    const previous = merged.get(id),
      quantity = (previous?.quantity || 0) + item.quantity;
    if (quantity > 999) fail('Tổng số lượng một dòng vượt 999');
    merged.set(id, {
      ...(item.boxId
        ? { boxId: item.boxId?._id || item.boxId }
        : { productId: item.productId?._id || item.productId }),
      ...(variantId ? { variantId } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...(Array.isArray(item.bundleSelections) && item.bundleSelections.length
        ? { bundleSelections: item.bundleSelections }
        : {}),
      quantity,
      gift,
      ...(customization.enabled ? { customization } : {}),
      lineId: id,
    });
  }
  return [...merged.values()].sort((a, b) => a.lineId.localeCompare(b.lineId));
}

function bulkPercent(quantity) {
  return quantity >= 5 ? 10 : quantity >= 3 ? 5 : 0;
}

function safeMoney(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail('Số tiền VND không hợp lệ');
  return value;
}

function sum(values) {
  const amount = values.reduce((a, b) => a + BigInt(safeMoney(b)), 0n);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) fail('Tổng tiền vượt giới hạn');
  return Number(amount);
}

function policy() {
  return {
    version: 'commerce-v2-delivery-separate',
    brand: 'NU:LL',
    wrappingFees: fees,
    wrappingPer: 'unit',
    personalization: {
      monogramFee: personalizationFees.monogram,
      innerLabelFee: personalizationFees.innerLabel,
      giftBoxFees: personalizationFees.giftBox,
      extraLeadDays: 2,
      placements: [
        { id: 'left_cuff', label: 'Cổ tay trái (Tinh tế)' },
        { id: 'hem', label: 'Gấu áo phải (Kín đáo)' },
        { id: 'inner_neck', label: 'Mặt trong cổ áo' },
        { id: 'chest_pocket', label: 'Mép ngực áo' },
      ],
      fonts: [
        { id: 'serif_minimal', label: 'Editorial Serif' },
        { id: 'sans_architect', label: 'Architectural Sans' },
        { id: 'italic_atelier', label: 'Atelier Italic' },
      ],
    },
    bulk: {
      appliesTo: 'standalone-product',
      tiers: [
        { minQuantity: 3, percent: 5 },
        { minQuantity: 5, percent: 10 },
      ],
      aggregateBy: 'productId',
    },
    couponBase: 'merchandise-after-bulk',
    shipping: {
      mode: 'separate',
      includedInCheckout: false,
      standardFeeEstimate: 30000,
      freeShippingThreshold: 499000,
    },
    shippingPayment: 'customer_to_carrier',
    shippingFeeIncluded: false,
    shippingFee: 0,
  };
}

module.exports = {
  giftSchema,
  customizationSchema,
  giftFor,
  customizationFor,
  personalizationFeeFor,
  personalizationFees,
  lineId,
  normalizeLines,
  bulkPercent,
  fees,
  safeMoney,
  sum,
  policy,
  fail,
};
