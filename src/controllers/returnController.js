const crypto = require('crypto');
const ReturnRequest = require('../models/ReturnRequest');
const Order = require('../models/Order');
const ProductVariant = require('../models/ProductVariant');
const Checkout = require('../models/Checkout');
const ReceiptRefund = require('../models/ReceiptRefund');
const { syncParentProductStock } = require('../services/inventoryService');
const { withTransaction } = require('../utils/transaction');
const { fail } = require('../services/pricingService');

function generateRmaCode() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `RMA-${datePart}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

class ReturnController {
  async createRequest(req, res, next) {
    try {
      const {
        orderId,
        type = 'exchange_size',
        items = [],
        reason = 'wrong_size',
        note = '',
        evidenceImages = [],
      } = req.body;
      const order = await Order.findOne({ _id: orderId, userId: req.userId });
      if (!order) fail('Đơn hàng không tồn tại', 404);
      if (!['delivered', 'completed'].includes(order.status)) {
        fail('Chỉ hỗ trợ yêu cầu đổi size / hoàn trả sau khi đơn hàng đã được giao');
      }
      if (!Array.isArray(items) || !items.length) {
        fail('Vui lòng chọn ít nhất 1 sản phẩm cần đổi size hoặc hoàn trả');
      }

      const cleanItems = [];
      let refundAmount = 0;
      for (const reqItem of items) {
        const orderLine = order.products.find(
          (p) =>
            String(p.productId) === String(reqItem.productId) &&
            (!reqItem.originalVariantId ||
              String(p.variantId) === String(reqItem.originalVariantId)),
        );
        if (!orderLine) fail('Sản phẩm yêu cầu đổi/trả không thuộc đơn hàng này');
        const qty = Math.min(orderLine.quantity, Math.max(1, Number(reqItem.quantity) || 1));

        let targetVariantSummary = '';
        if (type === 'exchange_size' && reqItem.targetVariantId) {
          const targetVar = await ProductVariant.findById(reqItem.targetVariantId).lean();
          if (!targetVar || String(targetVar.productId) !== String(orderLine.productId)) {
            fail('Biến thể size muốn đổi không hợp lệ');
          }
          targetVariantSummary = `${targetVar.colorName} / Size ${targetVar.size}`;
        }

        const unitPrice = Math.round(orderLine.unitPrice);
        if (type === 'refund') refundAmount += unitPrice * qty;

        cleanItems.push({
          productId: orderLine.productId,
          productName: orderLine.name,
          originalVariantId: orderLine.variantId || null,
          originalVariantSummary: orderLine.variantSummary?.size
            ? `${orderLine.variantSummary.colorName} / Size ${orderLine.variantSummary.size}`
            : '',
          targetVariantId: reqItem.targetVariantId || null,
          targetVariantSummary,
          quantity: qty,
          unitPrice,
        });
      }

      const rma = await ReturnRequest.create({
        rmaCode: generateRmaCode(),
        orderId: order._id,
        userId: req.userId,
        type,
        items: cleanItems,
        reason,
        note: String(note).trim().slice(0, 1000),
        evidenceImages: Array.isArray(evidenceImages) ? evidenceImages.slice(0, 5) : [],
        refundAmount,
        status: 'requested',
      });

      res.status(201).json({
        success: true,
        message: 'Đã gửi yêu cầu đổi size / hoàn trả. NU:LL sẽ xác nhận trong 24 giờ.',
        data: rma,
      });
    } catch (err) {
      next(err);
    }
  }

  async myReturns(req, res, next) {
    try {
      const list = await ReturnRequest.find({ userId: req.userId })
        .populate('orderId', 'orderId totalAmount status createdAt')
        .sort({ createdAt: -1 })
        .lean();
      res.json({ success: true, data: list });
    } catch (err) {
      next(err);
    }
  }

  async adminList(req, res, next) {
    try {
      const filter = {};
      if (req.query.status) filter.status = req.query.status;
      const list = await ReturnRequest.find(filter)
        .populate('orderId', 'orderId paymentCode totalAmount status')
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .lean();
      res.json({ success: true, data: list });
    } catch (err) {
      next(err);
    }
  }

  async adminProcess(req, res, next) {
    try {
      const { status, adminNote = '' } = req.body;
      if (!['approved', 'item_received', 'completed', 'rejected'].includes(status)) {
        fail('Trạng thái xử lý RMA không hợp lệ');
      }

      let updatedRma;
      await withTransaction(async (session) => {
        const rma = await ReturnRequest.findById(req.params._id).session(session);
        if (!rma) fail('Yêu cầu đổi/trả không tồn tại', 404);
        if (['completed', 'rejected'].includes(rma.status)) {
          fail('Yêu cầu này đã kết thúc, không thể thay đổi trạng thái', 409);
        }

        if (status === 'completed') {
          if (rma.type === 'exchange_size') {
            for (const item of rma.items) {
              if (item.targetVariantId) {
                const deducted = await ProductVariant.findOneAndUpdate(
                  { _id: item.targetVariantId, isActive: true, stock: { $gte: item.quantity } },
                  { $inc: { stock: -item.quantity } },
                  { session, new: true },
                );
                if (!deducted) {
                  fail(`Size đổi mới (${item.targetVariantSummary}) không đủ tồn kho`, 409);
                }
              }
              if (item.originalVariantId) {
                await ProductVariant.findByIdAndUpdate(
                  item.originalVariantId,
                  { $inc: { stock: item.quantity } },
                  { session },
                );
              }
              await syncParentProductStock(item.productId, session);
            }
          } else if (rma.type === 'refund') {
            const order = await Order.findById(rma.orderId).session(session);
            if (order) {
              order.status = 'returned';
              order.refundStatus = rma.refundAmount > 0 ? 'pending' : 'not_applicable';
              order.refundAmount = rma.refundAmount;
              await order.save({ session });

              if (rma.refundAmount > 0) {
                const checkout = await Checkout.findOne({ paymentCode: order.paymentCode }).session(
                  session,
                );
                const [refundDoc] = await ReceiptRefund.create(
                  [
                    {
                      key: `rma-refund:${rma._id}`,
                      checkoutId: checkout?._id || order._id,
                      orderId: order._id,
                      purpose: 'order',
                      amount: rma.refundAmount,
                      reason: `Hoàn tiền theo yêu cầu trả hàng ${rma.rmaCode}`,
                      status: 'pending',
                    },
                  ],
                  { session },
                );
                rma.linkedRefundId = refundDoc._id;
              }
            }
          }
        }

        rma.status = status;
        rma.adminNote = String(adminNote || rma.adminNote);
        rma.processedBy = req.userId;
        rma.processedAt = new Date();
        await rma.save({ session });
        updatedRma = rma;
      });

      res.json({ success: true, data: updatedRma });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ReturnController();
