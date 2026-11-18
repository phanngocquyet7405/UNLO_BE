const request = require('supertest');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const app = require('../src/app');
const db = require('./helpers/db');
const User = require('../src/models/User');
const Brand = require('../src/models/Brand');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const ProductVariant = require('../src/models/ProductVariant');
const Campaign = require('../src/models/Campaign');
const Order = require('../src/models/Order');
const ReceiptRefund = require('../src/models/ReceiptRefund');
const { accessToken } = require('../src/services/sessionService');
const AuthSession = require('../src/models/AuthSession');

async function authFor(user) {
  const sessionId = crypto.randomUUID();
  await AuthSession.create({
    sessionId,
    userId: user._id,
    tokenVersion: user.tokenVersion || 0,
    refreshHash: crypto.randomBytes(32).toString('hex'),
    expiresAt: new Date(Date.now() + 86400000),
    persistent: false,
  });
  return `Bearer ${accessToken(user, sessionId)}`;
}

describe('NU:LL Minimalist Fashion M2C, Personalization, Group-Buy, B2B & RMA Integration', () => {
  let admin, factoryOwner, buyerA, buyerB;
  let adminAuth, buyerAAuth, buyerBAuth;
  let factory, category, product, variantM, variantL;

  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.closeDatabase();
  });

  beforeEach(async () => {
    await db.clearDatabase();
    const password = await bcrypt.hash('Test@123456', 10);
    [admin, factoryOwner, buyerA, buyerB] = await User.create([
      { name: 'Admin', email: 'admin@null.vn', password, role: 'admin', isActive: true },
      { name: 'Factory', email: 'factory@null.vn', password, role: 'merchant', isActive: true },
      {
        name: 'Buyer A',
        email: 'buyera@null.vn',
        password,
        role: 'user',
        isActive: true,
        addresses: [
          {
            fullName: 'Buyer A',
            country: 'VN',
            city: 'HCM',
            district: 'Q1',
            address: '10 Nguyen Hue',
            phone: '0901111222',
          },
        ],
      },
      {
        name: 'Buyer B',
        email: 'buyerb@null.vn',
        password,
        role: 'user',
        isActive: true,
        addresses: [
          {
            fullName: 'Buyer B',
            country: 'VN',
            city: 'HN',
            district: 'Hoan Kiem',
            address: '20 Hang Bai',
            phone: '0903333444',
          },
        ],
      },
    ]);

    [adminAuth, buyerAAuth, buyerBAuth] = await Promise.all([
      authFor(admin),
      authFor(buyerA),
      authFor(buyerB),
    ]);

    factory = await Brand.create({
      name: 'Xưởng Bình Dương OEM',
      slug: 'xuong-binh-duong-oem',
      ownerId: factoryOwner._id,
      cityAddress: 'Bình Dương',
      partnerType: 'oem_factory',
      certifications: ['OEKO-TEX 100'],
    });

    category = await Category.create({ name: 'Áo Thun Cotton', slug: 'ao-thun-cotton' });

    product = await Product.create({
      ownerId: factoryOwner._id,
      productId: crypto.randomUUID(),
      name: 'NU:LL 01 Supima Tee 240GSM',
      sku: 'NUL-01',
      price: 349000,
      description: '100% Supima Cotton',
      brand: factory._id,
      category: category._id,
      materialTag: 'Supima Cotton',
      fitType: 'relaxed',
      stock: 6,
      instock: true,
      personalizationConfig: {
        enabled: true,
        allowMonogram: true,
        allowInnerLabel: true,
        monogramFee: 45000,
        innerLabelFee: 25000,
      },
    });

    [variantM, variantL] = await ProductVariant.create([
      {
        productId: product._id,
        sku: 'NUL-01-BLK-M',
        colorName: 'Đen Obsidian',
        colorHex: '#181816',
        size: 'M',
        stock: 1,
        ropThreshold: 5,
      },
      {
        productId: product._id,
        sku: 'NUL-01-BLK-L',
        colorName: 'Đen Obsidian',
        colorHex: '#181816',
        size: 'L',
        stock: 5,
        ropThreshold: 5,
      },
    ]);
  });

  test('1. Personalization line isolation + Variant atomic concurrency prevents overselling', async () => {
    // Sync two carts both targeting the LAST size M blank, with DIFFERENT monograms (Postponement!)
    const itemA = {
      productId: String(product._id),
      variantId: String(variantM._id),
      quantity: 1,
      customization: {
        enabled: true,
        monogramText: 'M.A',
        font: 'serif_minimal',
        threadColor: '#F3F1EC',
        placement: 'left_cuff',
        giftBoxType: 'minimal_kraft',
      },
    };
    const itemB = {
      productId: String(product._id),
      variantId: String(variantM._id),
      quantity: 1,
      customization: {
        enabled: true,
        monogramText: 'K.T',
        font: 'sans_architect',
        threadColor: '#73706A',
        placement: 'hem',
      },
    };

    const quoteRes = await request(app)
      .post('/api/checkout/quote')
      .set('Authorization', buyerAAuth)
      .send({ items: [itemA] });
    expect(quoteRes.status).toBe(200);
    // 349,000 + 45,000 (monogram) + 25,000 (minimal_kraft) = 419,000
    expect(quoteRes.body.data.personalizationFee).toBe(70000);
    expect(quoteRes.body.data.totalAmount).toBe(419000);

    await request(app)
      .put('/api/carts/sync')
      .set('Authorization', buyerAAuth)
      .send({ items: [itemA] })
      .expect(200);
    await request(app)
      .put('/api/carts/sync')
      .set('Authorization', buyerBAuth)
      .send({ items: [itemB] })
      .expect(200);

    // Concurrent COD checkout on the last single unit of Size M
    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/checkout/check-out')
        .set('Authorization', buyerAAuth)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ addressId: String(buyerA.addresses[0]._id), paymentMethod: 'cod' }),
      request(app)
        .post('/api/checkout/check-out')
        .set('Authorization', buyerBAuth)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ addressId: String(buyerB.addresses[0]._id), paymentMethod: 'cod' }),
    ]);

    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses[0]).toBe(201);
    expect([400, 409]).toContain(statuses[1]);

    const freshVariantM = await ProductVariant.findById(variantM._id);
    expect(freshVariantM.stock).toBe(0);

    // Verify Postponement Queue lists the personalized line
    const queueRes = await request(app)
      .get('/api/admin/personalization-queue')
      .set('Authorization', adminAuth)
      .expect(200);
    expect(queueRes.body.data.length).toBe(1);
    expect(queueRes.body.data[0].customization.workStatus).toBe('pending_work');
  });

  test('2. Faceted product filter works by size, material, and personalizable flag', async () => {
    const res = await request(app)
      .get('/api/products/get-all-products')
      .query({ size: 'L', material: 'Supima', personalizable: 'true' })
      .expect(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].variants.length).toBe(2);

    const emptyRes = await request(app)
      .get('/api/products/get-all-products')
      .query({ size: 'XXL' })
      .expect(200);
    expect(emptyRes.body.data.length).toBe(0);
  });

  test('3. Group-Buy Campaign MOQ tracking & automatic MOQ-failed Refund Queue', async () => {
    const campRes = await request(app)
      .post('/api/campaigns')
      .set('Authorization', adminAuth)
      .send({
        title: 'Gom đơn Supima Test',
        type: 'group_buy',
        productId: String(product._id),
        moqTarget: 100,
        maxCapQty: 200,
        baseUnitPrice: 299000,
        pricingTiers: [{ minQty: 100, unitPrice: 269000, label: 'Giá xưởng' }],
        startAt: new Date(Date.now() - 3600000).toISOString(),
        endAt: new Date(Date.now() + 86400000).toISOString(),
        estimatedShipDate: new Date(Date.now() + 14 * 86400000).toISOString(),
      })
      .expect(201);
    const campaignId = campRes.body.data._id;

    // Buyer places a paid group-buy order
    await request(app)
      .put('/api/carts/sync')
      .set('Authorization', buyerAAuth)
      .send({
        items: [
          {
            productId: String(product._id),
            variantId: String(variantL._id),
            campaignId,
            quantity: 2,
          },
        ],
      })
      .expect(200);

    await request(app)
      .post('/api/checkout/check-out')
      .set('Authorization', buyerAAuth)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ addressId: String(buyerA.addresses[0]._id), paymentMethod: 'cod' })
      .expect(201);

    const updatedCamp = await Campaign.findById(campaignId);
    expect(updatedCamp.currentOrderedQty).toBe(2);

    // Mark order as paid, then trigger MOQ failure -> must enqueue ReceiptRefund
    await Order.updateMany({ campaignId }, { $set: { paymentStatus: 'paid' } });

    const refundRes = await request(app)
      .post(`/api/campaigns/${campaignId}/trigger-moq-refund`)
      .set('Authorization', adminAuth)
      .send({ reason: 'Không đủ MOQ 100 áo' })
      .expect(200);

    expect(refundRes.body.data.refundedCount).toBe(1);
    const refundDoc = await ReceiptRefund.findOne({ purpose: 'order' });
    expect(refundDoc).toBeTruthy();
    expect(refundDoc.amount).toBe(299000 * 2);
  });

  test('4. B2B Subtle Branding RFQ + Verified Fit Review + RMA Size Exchange + Unit Economics', async () => {
    // B2B RFQ
    const rfqRes = await request(app)
      .post('/api/b2b/quotes')
      .send({
        companyName: 'Studio Minimal Co.',
        taxCode: '0312345678',
        contactName: 'Lan Anh',
        contactEmail: 'lan@minimal.vn',
        contactPhone: '0908765432',
        useCase: 'onboarding_kit',
        brandingStyle: 'subtle_cuff',
        items: [{ productName: 'NU:LL 01 Supima Tee', quantity: 50 }],
      })
      .expect(201);
    expect(rfqRes.body.data.quoteCode).toMatch(/^B2B-/);

    // Delivered order -> Verified Fit Review & RMA Size Exchange (M -> L)
    const deliveredOrder = await Order.create({
      userId: buyerA._id,
      merchantId: factoryOwner._id,
      orderId: 'ORDTESTEXCHANGE01',
      paymentCode: 'NULLTEST001',
      status: 'delivered',
      paymentMethod: 'cod',
      paymentStatus: 'paid',
      totalAmount: 349000,
      products: [
        {
          productId: product._id,
          variantId: variantM._id,
          variantSummary: { sku: 'NUL-01-BLK-M', colorName: 'Đen Obsidian', size: 'M' },
          name: product.name,
          unitPrice: 349000,
          quantity: 1,
          totalPrice: 349000,
          brand: factory._id,
        },
      ],
    });

    const revRes = await request(app)
      .post(`/api/reviews/product/${product._id}`)
      .set('Authorization', buyerAAuth)
      .send({ rating: 5, fitRating: 'true_to_size', reviewerHeightCm: 175, comment: 'Rất vừa vặn' })
      .expect(201);
    expect(revRes.body.data.verifiedPurchase).toBe(true);
    expect(revRes.body.summary.fitSummary.true_to_size).toBe(1);

    // RMA Size Exchange M -> L
    const rmaRes = await request(app)
      .post('/api/returns')
      .set('Authorization', buyerAAuth)
      .send({
        orderId: String(deliveredOrder._id),
        type: 'exchange_size',
        reason: 'wrong_size',
        items: [
          {
            productId: String(product._id),
            originalVariantId: String(variantM._id),
            targetVariantId: String(variantL._id),
            quantity: 1,
          },
        ],
      })
      .expect(201);

    await request(app)
      .patch(`/api/returns/admin/${rmaRes.body.data._id}`)
      .set('Authorization', adminAuth)
      .send({ status: 'completed', adminNote: 'Đã đổi size L' })
      .expect(200);

    const [afterM, afterL] = await Promise.all([
      ProductVariant.findById(variantM._id),
      ProductVariant.findById(variantL._id),
    ]);
    expect(afterM.stock).toBe(2); // 1 + 1 returned
    expect(afterL.stock).toBe(4); // 5 - 1 exchanged

    // Referral + Unit Economics Analytics
    const refRes = await request(app)
      .get('/api/referrals/me')
      .set('Authorization', buyerAAuth)
      .expect(200);
    expect(refRes.body.data.profile.code).toBeTruthy();

    const analyticsRes = await request(app)
      .get('/api/admin/analytics/unit-economics')
      .set('Authorization', adminAuth)
      .expect(200);
    expect(analyticsRes.body.data.kpis.aovTarget).toBe(450000);
    expect(analyticsRes.body.data.ropAlerts.length).toBeGreaterThanOrEqual(1);
  });
});
