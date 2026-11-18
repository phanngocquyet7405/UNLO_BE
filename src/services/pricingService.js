const commerce = require('./commercePolicy');
const { guardBox } = require('./boxDefinitionService');
const crypto = require('crypto');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Campaign = require('../models/Campaign');
const Box = require('../models/Box');
const Coupon = require('../models/Coupon');

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function unitPrice(product, variant = null, campaign = null) {
  if (campaign) {
    return commerce.safeMoney(campaign.resolveCurrentUnitPrice());
  }
  const basePrice = commerce.safeMoney(product.price + (variant?.priceDelta || 0));
  const percent = product.salePercent || 0;
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) fail('Sale percent không hợp lệ');
  return commerce.safeMoney(Math.round(basePrice * (1 - percent / 100)));
}

// Integer allocation preserves the exact total, including one-VND discounts.
function allocate(total, weights) {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    weights.some((w) => !Number.isSafeInteger(w) || w < 0)
  )
    fail('Số tiền phân bổ không hợp lệ');
  if (!weights.length) return [];
  const normalized = weights.some((w) => w > 0) ? weights : weights.map(() => 1);
  const sum = normalized.reduce((a, b) => a + BigInt(b), 0n),
    amount = BigInt(total);
  const values = normalized.map((w) => Number((amount * BigInt(w)) / sum));
  const rank = normalized
    .map((w, i) => ({ i, remainder: (amount * BigInt(w)) % sum }))
    .sort((a, b) => (a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1));
  for (let n = total - values.reduce((a, b) => a + b, 0), i = 0; i < n; i++) values[rank[i].i]++;
  return values;
}

async function couponDiscount(code, subtotal, session, claim = false) {
  if (!code) return { discountAmount: 0 };
  let coupon = await Coupon.findOne({ code }).session(session || null);
  const now = new Date();
  if (!coupon || !coupon.isActive || now < coupon.startDate || now > coupon.expiresAt)
    fail('Mã giảm giá không hợp lệ hoặc đã hết hạn');
  if (subtotal < coupon.minOrderValue)
    fail(`Đơn hàng cần tối thiểu ${coupon.minOrderValue} để dùng mã này`);
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit)
    fail('Mã giảm giá đã hết lượt sử dụng', 409);
  if (claim) {
    coupon = await Coupon.findOneAndUpdate(
      {
        _id: coupon._id,
        isActive: true,
        startDate: { $lte: now },
        expiresAt: { $gte: now },
        $expr: {
          $or: [{ $eq: ['$usageLimit', null] }, { $lt: ['$usedCount', '$usageLimit'] }],
        },
      },
      { $inc: { usedCount: 1 } },
      { session, new: true },
    );
    if (!coupon) fail('Mã giảm giá đã hết lượt sử dụng', 409);
  }
  const amount =
    coupon.discountType === 'percentage'
      ? Math.round((subtotal * coupon.discount) / 100)
      : coupon.discount;
  return {
    discountAmount: Math.min(subtotal, Math.round(amount)),
    couponCode: coupon.code,
    couponId: coupon._id,
  };
}

function normalizeAndExtract(items) {
  const normalized = commerce.normalizeLines(items);
  if (!normalized.length) fail('Giỏ hàng trống');
  const boxIds = [...new Set(normalized.filter((i) => i.boxId).map((i) => String(i.boxId)))].sort();
  const boxDemand = new Map();
  for (const item of normalized.filter((i) => i.boxId))
    boxDemand.set(String(item.boxId), (boxDemand.get(String(item.boxId)) || 0) + item.quantity);
  return { normalized, boxIds, boxDemand };
}

async function lockAndValidateBoxes(boxIds, boxDemand, session, claim) {
  const boxMap = new Map();
  if (claim) {
    for (const id of boxIds) boxMap.set(id, await guardBox(id, session));
  } else if (boxIds.length) {
    for (const box of await Box.find({
      _id: { $in: boxIds },
      archivedAt: null,
    }).session(session))
      boxMap.set(String(box._id), box);
  }

  const ids = new Set();
  const now = new Date();
  for (const id of boxIds) {
    const box = boxMap.get(id);
    if (
      !box ||
      box.validFrom > now ||
      box.validTo < now ||
      (box.isGift && !box.sourceComboId) ||
      box.internalSubscription ||
      box.subscriptionOnly ||
      !Number.isSafeInteger(box.stock) ||
      box.stock < boxDemand.get(id) ||
      !box.products.length
    )
      fail('Hộp không còn bán hoặc không đủ hàng');
    for (const part of box.products) {
      if (!Number.isSafeInteger(part.quantity) || part.quantity < 1)
        fail('Cấu hình hộp không hợp lệ');
      ids.add(String(part.productId));
    }
  }
  return { boxMap, boxProductIds: ids };
}

