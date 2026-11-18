const Order = require('../models/Order');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Campaign = require('../models/Campaign');
const B2BQuote = require('../models/B2BQuote');
const ReturnRequest = require('../models/ReturnRequest');
const { fail } = require('../services/pricingService');

class AnalyticsController {
  async unitEconomics(req, res, next) {
    try {
      const now = new Date();
      const days14Ago = new Date(now.getTime() - 14 * 86400000);
      const days21Ago = new Date(now.getTime() - 21 * 86400000);

      const [orders, variants, products, campaigns, b2bQuotes, returns] = await Promise.all([
        Order.find({ status: { $ne: 'cancelled' } })
          .select('totalAmount personalizationFee giftFee orderType status createdAt products')
          .lean(),
        ProductVariant.find({ isActive: true })
          .populate('productId', 'name sku price costBreakdown')
          .lean(),
        Product.find({ archivedAt: null })
          .select('name sku stock selledNumber price costBreakdown ropThreshold')
          .lean(),
        Campaign.find().select('title type moqTarget currentOrderedQty status endAt').lean(),
        B2BQuote.find()
          .select('quoteCode companyName status quotedTotalAmount totalEstimatedQty')
          .lean(),
        ReturnRequest.find().select('type status refundAmount createdAt').lean(),
      ]);

      const totalOrders = orders.length;
      const totalRevenue = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
      const personalizationRevenue = orders.reduce(
        (s, o) => s + (o.personalizationFee || 0) + (o.giftFee || 0),
        0,
      );
      const groupBuyRevenue = orders
        .filter((o) => o.orderType === 'group_buy' || o.orderType === 'pre_order')
        .reduce((s, o) => s + (o.totalAmount || 0), 0);
      const b2cRetailRevenue = Math.max(0, totalRevenue - groupBuyRevenue);
      const aov = totalOrders ? Math.round(totalRevenue / totalOrders) : 0;

      // Docx Unit Economics model: COGS ~50%, Logistics/Channel fees ~12% -> ~38% contribution margin
      const estimatedCogs = Math.round(totalRevenue * 0.5);
      const estimatedLogisticsFees = Math.round(totalRevenue * 0.12);
      const estimatedContribution = totalRevenue - estimatedCogs - estimatedLogisticsFees;
      const contributionMarginPercent = totalRevenue
        ? Math.round((estimatedContribution / totalRevenue) * 1000) / 10
        : 38.0;

      const returnRatePercent = totalOrders
        ? Math.round((returns.length / totalOrders) * 1000) / 10
        : 0;

      // 14-day & 21-day Sell-through by product
      const sold14Map = new Map();
      const sold21Map = new Map();
      for (const o of orders) {
        const created = new Date(o.createdAt);
        for (const p of o.products || []) {
          const key = String(p.productId);
          if (created >= days21Ago)
            sold21Map.set(key, (sold21Map.get(key) || 0) + (p.quantity || 0));
          if (created >= days14Ago)
            sold14Map.set(key, (sold14Map.get(key) || 0) + (p.quantity || 0));
        }
      }

      const skuPerformance = products.slice(0, 12).map((p) => {
        const key = String(p._id);
        const sold14 = sold14Map.get(key) || 0;
        const sold21 = sold21Map.get(key) || 0;
        const currentStock = p.stock || 0;
        const sellThrough14 =
          sold14 + currentStock > 0 ? Math.round((sold14 / (sold14 + currentStock)) * 100) : 0;
        const sellThrough21 =
          sold21 + currentStock > 0 ? Math.round((sold21 / (sold21 + currentStock)) * 100) : 0;
        return {
          productId: p._id,
          name: p.name,
          sku: p.sku,
          currentStock,
          totalSold: p.selledNumber || 0,
          sold14Days: sold14,
          sold21Days: sold21,
          sellThrough14Percent: sellThrough14,
          sellThrough21Percent: sellThrough21,
        };
      });

      // Reorder Point (ROP) alerts across variants
      const ropAlerts = variants
        .filter((v) => v.stock <= (v.ropThreshold ?? 10))
        .map((v) => ({
          variantId: v._id,
          productId: v.productId?._id,
          productName: v.productId?.name || '',
          sku: v.sku,
          colorName: v.colorName,
          size: v.size,
          stock: v.stock,
          ropThreshold: v.ropThreshold ?? 10,
        }))
        .sort((a, b) => a.stock - b.stock);

      const b2bPipelineValue = b2bQuotes
        .filter((q) => !['rejected'].includes(q.status))
        .reduce((s, q) => s + (q.quotedTotalAmount || 0), 0);

      res.json({
        success: true,
        data: {
          kpis: {
            totalOrders,
            totalRevenue,
            b2cRetailRevenue,
            groupBuyRevenue,
            personalizationRevenue,
            b2bPipelineValue,
            b2bQuoteCount: b2bQuotes.length,
            aov,
            aovTarget: 450000,
            estimatedCogs,
            estimatedLogisticsFees,
            estimatedContribution,
            contributionMarginPercent,
            returnCount: returns.length,
            returnRatePercent,
          },
          ropAlerts,
          skuPerformance,
          campaignsSummary: campaigns,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async personalizationQueue(req, res, next) {
    try {
      const workStatusFilter = req.query.workStatus;
      const orders = await Order.find({
        status: { $in: ['pending', 'processing', 'shipped'] },
        'products.customization.enabled': true,
      })
        .select('orderId status customerEmail shippingAddress createdAt products')
        .sort({ createdAt: 1 })
        .lean();

      const tasks = [];
      for (const order of orders) {
        for (const line of order.products || []) {
          if (!line.customization?.enabled) continue;
          if (workStatusFilter && line.customization.workStatus !== workStatusFilter) continue;
          tasks.push({
            orderId: order._id,
            orderCode: order.orderId,
            orderStatus: order.status,
            customerName: order.shippingAddress?.fullName || order.customerEmail,
            createdAt: order.createdAt,
            lineId: line.lineId || String(line._id),
            productName: line.name,
            variantSummary: line.variantSummary || null,
            quantity: line.quantity,
            customization: line.customization,
            personalizationFee: line.personalizationFee || 0,
          });
        }
      }
      res.json({ success: true, data: tasks });
    } catch (err) {
      next(err);
    }
  }

  async updatePersonalizationStatus(req, res, next) {
    try {
      const { orderId, lineId } = req.params;
      const { workStatus } = req.body;
      if (!['pending_work', 'in_embroidery', 'qc_passed', 'packed'].includes(workStatus)) {
        fail('Trạng thái công đoạn cá nhân hóa không hợp lệ');
      }
      const order = await Order.findById(orderId);
      if (!order) fail('Đơn hàng không tồn tại', 404);
      const line = order.products.find((p) => p.lineId === lineId || String(p._id) === lineId);
      if (!line || !line.customization?.enabled) {
        fail('Không tìm thấy dòng sản phẩm cần cá nhân hóa', 404);
      }
      line.customization.workStatus = workStatus;
      await order.save();
      res.json({ success: true, data: { orderId: order._id, lineId, workStatus } });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AnalyticsController();
