const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Campaign = require('../models/Campaign');
const Box = require('../models/Box');
const { fail } = require('./pricingService');

async function syncParentProductStock(productId, session) {
  const variants = await ProductVariant.find({ productId, isActive: true })
    .select('stock')
    .session(session);
  const totalStock = variants.reduce((sum, v) => sum + (v.stock || 0), 0);
  await Product.findByIdAndUpdate(
    productId,
    { $set: { stock: totalStock, instock: totalStock > 0 } },
    { session },
  );
}

async function deductStock(products, session, boxes = []) {
  const touchedCampaigns = new Set();
  for (const item of products) {
    // Group-buy / Pre-order lines count against Campaign MOQ capacity rather than ready-made stock
    if (item.campaignId) {
      const updatedCampaign = await Campaign.findOneAndUpdate(
        {
          _id: item.campaignId,
          status: { $in: ['active', 'moq_reached'] },
          $expr: { $lte: [{ $add: ['$currentOrderedQty', item.quantity] }, '$maxCapQty'] },
        },
        {
          $inc: {
            currentOrderedQty: item.quantity,
            participantCount: touchedCampaigns.has(String(item.campaignId)) ? 0 : 1,
          },
        },
        { session, new: true },
      );
      if (!updatedCampaign)
        fail(`Chiến dịch "${item.name}" đã đủ số lượng tối đa hoặc đã đóng`, 409);
      touchedCampaigns.add(String(item.campaignId));
      if (
        updatedCampaign.status === 'active' &&
        updatedCampaign.currentOrderedQty >= updatedCampaign.moqTarget
      ) {
        updatedCampaign.status = 'moq_reached';
        await updatedCampaign.save({ session });
      }
      continue;
    }

    if (item.variantId) {
      const updatedVariant = await ProductVariant.findOneAndUpdate(
        { _id: item.variantId, isActive: true, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
        { session, new: true },
      );
      if (!updatedVariant) {
        const label = item.variantSummary?.size
          ? `${item.name} (${item.variantSummary.colorName} / ${item.variantSummary.size})`
          : item.name;
        fail(`Biến thể "${label}" vừa hết hàng`, 409);
      }
      await syncParentProductStock(item.productId, session);
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { selledNumber: item.quantity } },
        { session },
      );
    } else {
      const updated = await Product.findOneAndUpdate(
        { _id: item.productId, instock: true, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity, selledNumber: item.quantity } },
        { session, new: true },
      );
      if (!updated) fail(`Sản phẩm "${item.name}" vừa hết hàng`, 409);
      if (updated.stock === 0)
        await Product.findByIdAndUpdate(updated._id, { instock: false }, { session });
    }
  }
  for (const item of boxes) {
    const updated = await Box.findOneAndUpdate(
      { _id: item.boxId, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
      { session },
    );
    if (!updated) fail(`Bộ sưu tập "${item.name}" vừa hết hàng`, 409);
  }
}

async function restoreStock(products, session, boxes = []) {
  for (const item of products) {
    if (item.campaignId) {
      await Campaign.findOneAndUpdate(
        { _id: item.campaignId, currentOrderedQty: { $gte: item.quantity } },
        { $inc: { currentOrderedQty: -item.quantity } },
        { session },
      );
      continue;
    }
    if (item.variantId) {
      await ProductVariant.findByIdAndUpdate(
        item.variantId,
        { $inc: { stock: item.quantity } },
        { session },
      );
      await syncParentProductStock(item.productId, session);
    } else {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stock: item.quantity }, instock: true },
        { session },
      );
    }
  }
  for (const item of boxes)
    await Box.findByIdAndUpdate(item.boxId, { $inc: { stock: item.quantity } }, { session });
}

// Webhook can accept payment even when stock is short. Undo every partial reservation.
async function reserveOrder(order, session) {
  const products = [],
    boxes = [];
  try {
    for (const item of order.products) {
      await deductStock([item], session);
      products.push(item);
    }
    for (const item of order.boxes || []) {
      await deductStock([], session, [item]);
      boxes.push(item);
    }
    order.stockDeducted = true;
    order.status = 'processing';
  } catch (error) {
    if (error.statusCode !== 409) throw error;
    await restoreStock(products, session, boxes);
    order.stockDeducted = false;
    order.status = 'on_hold';
    order._statusChangeNote = 'Đã nhận tiền; cần bổ sung hàng hoặc hoàn tiền';
  }
}

module.exports = { deductStock, restoreStock, reserveOrder, syncParentProductStock };