async function loadAndValidateProducts(allProductIds, session) {
  const docs = await Product.find({ _id: { $in: [...allProductIds].sort() } })
    .populate('brand')
    .session(session);
  const productMap = new Map(docs.map((p) => [String(p._id), p]));

  return function productFor(id) {
    const p = productMap.get(String(id));
    if (p?.archivedAt || !p?.brand?.ownerId)
      fail('Sản phẩm không tồn tại hoặc không có người bán hợp lệ');
    if (p.ownerId && String(p.ownerId) !== String(p.brand.ownerId))
      fail('Chủ sản phẩm và thương hiệu không khớp; cần đối chiếu ownership trước khi bán', 409);
    return p;
  };
}

async function loadAndValidateVariantsAndCampaigns(normalized, session) {
  const variantIds = [
    ...new Set(
      normalized
        .flatMap((i) => [
          i.variantId ? String(i.variantId) : null,
          ...(i.bundleSelections || []).map((s) => (s.variantId ? String(s.variantId) : null)),
        ])
        .filter(Boolean),
    ),
  ].sort();

  const campaignIds = [
    ...new Set(normalized.map((i) => (i.campaignId ? String(i.campaignId) : null)).filter(Boolean)),
  ].sort();

  const [variantDocs, campaignDocs] = await Promise.all([
    variantIds.length ? ProductVariant.find({ _id: { $in: variantIds } }).session(session) : [],
    campaignIds.length ? Campaign.find({ _id: { $in: campaignIds } }).session(session) : [],
  ]);

  const variantMap = new Map(variantDocs.map((v) => [String(v._id), v]));
  const campaignMap = new Map(campaignDocs.map((c) => [String(c._id), c]));

  const now = new Date();
  for (const id of campaignIds) {
    const camp = campaignMap.get(id);
    if (
      !camp ||
      !['active', 'moq_reached'].includes(camp.status) ||
      camp.startAt > now ||
      camp.endAt < now
    ) {
      fail('Chiến dịch gom đơn / đặt trước không còn hiệu lực');
    }
  }

  return { variantMap, campaignMap };
}

function calculateStandaloneBulkDiscounts(normalized, productFor, variantMap, campaignMap) {
  const quantities = new Map();
  for (const item of normalized.filter((i) => i.productId && !i.campaignId))
    quantities.set(
      String(item.productId),
      (quantities.get(String(item.productId)) || 0) + item.quantity,
    );
  const bulkAmounts = new Map();
  for (const [id, quantity] of quantities) {
    const linesOfProduct = normalized.filter((i) => String(i.productId) === id && !i.campaignId);
    const weights = linesOfProduct.map((i) => {
      const variant = i.variantId ? variantMap.get(String(i.variantId)) : null;
      return commerce.safeMoney(unitPrice(productFor(id), variant, null) * i.quantity);
    });
    const discount = Math.round((commerce.sum(weights) * commerce.bulkPercent(quantity)) / 100);
    allocate(discount, weights).forEach((amount, index) =>
      bulkAmounts.set(linesOfProduct[index].lineId, amount),
    );
  }
  return { quantities, bulkAmounts };
}

