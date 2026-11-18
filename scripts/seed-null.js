require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const User = require('../src/models/User');
const Brand = require('../src/models/Brand');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const ProductVariant = require('../src/models/ProductVariant');
const Campaign = require('../src/models/Campaign');
const Box = require('../src/models/Box');
const B2BQuote = require('../src/models/B2BQuote');
const Rating = require('../src/models/Rating');

async function seed() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/null_commerce?replicaSet=rs0';
  await mongoose.connect(uri);
  console.log('[NU:LL Seed] Connected to MongoDB:', uri);

  const passwordHash = await bcrypt.hash('Null@2026!', 12);

  const admin = await User.findOneAndUpdate(
    { email: 'admin@null.vn' },
    {
      $setOnInsert: {
        name: 'NU:LL HQ Admin',
        email: 'admin@null.vn',
        password: passwordHash,
        role: 'admin',
        isActive: true,
        addresses: [
          {
            fullName: 'NU:LL Studio HQ',
            country: 'Việt Nam',
            city: 'TP. Hồ Chí Minh',
            district: 'Quận 3',
            address: '124 Võ Văn Tần',
            phone: '0901234567',
          },
        ],
      },
    },
    { upsert: true, new: true },
  );

  const factoryManager = await User.findOneAndUpdate(
    { email: 'factory@null.vn' },
    {
      $setOnInsert: {
        name: 'Quản đốc Xưởng OEM Bình Dương',
        email: 'factory@null.vn',
        password: passwordHash,
        role: 'merchant',
        isActive: true,
      },
    },
    { upsert: true, new: true },
  );

  const customer = await User.findOneAndUpdate(
    { email: 'member@null.vn' },
    {
      $setOnInsert: {
        name: 'Minh Anh Nguyễn',
        email: 'member@null.vn',
        password: passwordHash,
        role: 'user',
        isActive: true,
        addresses: [
          {
            fullName: 'Minh Anh Nguyễn',
            country: 'Việt Nam',
            city: 'TP. Hồ Chí Minh',
            district: 'Quận 1',
            address: '45 Lê Lợi, Phường Bến Nghé',
            phone: '0912345678',
          },
        ],
      },
    },
    { upsert: true, new: true },
  );

  // 2 OEM/ODM Vietnamese Factories
  const factoryKnit = await Brand.findOneAndUpdate(
    { slug: 'xuong-det-kim-binh-duong-oem' },
    {
      $set: {
        name: 'Xưởng Dệt Kim Bình Dương (OEM Partner 01)',
        slug: 'xuong-det-kim-binh-duong-oem',
        ownerId: factoryManager._id,
        cityAddress: 'Thuận An, Bình Dương',
        partnerType: 'oem_factory',
        specialties: ['Cotton Supima 240-260 GSM', 'Interlock 2 chiều', 'Bo cổ chống bai nhão'],
        certifications: ['OEKO-TEX Standard 100', 'BSCI Audited', 'ISO 9001:2015'],
        moqMin: 150,
        leadTimeDays: 18,
        yearEstablished: 2012,
        qcPassRate: 99.4,
        description:
          'Đối tác gia công trực tiếp dòng áo thun thiết yếu cho NU:LL với 14 năm kinh nghiệm xuất khẩu thị trường Nhật Bản và Bắc Âu.',
        story:
          'Mỗi lô vải Supima đều qua 3 bước kiểm định độ co rút, độ bền màu và độ đều định lượng GSM trước khi lên bàn cắt.',
        coverImage:
          'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=1400&q=80',
      },
    },
    { upsert: true, new: true },
  );

  const factoryLinen = await Brand.findOneAndUpdate(
    { slug: 'xuong-may-linen-ha-noi-odm' },
    {
      $set: {
        name: 'Xưởng May Linen & Tailoring Hà Nội (OEM Partner 02)',
        slug: 'xuong-may-linen-ha-noi-odm',
        ownerId: factoryManager._id,
        cityAddress: 'Gia Lâm, Hà Nội',
        partnerType: 'odm_studio',
        specialties: ['100% European Flax Linen', 'Đường may cuốn sườn Pháp', 'Thêu Monogram vi tính'],
        certifications: ['European Flax Certified', 'WRAP Certified'],
        moqMin: 150,
        leadTimeDays: 21,
        yearEstablished: 2016,
        qcPassRate: 99.1,
        description:
          'Chuyên dòng sơ mi Linen tối giản và tổ thêu cá nhân hóa Monogram tinh tế theo quy trình Postponement của NU:LL.',
        story:
          'Sử dụng nút vỏ trai tự nhiên và kỹ thuật may cuốn sườn 5 mũi/cm giúp mặt trong áo gọn gàng như mặt ngoài.',
        coverImage:
          'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1400&q=80',
      },
    },
    { upsert: true, new: true },
  );

  // Categories
  const catTee = await Category.findOneAndUpdate(
    { slug: 'ao-thun-cotton' },
    { $set: { name: 'Áo Thun Cotton', slug: 'ao-thun-cotton', isActive: true } },
    { upsert: true, new: true },
  );
  const catLinen = await Category.findOneAndUpdate(
    { slug: 'ao-so-mi-linen' },
    { $set: { name: 'Áo Sơ Mi Linen', slug: 'ao-so-mi-linen', isActive: true } },
    { upsert: true, new: true },
  );
  const catAcc = await Category.findOneAndUpdate(
    { slug: 'phu-kien-toi-gian' },
    { $set: { name: 'Phụ Kiện Tối Giản', slug: 'phu-kien-toi-gian', isActive: true } },
    { upsert: true, new: true },
  );

  // Flagship NU:LL Products
  const productsSeed = [
    {
      slug: 'null-01-heavyweight-supima-tee',
      name: 'NU:LL 01 — Áo Thun Supima Cotton 240 GSM',
      sku: 'NUL-01-TEE',
      price: 349000,
      salePercent: 0,
      brand: factoryKnit._id,
      category: catTee._id,
      fitType: 'relaxed',
      materialTag: 'Supima Cotton',
      collectionTag: 'Essentials 01',
      description:
        '<p>Chiếc áo thun cơ bản được phát triển trực tiếp cùng xưởng dệt kim Bình Dương từ 100% sợi Cotton Supima chải kỹ, định lượng 240 GSM dày dặn nhưng thoáng khí. Thiết kế không logo phô trương, cổ bo 2 lớp giữ phom sau 50+ lần giặt.</p>',
      images: [
        {
          url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1000&q=80',
          public_id: 'null_seed_tee_1',
        },
        {
          url: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=1000&q=80',
          public_id: 'null_seed_tee_2',
        },
      ],
      specs: {
        fabricComposition: '100% Supima Cotton sợi dài chải kỹ (Combed Long-Staple)',
        gsmWeight: 240,
        shrinkageRate: '< 2% sau giặt ở 30°C (đã xử lý pre-shrunk)',
        stitchSpec: '5 mũi/cm, chạy chỉ đôi vai & gấu áo, bo cổ rib 2.2cm không bai nhão',
        originNote: 'Dệt vải & may hoàn thiện tại Xưởng Dệt Kim Bình Dương (OEM Partner 01)',
        careInstructions: [
          'Giặt máy chế độ nhẹ dưới 30°C, lộn trái áo khi giặt',
          'Không dùng thuốc tẩy clo; phơi ngang nơi thoáng mát',
          'Ủi hơi nước nhiệt độ trung bình nếu có thêu Monogram',
        ],
        qcChecklist: [
          'Kiểm tra định lượng vải ±5 GSM trên mỗi cuộn',
          'Kiểm 100% đường may cổ, nách và gấu áo theo AQL 2.5',
          'Test độ bền màu ma sát khô & ướt đạt cấp 4-5',
        ],
        certifications: ['OEKO-TEX Standard 100', 'BSCI Audited'],
      },
      costBreakdown: {
        materialCost: 112000,
        manufacturingCost: 68000,
        qcLogisticsCost: 42000,
        nullPrice: 349000,
        traditionalRetailPrice: 750000,
      },
      sizeGuide: {
        unit: 'cm',
        modelInfo: 'Mẫu nam 1m78 — 68kg mặc size L (phom Relaxed). Mẫu nữ 1m64 — 50kg mặc size S.',
        headers: ['Size', 'Rộng ngực', 'Dài áo', 'Rộng vai', 'Cân nặng gợi ý'],
        rows: [
          ['S', '52', '67', '47', '48 – 58 kg'],
          ['M', '55', '70', '49', '58 – 68 kg'],
          ['L', '58', '73', '51', '68 – 78 kg'],
          ['XL', '61', '75', '53', '78 – 90 kg'],
        ],
      },
      personalizationConfig: {
        enabled: true,
        allowMonogram: true,
        allowInnerLabel: true,
        maxMonogramChars: 3,
        monogramFee: 45000,
        innerLabelFee: 25000,
        extraLeadDays: 2,
      },
      variants: [
        { sku: 'NUL-01-OBS-S', colorName: 'Đen Obsidian', colorHex: '#181816', size: 'S', stock: 24, ropThreshold: 10 },
        { sku: 'NUL-01-OBS-M', colorName: 'Đen Obsidian', colorHex: '#181816', size: 'M', stock: 32, ropThreshold: 12 },
        { sku: 'NUL-01-OBS-L', colorName: 'Đen Obsidian', colorHex: '#181816', size: 'L', stock: 18, ropThreshold: 12 },
        { sku: 'NUL-01-OBS-XL', colorName: 'Đen Obsidian', colorHex: '#181816', size: 'XL', stock: 8, ropThreshold: 10 },
        { sku: 'NUL-01-CHK-S', colorName: 'Trắng Ngà', colorHex: '#F3F1EC', size: 'S', stock: 20, ropThreshold: 10 },
        { sku: 'NUL-01-CHK-M', colorName: 'Trắng Ngà', colorHex: '#F3F1EC', size: 'M', stock: 28, ropThreshold: 12 },
        { sku: 'NUL-01-CHK-L', colorName: 'Trắng Ngà', colorHex: '#F3F1EC', size: 'L', stock: 15, ropThreshold: 10 },
        { sku: 'NUL-01-STN-M', colorName: 'Xám Đá Stone', colorHex: '#A6A29A', size: 'M', stock: 6, ropThreshold: 10 },
      ],
    },
    {
      slug: 'null-02-european-linen-shirt',
      name: 'NU:LL 02 — Áo Sơ Mi 100% European Linen',
      sku: 'NUL-02-LIN',
      price: 589000,
      salePercent: 0,
      brand: factoryLinen._id,
      category: catLinen._id,
      fitType: 'relaxed',
      materialTag: '100% Linen',
      collectionTag: 'Linen Atelier',
      description:
        '<p>Áo sơ mi dệt từ 100% sợi lanh châu Âu định lượng 175 GSM đã qua công đoạn giặt mềm enzyme (enzyme-washed), giảm cảm giác thô ráp ngay lần mặc đầu tiên. Nút vỏ trai tự nhiên và đường may cuốn sườn Pháp tinh xảo.</p>',
      images: [
        {
          url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=1000&q=80',
          public_id: 'null_seed_linen_1',
        },
        {
          url: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=1000&q=80',
          public_id: 'null_seed_linen_2',
        },
      ],
      specs: {
        fabricComposition: '100% European Flax Linen (Enzyme Washed)',
        gsmWeight: 175,
        shrinkageRate: '< 1.5% (đã giặt hoàn tất công nghiệp)',
        stitchSpec: 'May cuốn sườn Pháp 5.5 mũi/cm, nút vỏ trai tự nhiên khâu chéo',
        originNote: 'May & hoàn thiện tại Xưởng May Linen Hà Nội (OEM Partner 02)',
        careInstructions: [
          'Giặt tay hoặc giặt túi lưới nước lạnh dưới 30°C',
          'Không vắt xoắn mạnh; phơi trên móc bản rộng trong bóng râm',
          'Ủi hơi nước khi vải còn hơi ẩm để giữ độ rủ tự nhiên',
        ],
        qcChecklist: [
          'Kiểm tra tỷ lệ xơ lanh và bề mặt dệt không lỗi sợi',
          'Kiểm độ chắc nút vỏ trai & cân đối lá cổ theo Tech Pack',
          'Đóng gói hộp giấy Kraft mộc chống ẩm không nilon thừa',
        ],
        certifications: ['European Flax Certified', 'WRAP Certified'],
      },
      costBreakdown: {
        materialCost: 195000,
        manufacturingCost: 118000,
        qcLogisticsCost: 56000,
        nullPrice: 589000,
        traditionalRetailPrice: 1350000,
      },
      sizeGuide: {
        unit: 'cm',
        modelInfo: 'Mẫu cao 1m76 — 66kg mặc size M (phom Relaxed Tailored).',
        headers: ['Size', 'Rộng ngực', 'Dài áo', 'Dài tay', 'Cân nặng gợi ý'],
        rows: [
          ['S', '54', '71', '59', '50 – 60 kg'],
          ['M', '57', '73', '61', '60 – 70 kg'],
          ['L', '60', '75', '63', '70 – 80 kg'],
          ['XL', '63', '77', '64', '80 – 92 kg'],
        ],
      },
      personalizationConfig: {
        enabled: true,
        allowMonogram: true,
        allowInnerLabel: true,
        maxMonogramChars: 3,
        monogramFee: 45000,
        innerLabelFee: 25000,
        extraLeadDays: 2,
      },
      variants: [
        { sku: 'NUL-02-OAT-S', colorName: 'Yến Mạch Mộc', colorHex: '#DDD5C7', size: 'S', stock: 16, ropThreshold: 8 },
        { sku: 'NUL-02-OAT-M', colorName: 'Yến Mạch Mộc', colorHex: '#DDD5C7', size: 'M', stock: 22, ropThreshold: 10 },
        { sku: 'NUL-02-OAT-L', colorName: 'Yến Mạch Mộc', colorHex: '#DDD5C7', size: 'L', stock: 14, ropThreshold: 10 },
        { sku: 'NUL-02-WHT-M', colorName: 'Trắng Sứ', colorHex: '#F9F8F5', size: 'M', stock: 19, ropThreshold: 10 },
        { sku: 'NUL-02-WHT-L', colorName: 'Trắng Sứ', colorHex: '#F9F8F5', size: 'L', stock: 7, ropThreshold: 10 },
        { sku: 'NUL-02-MOS-M', colorName: 'Rêu Trầm', colorHex: '#4E5D50', size: 'M', stock: 12, ropThreshold: 8 },
      ],
    },
    {
      slug: 'null-03-tencel-relaxed-polo',
      name: 'NU:LL 03 — Áo Polo Tencel-Cotton Công Sở Tối Giản',
      sku: 'NUL-03-POL',
      price: 459000,
      salePercent: 0,
      brand: factoryKnit._id,
      category: catTee._id,
      fitType: 'regular',
      materialTag: 'Tencel',
      collectionTag: 'Essentials 01',
      description:
        '<p>Kết hợp 60% sợi Tencel mát mịn và 40% Cotton chải kỹ định lượng 220 GSM. Lá cổ dệt phẳng đứng phom, trụ khuy ẩn tinh gọn — lựa chọn lý tưởng cho môi trường văn phòng hiện đại và đồng phục doanh nghiệp Subtle Branding.</p>',
      images: [
        {
          url: 'https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?auto=format&fit=crop&w=1000&q=80',
          public_id: 'null_seed_polo_1',
        },
      ],
      specs: {
        fabricComposition: '60% Tencel Lyocell / 40% Combed Cotton Piqué',
        gsmWeight: 220,
        shrinkageRate: '< 2% sau giặt chuẩn',
        stitchSpec: 'Trụ khuy ẩn 2 nút, bo cổ dệt jacquard mịn chống quăn mép',
        originNote: 'Dệt & may tại Xưởng Dệt Kim Bình Dương (OEM Partner 01)',
        careInstructions: ['Giặt nước lạnh 30°C', 'Phơi phẳng, không sấy nhiệt cao'],
        qcChecklist: ['Kiểm phẳng lá cổ & trụ khuy', 'Kiểm thoáng khí và độ rủ sợi Tencel'],
        certifications: ['OEKO-TEX Standard 100'],
      },
      costBreakdown: {
        materialCost: 145000,
        manufacturingCost: 89000,
        qcLogisticsCost: 48000,
        nullPrice: 459000,
        traditionalRetailPrice: 980000,
      },
      sizeGuide: {
        unit: 'cm',
        modelInfo: 'Phom Regular công sở gọn gàng.',
        headers: ['Size', 'Rộng ngực', 'Dài áo', 'Rộng vai'],
        rows: [
          ['S', '50', '68', '44'],
          ['M', '53', '70', '46'],
          ['L', '56', '72', '48'],
          ['XL', '59', '74', '50'],
        ],
      },
      personalizationConfig: {
        enabled: true,
        allowMonogram: true,
        allowInnerLabel: true,
        maxMonogramChars: 3,
        monogramFee: 45000,
        innerLabelFee: 25000,
        extraLeadDays: 2,
      },
      variants: [
        { sku: 'NUL-03-NVY-M', colorName: 'Xanh Đêm', colorHex: '#232B38', size: 'M', stock: 25, ropThreshold: 10 },
        { sku: 'NUL-03-NVY-L', colorName: 'Xanh Đêm', colorHex: '#232B38', size: 'L', stock: 20, ropThreshold: 10 },
        { sku: 'NUL-03-OBS-M', colorName: 'Đen Obsidian', colorHex: '#181816', size: 'M', stock: 18, ropThreshold: 10 },
        { sku: 'NUL-03-SND-L', colorName: 'Cát Nhạt', colorHex: '#C8BFAF', size: 'L', stock: 9, ropThreshold: 10 },
      ],
    },
    {
      slug: 'null-04-heavy-canvas-everyday-tote',
      name: 'NU:LL 04 — Túi Tote Canvas 16oz Mộc Tối Giản',
      sku: 'NUL-04-TOT',
      price: 289000,
      salePercent: 0,
      brand: factoryLinen._id,
      category: catAcc._id,
      fitType: 'standard',
      materialTag: 'Canvas',
      collectionTag: 'Accessories',
      description:
        '<p>Túi Tote vải Canvas Cotton mộc 16oz (450 GSM) đứng dáng, vừa laptop 16 inch, có ngăn phụ đựng bình nước và khóa bấm từ ẩn bên trong. Hỗ trợ thêu Monogram cá nhân hóa góc túi.</p>',
      images: [
        {
          url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1000&q=80',
          public_id: 'null_seed_tote_1',
        },
      ],
      specs: {
        fabricComposition: '100% Unbleached Heavy Cotton Canvas 16oz',
        gsmWeight: 450,
        shrinkageRate: 'Giặt điểm tại chỗ (spot clean)',
        stitchSpec: 'Đánh bọ gia cố quai chịu tải 12kg, đáy gấp hộp 12cm',
        originNote: 'Gia công tại Xưởng May Hà Nội (OEM Partner 02)',
        careInstructions: ['Lau sạch vết bẩn bằng khăn ẩm & xà phòng dịu nhẹ', 'Không giặt máy'],
        qcChecklist: ['Test chịu tải quai đeo 12kg', 'Kiểm tra đường may đánh bọ 4 góc'],
        certifications: ['OEKO-TEX Standard 100'],
      },
      costBreakdown: {
        materialCost: 85000,
        manufacturingCost: 55000,
        qcLogisticsCost: 34000,
        nullPrice: 289000,
        traditionalRetailPrice: 650000,
      },
      personalizationConfig: {
        enabled: true,
        allowMonogram: true,
        allowInnerLabel: false,
        maxMonogramChars: 3,
        monogramFee: 45000,
        innerLabelFee: 0,
        extraLeadDays: 2,
      },
      variants: [
        { sku: 'NUL-04-RAW-OS', colorName: 'Canvas Mộc', colorHex: '#EAE3D5', size: 'ONESIZE', stock: 40, ropThreshold: 12 },
        { sku: 'NUL-04-OBS-OS', colorName: 'Đen Obsidian', colorHex: '#181816', size: 'ONESIZE', stock: 26, ropThreshold: 12 },
      ],
    },
  ];

  const createdProducts = [];
  for (const item of productsSeed) {
    const { variants, ...prodData } = item;
    const totalStock = variants.reduce((s, v) => s + v.stock, 0);
    const product = await Product.findOneAndUpdate(
      { slug: prodData.slug },
      {
        $set: {
          ...prodData,
          ownerId: factoryManager._id,
          stock: totalStock,
          instock: totalStock > 0,
        },
        $setOnInsert: { productId: crypto.randomUUID() },
      },
      { upsert: true, new: true },
    );

    for (const v of variants) {
      await ProductVariant.findOneAndUpdate(
        { sku: v.sku },
        {
          $set: {
            ...v,
            productId: product._id,
            isActive: true,
          },
        },
        { upsert: true, new: true },
      );
    }
    createdProducts.push(product);
  }

  // 2 Live Group-Buy / Pre-Order Campaigns
  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 86400000);
  const in35Days = new Date(now.getTime() + 35 * 86400000);
  const in21Days = new Date(now.getTime() + 21 * 86400000);
  const in42Days = new Date(now.getTime() + 42 * 86400000);

  await Campaign.findOneAndUpdate(
    { slug: 'gom-don-lo-01-ao-thun-supima-240gsm' },
    {
      $set: {
        title: 'Lô 01 — Gom Đơn Mở Khóa Giá Xưởng Áo Thun Supima 240 GSM',
        slug: 'gom-don-lo-01-ao-thun-supima-240gsm',
        type: 'group_buy',
        productId: createdProducts[0]._id,
        factoryPartnerId: factoryKnit._id,
        description:
          'Gom đủ 150 áo để đặt dệt riêng cuộn vải Supima Cotton 240 GSM trực tiếp tại Xưởng Bình Dương. Đạt mốc 150 áo mở khóa mức giá xưởng 279.000đ/áo. Hoàn tiền 100% minh bạch nếu không đạt MOQ.',
        coverImage: createdProducts[0].images[0].url,
        moqTarget: 150,
        maxCapQty: 300,
        currentOrderedQty: 118,
        participantCount: 84,
        baseUnitPrice: 329000,
        pricingTiers: [
          { minQty: 1, unitPrice: 329000, label: 'Mốc khởi động (1–99 áo)' },
          { minQty: 100, unitPrice: 299000, label: 'Mốc ưu đãi (100–149 áo)' },
          { minQty: 150, unitPrice: 279000, label: 'Mở khóa Giá Xưởng (150+ áo)' },
        ],
        depositPercent: 100,
        startAt: new Date(now.getTime() - 3 * 86400000),
        endAt: in14Days,
        estimatedShipDate: in35Days,
        status: 'active',
        createdBy: admin._id,
      },
    },
    { upsert: true, new: true },
  );

  await Campaign.findOneAndUpdate(
    { slug: 'dat-truoc-lo-02-so-mi-european-linen' },
    {
      $set: {
        title: 'Pre-Order Lô 02 — Áo Sơ Mi 100% European Linen Enzyme-Washed',
        slug: 'dat-truoc-lo-02-so-mi-european-linen',
        type: 'pre_order',
        productId: createdProducts[1]._id,
        factoryPartnerId: factoryLinen._id,
        description:
          'Sản xuất lô nhỏ giới hạn 200 áo theo số lượng đặt trước nhằm hạn chế tồn kho dư thừa. Tặng miễn phí thêu Monogram cổ tay cho 100 khách đặt trước đầu tiên.',
        coverImage: createdProducts[1].images[0].url,
        moqTarget: 120,
        maxCapQty: 200,
        currentOrderedQty: 126,
        participantCount: 95,
        baseUnitPrice: 529000,
        pricingTiers: [
          { minQty: 1, unitPrice: 529000, label: 'Giá đặt trước' },
          { minQty: 120, unitPrice: 489000, label: 'Đã mở khóa Giá Lô Nhỏ' },
        ],
        depositPercent: 100,
        startAt: new Date(now.getTime() - 5 * 86400000),
        endAt: in21Days,
        estimatedShipDate: in42Days,
        status: 'moq_reached',
        createdBy: admin._id,
      },
    },
    { upsert: true, new: true },
  );

  // Capsule Bundle (Box)
  await Box.findOneAndUpdate(
    { name: 'NU:LL Essentials Capsule — Bộ 3 Trang Phục Tối Giản' },
    {
      $set: {
        ownerId: factoryManager._id,
        name: 'NU:LL Essentials Capsule — Bộ 3 Trang Phục Tối Giản',
        descriptions:
          '<p>Bộ Capsule tinh gọn cho cả tuần làm việc: 01 Áo Thun Supima 240 GSM + 01 Áo Sơ Mi 100% Linen + 01 Túi Tote Canvas 16oz. Tiết kiệm ngay 15% so với mua lẻ.</p>',
        stock: 30,
        validFrom: new Date(now.getTime() - 86400000),
        validTo: new Date(now.getTime() + 180 * 86400000),
        products: [
          {
            productId: createdProducts[0]._id,
            quantity: 1,
            price: createdProducts[0].price,
            name: createdProducts[0].name,
          },
          {
            productId: createdProducts[1]._id,
            quantity: 1,
            price: createdProducts[1].price,
            name: createdProducts[1].name,
          },
          {
            productId: createdProducts[3]._id,
            quantity: 1,
            price: createdProducts[3].price,
            name: createdProducts[3].name,
          },
        ],
        totalItem: 3,
        value: 1042000,
        discountPercent: 15,
        isGift: false,
        images: [createdProducts[1].images[0]],
      },
    },
    { upsert: true, new: true },
  );

  // Sample Verified Fit Review
  await Rating.findOneAndUpdate(
    { userId: customer._id, productId: createdProducts[0]._id },
    {
      $set: {
        rating: 5,
        fitRating: 'true_to_size',
        reviewerHeightCm: 175,
        reviewerWeightKg: 66,
        purchasedVariantSummary: 'Đen Obsidian / Size L',
        verifiedPurchase: true,
        comment:
          'Vải 240 GSM cầm rất đầm tay, cổ áo dày không bị nhăn sau khi giặt máy. Phần thêu 2 chữ cái ở cổ tay rất kín đáo và tinh tế, đúng chất quiet luxury.',
      },
    },
    { upsert: true, new: true },
  );
  await Product.findByIdAndUpdate(createdProducts[0]._id, {
    $set: { rate: 5, reviewCount: 1, fitSummary: { runs_small: 0, true_to_size: 1, runs_large: 0 } },
  });

  // Sample B2B Quote
  await B2BQuote.findOneAndUpdate(
    { quoteCode: 'B2B-20261118-DEMO' },
    {
      $setOnInsert: {
        quoteCode: 'B2B-20261118-DEMO',
        companyName: 'Atelier Studio Architecture Vietnam',
        taxCode: '0316987452',
        contactName: 'Trần Hoàng Nam',
        contactEmail: 'hr@atelierstudio.vn',
        contactPhone: '0909888777',
        useCase: 'onboarding_kit',
        brandingStyle: 'subtle_cuff',
        items: [
          {
            productId: createdProducts[0]._id,
            productName: createdProducts[0].name,
            quantity: 60,
            colorPreference: 'Đen Obsidian & Trắng Ngà',
            sizeBreakdown: 'S:10, M:20, L:20, XL:10',
            unitQuotePrice: 285000,
          },
          {
            productId: createdProducts[3]._id,
            productName: createdProducts[3].name,
            quantity: 60,
            colorPreference: 'Canvas Mộc',
            sizeBreakdown: 'ONESIZE: 60',
            unitQuotePrice: 220000,
          },
        ],
        totalEstimatedQty: 120,
        quotedTotalAmount: 30300000,
        depositPercent: 50,
        status: 'quoted',
        notes: 'Cần thêu logo kiến trúc kích thước 1.8cm cùng tông màu vải ở cổ tay trái, kèm hộp onboarding tối giản.',
      },
    },
    { upsert: true, new: true },
  );

  console.log('[NU:LL Seed] Completed successfully!');
  console.log('  Admin login:   admin@null.vn / Null@2026!');
  console.log('  Factory login: factory@null.vn / Null@2026!');
  console.log('  Member login:  member@null.vn / Null@2026!');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('[NU:LL Seed] Failed:', err);
  process.exit(1);
});
