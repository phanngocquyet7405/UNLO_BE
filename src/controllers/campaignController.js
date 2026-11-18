const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Order = require('../models/Order');
const Checkout = require('../models/Checkout');
const ReceiptRefund = require('../models/ReceiptRefund');
const { withTransaction } = require('../utils/transaction');
const { fail } = require('../services/pricingService');

function serializeCampaign(camp, variants = []) {
  const tiers = [...(camp.pricingTiers || [])].sort((a, b) => a.minQty - b.minQty);
  const currentQty = camp.currentOrderedQty || 0;
  const activeTier = [...tiers].reverse().find((t) => currentQty >= t.minQty) || null;
  const nextTier = tiers.find((t) => currentQty < t.minQty) || null;
  const moqPercent = camp.moqTarget
    ? Math.min(100, Math.round((currentQty / camp.moqTarget) * 100))
    : 0;
  return {
    ...camp,
    variants,
    currentUnitPrice: activeTier ? activeTier.unitPrice : camp.baseUnitPrice,
    activeTier,
    nextTier,
    moqPercent,
    remainingCap: Math.max(0, (camp.maxCapQty || 0) - currentQty),
  };
}

class CampaignController {
  async list(req, res, next) {
    try {
      const filter = {};
      if (req.query.status) filter.status = req.query.status;
      else if (req.query.all !== 'true') {
        filter.status = {
          $in: ['active', 'moq_reached', 'fabric_sourcing', 'sewing', 'qc_checking', 'shipping'],
        };
      }
      if (req.query.type) filter.type = req.query.type;

      const campaigns = await Campaign.find(filter)
        .populate('productId')
        .populate('factoryPartnerId', 'name slug cityAddress certifications')
        .sort({ endAt: 1, createdAt: -1 })
        .lean();

      const productIds = campaigns.map((c) => c.productId?._id).filter(Boolean);
      const variants = productIds.length
        ? await ProductVariant.find({ productId: { $in: productIds }, isActive: true }).lean()
        : [];
      const variantsByProduct = new Map();
      for (const v of variants) {
        const key = String(v.productId);
        if (!variantsByProduct.has(key)) variantsByProduct.set(key, []);
        variantsByProduct.get(key).push(v);
      }

      const data = campaigns.map((c) =>
        serializeCampaign(c, variantsByProduct.get(String(c.productId?._id)) || []),
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getDetail(req, res, next) {
    try {
      const { idOrSlug } = req.params;
      const query = mongoose.Types.ObjectId.isValid(idOrSlug)
        ? { $or: [{ _id: idOrSlug }, { slug: idOrSlug }] }
        : { slug: idOrSlug };
      const camp = await Campaign.findOne(query)
        .populate({
          path: 'productId',
          populate: [{ path: 'brand' }, { path: 'category' }],
        })
        .populate('factoryPartnerId')
        .lean();
      if (!camp) fail('Chiến dịch không tồn tại', 404);
      const variants = camp.productId?._id
        ? await ProductVariant.find({ productId: camp.productId._id, isActive: true })
            .sort({ colorName: 1, size: 1 })
            .lean()
        : [];
      res.json({ success: true, data: serializeCampaign(camp, variants) });
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const {
        title,
        type = 'group_buy',
        productId,
        description = '',
        coverImage = '',
        moqTarget,
        maxCapQty = 500,
        pricingTiers = [],
        baseUnitPrice,
        depositPercent = 100,
        startAt,
        endAt,
        estimatedShipDate,
      } = req.body;
      const product = await Product.findById(productId);
      if (!product || product.archivedAt) fail('Sản phẩm không tồn tại', 404);
      if (!title || !moqTarget || !baseUnitPrice || !startAt || !endAt || !estimatedShipDate) {
        fail('Thiếu thông tin bắt buộc cho chiến dịch gom đơn / đặt trước');
      }
      const campaign = await Campaign.create({
        title: String(title).trim(),
        type,
        productId: product._id,
        factoryPartnerId: product.brand || null,
        description,
        coverImage: coverImage || product.images?.[0]?.url || '',
        moqTarget: Number(moqTarget),
        maxCapQty: Math.max(Number(moqTarget), Number(maxCapQty)),
        pricingTiers,
        baseUnitPrice: Number(baseUnitPrice),
        depositPercent: Number(depositPercent) || 100,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        estimatedShipDate: new Date(estimatedShipDate),
        status: 'active',
        createdBy: req.userId,
      });
      res.status(201).json({ success: true, data: campaign });
    } catch (err) {
      next(err);
    }
  }

  async updateStage(req, res, next) {
    try {
      const { status, note = '', imageUrl = '' } = req.body;
      const allowed = [
        'active',
        'moq_reached',
        'fabric_sourcing',
        'sewing',
        'qc_checking',
        'shipping',
        'completed',
      ];
      if (!allowed.includes(status)) fail('Trạng thái chiến dịch không hợp lệ');
      const camp = await Campaign.findById(req.params._id);
      if (!camp) fail('Chiến dịch không tồn tại', 404);
      camp.status = status;
      camp.productionUpdates.push({
        stage: status,
        note: String(note).slice(0, 500),
        imageUrl: String(imageUrl).slice(0, 500),
        updatedBy: req.userId,
      });
      await camp.save();
      res.json({ success: true, data: camp });
    } catch (err) {
      next(err);
    }
  }

  async triggerMoqFailedRefund(req, res, next) {
    try {
      let refundedCount = 0;
      let campaign;
      await withTransaction(async (session) => {
        campaign = await Campaign.findById(req.params._id).session(session);
        if (!campaign) fail('Chiến dịch không tồn tại', 404);
        if (campaign.status === 'cancelled_moq_failed') {
          fail('Chiến dịch này đã kích hoạt hoàn tiền thất bại MOQ trước đó', 409);
        }
        campaign.status = 'cancelled_moq_failed';
        campaign.refundTriggeredAt = new Date();
        campaign.productionUpdates.push({
          stage: 'cancelled_moq_failed',
          note:
            req.body.reason ||
            'Không đạt đủ số lượng tối thiểu (MOQ). Kích hoạt hoàn tiền minh bạch 100% cho khách đã thanh toán.',
          updatedBy: req.userId,
        });
        await campaign.save({ session });

        const orders = await Order.find({
          campaignId: campaign._id,
          status: { $ne: 'cancelled' },
        }).session(session);

        for (const order of orders) {
          order.status = 'cancelled';
          order.cancelReason = 'Chiến dịch gom đơn không đạt MOQ — hoàn tiền 100%';
          order.cancelledBy = req.userId;
          if (order.paymentStatus === 'paid' && order.totalAmount > 0) {
            order.refundStatus = 'pending';
            order.refundAmount = order.totalAmount;
            const checkout = await Checkout.findOne({ paymentCode: order.paymentCode }).session(
              session,
            );
            await ReceiptRefund.create(
              [
                {
                  key: `moq-fail:${campaign._id}:${order._id}`,
                  checkoutId: checkout?._id || order._id,
                  orderId: order._id,
                  purpose: 'order',
                  amount: order.totalAmount,
                  reason: `Hoàn tiền 100% do chiến dịch ${campaign.title} không đạt MOQ`,
                  status: 'pending',
                },
              ],
              { session },
            );
            refundedCount += 1;
          }
          await order.save({ session });
        }
      });

      res.json({
        success: true,
        message: `Đã hủy chiến dịch do thiếu MOQ và tạo ${refundedCount} yêu cầu hoàn tiền minh bạch`,
        data: { campaign, refundedCount },
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CampaignController();