function expandLineItemsAndBoxes(
  normalized,
  boxMap,
  boxDemand,
  productFor,
  variantMap,
  campaignMap,
  bulkAmounts,
  quantities,
) {
  const products = [];
  const lines = [];

  for (const item of normalized) {
    let fee = commerce.safeMoney(commerce.fees[item.gift.wrap] * item.quantity);
    if (item.boxId) {
      const box = boxMap.get(String(item.boxId));
      const selectionByProduct = new Map(
        (item.bundleSelections || []).map((s) => [String(s.productId), String(s.variantId)]),
      );
      const parts = box.products.map((c) => {
        const product = productFor(c.productId);
        const selVarId = selectionByProduct.get(String(c.productId));
        const variant = selVarId ? variantMap.get(selVarId) : null;
        if (selVarId && (!variant || String(variant.productId) !== String(product._id))) {
          fail('Biến thể chọn trong combo không hợp lệ');
        }
        return {
          product,
          variant,
          quantity: c.quantity * item.quantity,
        };
      });
      const baseAmount = commerce.safeMoney(Math.round(box.value) * item.quantity);
      const percent = box.isGift
        ? [...(box.giftPolicy?.bulkTiers || [])]
            .filter((t) => t.minQuantity <= boxDemand.get(String(box._id)))
            .sort((a, b) => b.minQuantity - a.minQuantity)[0]?.percent || 0
        : 0;
      const bulkAmount = Math.round((baseAmount * percent) / 100);
      const value = commerce.safeMoney(baseAmount - bulkAmount);
      const amenitiesFee = box.isGift
        ? commerce.sum(
            (box.giftPolicy?.amenities || []).map((a) => commerce.safeMoney(a.fee * item.quantity)),
          )
        : 0;
      fee = commerce.sum([fee, amenitiesFee]);
      const amounts = allocate(
        value,
        parts.map((c) => commerce.safeMoney(unitPrice(c.product, c.variant) * c.quantity)),
      );
      const giftFees = allocate(fee, amounts);
      const bulkParts = allocate(bulkAmount, amounts);
      parts.forEach((part, index) =>
        products.push({
          productId: part.product._id,
          ...(part.variant
            ? {
                variantId: part.variant._id,
                variantSummary: {
                  sku: part.variant.sku,
                  colorName: part.variant.colorName,
                  colorHex: part.variant.colorHex,
                  size: part.variant.size,
                },
              }
            : {}),
          name: `${part.product.name} (${box.name})`,
          unitPrice: amounts[index] / part.quantity,
          quantity: part.quantity,
          totalPrice: amounts[index],
          brand: part.product.brand._id,
          merchantId: part.product.brand.ownerId,
          boxId: box._id,
          lineId: item.lineId,
          gift: item.gift,
          giftFee: giftFees[index],
          personalizationFee: 0,
          bulkDiscountAmount: bulkParts[index],
        }),
      );
      lines.push({
        itemType: 'box',
        itemId: String(box._id),
        lineId: item.lineId,
        name: box.name,
        quantity: item.quantity,
        unitPrice: Math.round(box.value),
        baseAmount,
        bulkPercent: percent,
        bulkDiscountAmount: bulkAmount,
        totalPrice: value,
        gift: item.gift,
        giftFee: fee,
        personalizationFee: 0,
      });
    } else {
      const p = productFor(item.productId);
      const variant = item.variantId ? variantMap.get(String(item.variantId)) : null;
      if (
        item.variantId &&
        (!variant || !variant.isActive || String(variant.productId) !== String(p._id))
      ) {
        fail('Biến thể (Màu / Size) không tồn tại hoặc không thuộc sản phẩm này');
      }
      const campaign = item.campaignId ? campaignMap.get(String(item.campaignId)) : null;
      if (campaign && String(campaign.productId) !== String(p._id)) {
        fail('Chiến dịch không thuộc sản phẩm này');
      }
      const customization = commerce.customizationFor(item.customization);
      const pFeePerUnit = customization.enabled
        ? commerce.personalizationFeeFor(customization, p.personalizationConfig)
        : 0;
      const personalizationFee = commerce.safeMoney(pFeePerUnit * item.quantity);

      const price = unitPrice(p, variant, campaign);
      const base = commerce.safeMoney(price * item.quantity);
      const discount = bulkAmounts.get(item.lineId) || 0;

      const variantSummary = variant
        ? {
            sku: variant.sku,
            colorName: variant.colorName,
            colorHex: variant.colorHex,
            size: variant.size,
          }
        : undefined;

      products.push({
        productId: p._id,
        ...(variant ? { variantId: variant._id, variantSummary } : {}),
        ...(campaign ? { campaignId: campaign._id } : {}),
        name: p.name,
        unitPrice: price,
        quantity: item.quantity,
        totalPrice: base - discount,
        brand: p.brand._id,
        merchantId: p.brand.ownerId,
        lineId: item.lineId,
        gift: item.gift,
        giftFee: fee,
        ...(customization.enabled
          ? {
              customization: {
                ...customization,
                workStatus: 'pending_work',
              },
            }
          : {}),
        personalizationFee,
        bulkDiscountAmount: discount,
      });
      lines.push({
        itemType: campaign ? campaign.type : 'product',
        itemId: String(p._id),
        ...(variant ? { variantId: String(variant._id), variantSummary } : {}),
        ...(campaign ? { campaignId: String(campaign._id), campaignTitle: campaign.title } : {}),
        lineId: item.lineId,
        name: p.name,
        quantity: item.quantity,
        unitPrice: price,
        baseAmount: base,
        bulkPercent: campaign ? 0 : commerce.bulkPercent(quantities.get(String(p._id)) || 0),
        bulkDiscountAmount: discount,
        totalPrice: base - discount,
        gift: item.gift,
        giftFee: fee,
        ...(customization.enabled ? { customization } : {}),
        personalizationFee,
      });
    }
  }
  return { products, lines };
}

