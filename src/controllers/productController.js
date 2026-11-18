const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Brand = require('../models/Brand');
const Category = require('../models/Category');
const { syncParentProductStock } = require('../services/inventoryService');
const cloudinary = require('cloudinary').v2;
const crypto = require('crypto');
const safeHtml = require('../utils/safeHtml');
const { fail } = require('../services/pricingService');
const logger = require('../utils/logger');
const { adjustStock } = require('../services/stockAdjustment');
cloudinary.config({
  cloud_name: require('../config/environment').cloudinary.cloud_name,
  api_key: require('../config/environment').cloudinary.api_key,
  api_secret: require('../config/environment').cloudinary.api_secret,
  secure: true,
});
async function uploadFiles(files, uploaded) {
  // Sequential uploads allow cleanup even when a later file fails.
  for (const file of files || []) {
    const image = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'products',
          resource_type: 'image',
          format: 'webp',
          transformation: [{ width: 1600, crop: 'limit' }, { quality: 'auto' }],
        },
        (error, result) =>
          error ? reject(error) : resolve({ url: result.secure_url, public_id: result.public_id }),
      );
      stream.on('error', reject);
      stream.end(file.buffer);
    });
    uploaded.push(image);
  }
}
async function cleanup(images) {
  for (const image of images) {
    try {
      await cloudinary.uploader.destroy(image.public_id);
    } catch (err) {
      logger.error({ err, publicId: image.public_id }, 'Image cleanup requires retry');
    }
  }
}
async function validateReferences(data) {
  if (data.brand !== undefined && !(await Brand.exists({ _id: data.brand })))
    fail('Thương hiệu không tồn tại');
  if (data.category !== undefined && !(await Category.exists({ _id: data.category })))
    fail('Danh mục không tồn tại');
}
function cleanData(data) {
  const result = { ...data };
  delete result.existingImages;
  if (result.description !== undefined) result.description = safeHtml(result.description);
  return result;
}
class ProductController {
  async createProduct(req, res, next) {
    const uploaded = [];
    let saved = false;
    try {
      const data = cleanData(req.validatedBody);
      await validateReferences(data);
      await uploadFiles(req.files, uploaded);
      const product = await Product.create({
        ...data,
        ...(req.managerId ? { ownerId: req.managerId } : {}),
        productId: crypto.randomUUID(),
        stock: data.stock,
        instock: data.stock > 0,
        images: uploaded,
      });
      saved = true;
      res.status(201).json({ success: true, data: product });
    } catch (err) {
      if (!saved) await cleanup(uploaded);
      next(err);
    }
  }
  async updateProduct(req, res, next) {
    const uploaded = [];
    let saved = false;
    try {
      const product = await Product.findOne({
        _id: req.params._id,
        ...(req.managerId
          ? await require('../services/managerCatalogService').productScope(req.managerId)
          : {}),
      });
      if (!product) fail('Sản phẩm không tồn tại', 404);
      const data = cleanData(req.validatedBody);
      // Tồn kho chỉ đổi qua adjustStock (delta nguyên tử) hoặc luồng mua hàng; bỏ qua `stock` gửi lên
      // để form cũ không ghi đè số tồn vừa thay đổi.
      delete data.stock;
      await validateReferences(data);
      if (data.brand !== undefined)
        await require('../services/merchantScope').assertProductBrand(product, data.brand);
      const original = product.images.map((image) => ({
        url: image.url,
        public_id: image.public_id,
      }));
      const submitted = req.validatedBody.existingImages;
      const retained =
        submitted === undefined
          ? original
          : original.filter(
              (image) => submitted.includes(image.public_id) || submitted.includes(image.url),
            );
      // Legacy FE sent server-owned URLs. Unknown URLs/IDs never enter the stored image list.
      if (
        submitted?.some(
          (id) => !original.some((image) => image.public_id === id || image.url === id),
        )
      )
        fail('Danh sách ảnh không thuộc sản phẩm');
      await uploadFiles(req.files, uploaded);
      product.set(data);
      product.images = [...retained, ...uploaded];
      await product.save();
      saved = true;
      await cleanup(
        original.filter((image) => !retained.some((keep) => keep.public_id === image.public_id)),
      );
      res.json({ success: true, data: product });
    } catch (err) {
      if (!saved) await cleanup(uploaded);
      next(err);
    }
  }
  async adjustStock(req, res, next) {
    try {
      const { delta, reason } = req.validatedBody;
      const product = await adjustStock(Product, req.params._id, delta, {
        withInstock: true,
        notFoundMessage: 'Sản phẩm không tồn tại',
      });
      logger.info(
        {
          userId: req.userId,
          productId: String(product._id),
          delta,
          stock: product.stock,
          reason: reason || undefined,
        },
        'Product stock adjusted',
      );
      res.json({
        success: true,
        message: 'Điều chỉnh tồn kho thành công',
        data: { _id: product._id, stock: product.stock, instock: product.instock },
      });
    } catch (err) {
      next(err);
    }
  }
  async getAllProducts(req, res, next) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1),
        limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
      const filter = { archivedAt: null },
        keyword = String(req.query.keyword || req.query.search || '')
          .trim()
          .slice(0, 100);
      if (keyword)
        filter.name = { $regex: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      if (req.query.category) filter.category = req.query.category;
      if (req.query.brand) filter.brand = req.query.brand;
      if (req.query.brandSlug) {
        const brand = await Brand.findOne({ slug: req.query.brandSlug });
        filter.brand = brand?._id || null;
      }
      if (req.query.material) {
        filter.materialTag = {
          $regex: String(req.query.material)
            .trim()
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          $options: 'i',
        };
      }
      if (req.query.collection) {
        filter.collectionTag = {
          $regex: String(req.query.collection)
            .trim()
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          $options: 'i',
        };
      }
      if (req.query.fitType) filter.fitType = String(req.query.fitType).trim();
      if (req.query.personalizable === 'true') filter['personalizationConfig.enabled'] = true;

      // Variant-based faceted filtering (size / color / inStockOnly)
      if (req.query.size || req.query.color) {
        const variantFilter = { isActive: true };
        if (req.query.size) {
          const sizes = String(req.query.size)
            .split(',')
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean);
          if (sizes.length) variantFilter.size = { $in: sizes };
        }
        if (req.query.color) {
          const color = String(req.query.color)
            .trim()
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          variantFilter.colorName = { $regex: color, $options: 'i' };
        }
        if (req.query.inStockOnly === 'true') variantFilter.stock = { $gt: 0 };
        const matchedProductIds = await ProductVariant.distinct('productId', variantFilter);
        filter._id = { $in: matchedProductIds };
      }

      if (req.query.minPrice !== undefined || req.query.maxPrice !== undefined) {
        filter.price = {};
        for (const [name, op] of [
          ['minPrice', '$gte'],
          ['maxPrice', '$lte'],
        ])
          if (req.query[name] !== undefined) {
            const value = Number(req.query[name]);
            if (!Number.isFinite(value) || value < 0) fail('Khoảng giá không hợp lệ');
            filter.price[op] = value;
          }
      }
      const sort =
        req.query.sort === 'price_asc'
          ? { price: 1, _id: 1 }
          : req.query.sort === 'price_desc'
            ? { price: -1, _id: 1 }
            : { createdAt: -1, _id: -1 };
      if (['name', 'price', 'stock', 'createdAt'].includes(req.query.sortBy)) {
        for (const key of Object.keys(sort)) delete sort[key];
        sort[req.query.sortBy] = req.query.sortDirection === 'asc' ? 1 : -1;
        sort._id = 1;
      }
      const [data, total] = await Promise.all([
        Product.find(filter)
          .populate('brand', 'name slug logo cityAddress partnerType certifications')
          .populate('category', 'name slug')
          .sort(sort)
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        Product.countDocuments(filter),
      ]);
      const productIds = data.map((p) => p._id);
      const allVariants = productIds.length
        ? await ProductVariant.find({ productId: { $in: productIds }, isActive: true })
            .sort({ colorName: 1, size: 1 })
            .lean()
        : [];
      const variantsByProduct = new Map();
      for (const v of allVariants) {
        const key = String(v.productId);
        if (!variantsByProduct.has(key)) variantsByProduct.set(key, []);
        variantsByProduct.get(key).push(v);
      }
      const enriched = data.map((p) => ({
        ...p,
        variants: variantsByProduct.get(String(p._id)) || [],
      }));
      res.json({
        success: true,
        data: enriched,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }
  async getProductById(req, res, next) {
    try {
      const product = await Product.findById(req.params._id)
        .populate('brand')
        .populate('category')
        .lean();
      if (!product || product.archivedAt) fail('Sản phẩm không tồn tại', 404);
      if (product.description !== undefined) {
        product.description = safeHtml(product.description);
      }
      const variants = await ProductVariant.find({ productId: product._id, isActive: true })
        .sort({ colorName: 1, size: 1 })
        .lean();
      res.json({ success: true, data: { ...product, variants } });
    } catch (err) {
      next(err);
    }
  }
  async getProductBySlug(req, res, next) {
    try {
      const product = await Product.findOne({ slug: req.params.slug, archivedAt: null })
        .populate('brand')
        .populate('category')
        .lean();
      if (!product) fail('Sản phẩm không tồn tại', 404);
      if (product.description !== undefined) {
        product.description = safeHtml(product.description);
      }
      const variants = await ProductVariant.find({ productId: product._id, isActive: true })
        .sort({ colorName: 1, size: 1 })
        .lean();
      res.json({ success: true, data: { ...product, variants } });
    } catch (err) {
      next(err);
    }
  }
  async listVariants(req, res, next) {
    try {
      const variants = await ProductVariant.find({ productId: req.params._id })
        .sort({ colorName: 1, size: 1 })
        .lean();
      res.json({ success: true, data: variants });
    } catch (err) {
      next(err);
    }
  }
  async createVariant(req, res, next) {
    try {
      const product = await Product.findById(req.params._id);
      if (!product || product.archivedAt) fail('Sản phẩm không tồn tại', 404);
      const {
        sku,
        colorName,
        colorHex,
        size,
        priceDelta = 0,
        stock = 0,
        ropThreshold = 10,
        images = [],
      } = req.body;
      if (!sku || !colorName || !size) fail('Thiếu thông tin sku, colorName hoặc size');
      const variant = await ProductVariant.create({
        productId: product._id,
        sku: String(sku).trim().toUpperCase(),
        colorName: String(colorName).trim(),
        colorHex: String(colorHex || '#1C1C1A').trim(),
        size: String(size).trim().toUpperCase(),
        priceDelta: Number(priceDelta) || 0,
        stock: Math.max(0, Number(stock) || 0),
        ropThreshold: Math.max(0, Number(ropThreshold) || 10),
        images: Array.isArray(images) ? images : [],
      });
      await syncParentProductStock(product._id, null);
      res.status(201).json({ success: true, data: variant });
    } catch (err) {
      if (err.code === 11000) err.statusCode = 409;
      next(err);
    }
  }
  async updateVariant(req, res, next) {
    try {
      const variant = await ProductVariant.findOne({
        _id: req.params.variantId,
        productId: req.params._id,
      });
      if (!variant) fail('Biến thể không tồn tại', 404);
      const allowed = [
        'sku',
        'colorName',
        'colorHex',
        'size',
        'priceDelta',
        'ropThreshold',
        'images',
        'isActive',
      ];
      for (const field of allowed) {
        if (req.body[field] !== undefined) variant[field] = req.body[field];
      }
      await variant.save();
      await syncParentProductStock(req.params._id, null);
      res.json({ success: true, data: variant });
    } catch (err) {
      if (err.code === 11000) err.statusCode = 409;
      next(err);
    }
  }
  async adjustVariantStock(req, res, next) {
    try {
      const delta = Number(req.body.delta);
      if (!Number.isSafeInteger(delta) || delta === 0) fail('Delta tồn kho không hợp lệ');
      const filter = {
        _id: req.params.variantId,
        productId: req.params._id,
        ...(delta < 0 ? { stock: { $gte: -delta } } : {}),
      };
      const variant = await ProductVariant.findOneAndUpdate(
        filter,
        { $inc: { stock: delta } },
        { new: true },
      );
      if (!variant) fail('Biến thể không tồn tại hoặc không đủ tồn kho để giảm', 409);
      await syncParentProductStock(req.params._id, null);
      res.json({ success: true, data: variant });
    } catch (err) {
      next(err);
    }
  }
  async deleteVariant(req, res, next) {
    try {
      const variant = await ProductVariant.findOneAndDelete({
        _id: req.params.variantId,
        productId: req.params._id,
      });
      if (!variant) fail('Biến thể không tồn tại', 404);
      await syncParentProductStock(req.params._id, null);
      res.json({ success: true, message: 'Đã xóa biến thể' });
    } catch (err) {
      next(err);
    }
  }
  async deleteProduct(req, res, next) {
    try {
      if (await require('../models/Box').exists({ 'products.productId': req.params._id }))
        fail('Sản phẩm đang thuộc hộp; gỡ khỏi hộp trước khi xóa', 409);
      const product = await Product.findOneAndUpdate(
        {
          _id: req.params._id,
          ...(req.managerId
            ? await require('../services/managerCatalogService').productScope(req.managerId)
            : {}),
        },
        { archivedAt: new Date() },
        { new: true },
      );
      if (!product) fail('Sản phẩm không tồn tại', 404);
      res.json({ success: true, message: 'Đã xóa sản phẩm' });
    } catch (err) {
      next(err);
    }
  }
}
module.exports = new ProductController();
