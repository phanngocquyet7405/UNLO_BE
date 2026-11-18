const crypto = require('crypto');
const B2BQuote = require('../models/B2BQuote');
const { fail } = require('../services/pricingService');

function generateQuoteCode() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `B2B-${datePart}-${rand}`;
}

class B2BController {
  async submitQuote(req, res, next) {
    try {
      const {
        companyName,
        taxCode = '',
        contactName,
        contactEmail,
        contactPhone,
        useCase = 'corporate_uniform',
        brandingStyle = 'subtle_cuff',
        logoFileUrl = '',
        items = [],
        targetDeliveryDate = null,
        notes = '',
      } = req.body;

      if (!companyName || !contactName || !contactEmail || !contactPhone) {
        fail('Vui lòng điền đầy đủ tên doanh nghiệp, người liên hệ, email và số điện thoại');
      }
      if (!Array.isArray(items) || !items.length) {
        fail('Vui lòng chọn ít nhất 1 sản phẩm và số lượng dự kiến (tối thiểu 10 sp)');
      }

      const cleanItems = items.map((item) => {
        const qty = Number(item.quantity);
        if (!item.productName || !Number.isInteger(qty) || qty < 10) {
          fail('Mỗi dòng báo giá B2B cần tên sản phẩm và số lượng từ 10 trở lên');
        }
        return {
          productId: item.productId || null,
          productName: String(item.productName).trim(),
          quantity: qty,
          colorPreference: String(item.colorPreference || '').trim(),
          sizeBreakdown: String(item.sizeBreakdown || '').trim(),
          unitQuotePrice: 0,
        };
      });

      const totalEstimatedQty = cleanItems.reduce((sum, i) => sum + i.quantity, 0);
      const quote = await B2BQuote.create({
        quoteCode: generateQuoteCode(),
        userId: req.userId || null,
        companyName: String(companyName).trim(),
        taxCode: String(taxCode).trim(),
        contactName: String(contactName).trim(),
        contactEmail: String(contactEmail).trim().toLowerCase(),
        contactPhone: String(contactPhone).trim(),
        useCase,
        brandingStyle,
        logoFileUrl: String(logoFileUrl).trim(),
        items: cleanItems,
        totalEstimatedQty,
        targetDeliveryDate: targetDeliveryDate ? new Date(targetDeliveryDate) : null,
        notes: String(notes).trim().slice(0, 2000),
        status: 'submitted',
        statusHistory: [
          {
            status: 'submitted',
            note: 'Khách hàng doanh nghiệp gửi yêu cầu báo giá Subtle Branding',
            changedBy: req.userId || null,
          },
        ],
      });

      res.status(201).json({
        success: true,
        message: 'Đã tiếp nhận yêu cầu báo giá B2B. Đội ngũ NU:LL sẽ phản hồi trong 24 giờ.',
        data: quote,
      });
    } catch (err) {
      next(err);
    }
  }

  async myQuotes(req, res, next) {
    try {
      const quotes = await B2BQuote.find({
        $or: [{ userId: req.userId }, { contactEmail: req.user?.email }],
      })
        .sort({ createdAt: -1 })
        .lean();
      res.json({ success: true, data: quotes });
    } catch (err) {
      next(err);
    }
  }

  async adminList(req, res, next) {
    try {
      const filter = {};
      if (req.query.status) filter.status = req.query.status;
      const quotes = await B2BQuote.find(filter).sort({ createdAt: -1 }).lean();
      res.json({ success: true, data: quotes });
    } catch (err) {
      next(err);
    }
  }

  async adminUpdate(req, res, next) {
    try {
      const quote = await B2BQuote.findById(req.params._id);
      if (!quote) fail('Yêu cầu báo giá B2B không tồn tại', 404);

      const {
        status,
        quotedTotalAmount,
        depositPercent,
        depositPaidAmount,
        balancePaidAmount,
        paymentTerms,
        adminNotes,
        items,
      } = req.body;

      if (quotedTotalAmount !== undefined) quote.quotedTotalAmount = Number(quotedTotalAmount) || 0;
      if (depositPercent !== undefined) quote.depositPercent = Number(depositPercent);
      if (depositPaidAmount !== undefined) quote.depositPaidAmount = Number(depositPaidAmount) || 0;
      if (balancePaidAmount !== undefined) quote.balancePaidAmount = Number(balancePaidAmount) || 0;
      if (paymentTerms !== undefined) quote.paymentTerms = String(paymentTerms);
      if (adminNotes !== undefined) quote.adminNotes = String(adminNotes);
      if (Array.isArray(items) && items.length) {
        quote.items = items;
        quote.totalEstimatedQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
      }
      if (status && status !== quote.status) {
        quote.status = status;
        quote.statusHistory.push({
          status,
          note: adminNotes || `Cập nhật trạng thái thành ${status}`,
          changedBy: req.userId,
        });
      }
      quote.handledBy = req.userId;
      await quote.save();
      res.json({ success: true, data: quote });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new B2BController();