function validateAggregatedStock(products, productFor, variantMap, campaignMap) {
  const productDemand = new Map();
  const variantDemand = new Map();
  const campaignDemand = new Map();

  for (const p of products) {
    if (p.campaignId) {
      campaignDemand.set(
        String(p.campaignId),
        (campaignDemand.get(String(p.campaignId)) || 0) + p.quantity,
      );
      continue;
    }
    if (p.variantId) {
      variantDemand.set(
        String(p.variantId),
        (variantDemand.get(String(p.variantId)) || 0) + p.quantity,
      );
    } else {
      productDemand.set(
        String(p.productId),
        (productDemand.get(String(p.productId)) || 0) + p.quantity,
      );
    }
  }

  for (const [id, quantity] of campaignDemand) {
    const camp = campaignMap.get(id);
    if (!camp || camp.currentOrderedQty + quantity > camp.maxCapQty) {
      fail('Chiến dịch gom đơn / đặt trước không đủ suất còn lại');
    }
  }

  for (const [id, quantity] of variantDemand) {
    const v = variantMap.get(id);
    if (!v || !v.isActive || !Number.isSafeInteger(v.stock) || v.stock < quantity) {
      fail(`Biến thể ${v?.colorName || ''} / ${v?.size || ''} không đủ tồn kho`);
    }
  }

  for (const [id, quantity] of productDemand) {
    const p = productFor(id);
    if (
      !Number.isSafeInteger(quantity) ||
      !Number.isSafeInteger(p.stock) ||
      p.instock === false ||
      p.stock < quantity
    )
      fail('Một sản phẩm trong giỏ không đủ hàng');
  }
}

function buildBoxSummaries(boxIds, boxMap, boxDemand) {
  return boxIds.map((id) => ({
    boxId: boxMap.get(id)._id,
    name: boxMap.get(id).name,
    quantity: boxDemand.get(id),
  }));
}

async function calculateTotalsAndFingerprint(lines, products, couponCode, session, claim) {
  const baseSubtotal = commerce.sum(lines.map((l) => l.baseAmount));
  const bulkDiscountAmount = commerce.sum(lines.map((l) => l.bulkDiscountAmount));
  const subtotal = commerce.sum(products.map((p) => p.totalPrice));
  const giftFee = commerce.sum(lines.map((l) => l.giftFee));
  const personalizationFee = commerce.sum(lines.map((l) => l.personalizationFee || 0));
  const discount = await couponDiscount(couponCode, subtotal, session, claim);
  commerce.safeMoney(discount.discountAmount);
  const shippingFee = 0; // Customer pays carrier directly or standard policy
  const totalAmount = commerce.sum([
    subtotal - discount.discountAmount,
    shippingFee,
    giftFee,
    personalizationFee,
  ]);
  const policyVersion = commerce.policy().version;
  const fingerprint = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        policyVersion,
        lines,
        couponCode: discount.couponCode,
        subtotal,
        giftFee,
        personalizationFee,
        shippingFee,
        discountAmount: discount.discountAmount,
        totalAmount,
      }),
    )
    .digest('hex');

  return {
    baseSubtotal,
    bulkDiscountAmount,
    subtotal,
    giftFee,
    personalizationFee,
    shippingFee,
    discount,
    totalAmount,
    fingerprint,
    policyVersion,
  };
}

async function buildQuote(items, couponCode, session = null, claim = false) {
  const { normalized, boxIds, boxDemand } = normalizeAndExtract(items);
  const { boxMap, boxProductIds } = await lockAndValidateBoxes(boxIds, boxDemand, session, claim);
  const standaloneIds = normalized.filter((i) => i.productId).map((i) => String(i.productId));
  const productFor = await loadAndValidateProducts(
    new Set([...standaloneIds, ...boxProductIds]),
    session,
  );
  const { variantMap, campaignMap } = await loadAndValidateVariantsAndCampaigns(
    normalized,
    session,
  );
  const { quantities, bulkAmounts } = calculateStandaloneBulkDiscounts(
    normalized,
    productFor,
    variantMap,
    campaignMap,
  );
  const { products, lines } = expandLineItemsAndBoxes(
    normalized,
    boxMap,
    boxDemand,
    productFor,
    variantMap,
    campaignMap,
    bulkAmounts,
    quantities,
  );
  validateAggregatedStock(products, productFor, variantMap, campaignMap);
  const boxes = buildBoxSummaries(boxIds, boxMap, boxDemand);
  const totals = await calculateTotalsAndFingerprint(lines, products, couponCode, session, claim);

  return {
    products,
    boxes,
    lines,
    baseSubtotal: totals.baseSubtotal,
    bulkDiscountAmount: totals.bulkDiscountAmount,
    subtotal: totals.subtotal,
    giftFee: totals.giftFee,
    personalizationFee: totals.personalizationFee,
    shippingFee: totals.shippingFee,
    shippingMode: 'separate',
    shippingPayment: 'customer_to_carrier',
    shippingFeeIncluded: false,
    ...totals.discount,
    totalAmount: totals.totalAmount,
    fingerprint: totals.fingerprint,
    policyVersion: totals.policyVersion,
  };
}

module.exports = { unitPrice, allocate, couponDiscount, buildQuote, fail };
