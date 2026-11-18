const Rating = require('../models/Rating');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { fail } = require('../services/pricingService');

async function recomputeProductRating(productId) {
  const reviews = await Rating.find({ productId }).select('rating fitRating').lean();
  const count = reviews.length;
  const avg = count ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0;
  const fitSummary = { runs_small: 0, true_to_size: 0, runs_large: 0 };
  for (const r of reviews) {
    if (fitSummary[r.fitRating] !== undefined) fitSummary[r.fitRating] += 1;
  }
  await Product.findByIdAndUpdate(productId, {
    $set: { rate: avg, reviewCount: count, fitSummary },
  });
  return { rate: avg, reviewCount: count, fitSummary };
}

class ReviewController {
  async listByProduct(req, res, next) {
    try {
      const { productId } = req.params;
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 10));
      const [reviews, total, allStats] = await Promise.all([
        Rating.find({ productId })
          .populate('userId', 'name avatar')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        Rating.countDocuments({ productId }),
        Rating.find({ productId }).select('rating fitRating').lean(),
      ]);

      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      const fitSummary = { runs_small: 0, true_to_size: 0, runs_large: 0 };
      let sum = 0;
      for (const r of allStats) {
        sum += r.rating;
        if (distribution[r.rating] !== undefined) distribution[r.rating] += 1;
        if (fitSummary[r.fitRating] !== undefined) fitSummary[r.fitRating] += 1;
      }

      res.json({
        success: true,
        data: reviews,
        summary: {
          averageRating: allStats.length ? Math.round((sum / allStats.length) * 10) / 10 : 0,
          totalReviews: allStats.length,
          distribution,
          fitSummary,
        },
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }

  async upsertReview(req, res, next) {
    try {
      const { productId } = req.params;
      const product = await Product.findById(productId);
      if (!product || product.archivedAt) fail('Sản phẩm không tồn tại', 404);

      const rating = Number(req.body.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        fail('Số sao đánh giá phải từ 1 đến 5');
      }

      const fitRating = ['runs_small', 'true_to_size', 'runs_large'].includes(req.body.fitRating)
        ? req.body.fitRating
        : 'true_to_size';
      const comment = String(req.body.comment || '')
        .trim()
        .slice(0, 1500);
      const reviewerHeightCm = req.body.reviewerHeightCm ? Number(req.body.reviewerHeightCm) : null;
      const reviewerWeightKg = req.body.reviewerWeightKg ? Number(req.body.reviewerWeightKg) : null;
      const imgs = Array.isArray(req.body.imgs)
        ? req.body.imgs
            .slice(0, 5)
            .map((img) => ({ url: typeof img === 'string' ? img : img?.url }))
            .filter((i) => i.url)
        : [];

      // Check verified purchase from delivered/completed orders
      const deliveredOrder = await Order.findOne({
        userId: req.userId,
        status: { $in: ['delivered', 'completed'] },
        'products.productId': product._id,
      })
        .sort({ deliveredAt: -1 })
        .lean();

      const matchedLine = deliveredOrder?.products?.find(
        (p) => String(p.productId) === String(product._id),
      );
      const purchasedVariantSummary = matchedLine?.variantSummary?.size
        ? `${matchedLine.variantSummary.colorName} / Size ${matchedLine.variantSummary.size}`
        : String(req.body.purchasedVariantSummary || '').slice(0, 120);

      const review = await Rating.findOneAndUpdate(
        { userId: req.userId, productId: product._id },
        {
          $set: {
            rating,
            fitRating,
            comment,
            reviewerHeightCm,
            reviewerWeightKg,
            purchasedVariantSummary,
            verifiedPurchase: Boolean(deliveredOrder),
            orderId: deliveredOrder?._id || null,
            imgs,
          },
        },
        { upsert: true, new: true, runValidators: true },
      ).populate('userId', 'name avatar');

      const summary = await recomputeProductRating(product._id);
      res.status(201).json({ success: true, data: review, summary });
    } catch (err) {
      next(err);
    }
  }

  async deleteReview(req, res, next) {
    try {
      const review = await Rating.findById(req.params._id);
      if (!review) fail('Đánh giá không tồn tại', 404);
      if (String(review.userId) !== String(req.userId) && req.user?.role !== 'admin') {
        fail('Không có quyền xóa đánh giá này', 403);
      }
      const productId = review.productId;
      await review.deleteOne();
      await recomputeProductRating(productId);
      res.json({ success: true, message: 'Đã xóa đánh giá' });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ReviewController();
