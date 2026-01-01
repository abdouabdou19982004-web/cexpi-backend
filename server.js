require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// اتصال MongoDB مع تحقق
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ Connected to MongoDB successfully'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// نموذج المستخدم
const UserSchema = new mongoose.Schema({
  piUid: { type: String, required: true, unique: true },
  piUsername: { type: String, required: true },
  country: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// نموذج الإعلان (مع تصحيح الحقول)
const ListingSchema = new mongoose.Schema({
  sellerUid: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  priceInPi: { type: Number, required: true },
  category: { type: String, required: true },
  make: { type: String },
  model: { type: String },
  year: { type: Number },
  mileage: { type: Number },
  country: { type: String, required: true },
  region: { type: String, required: true },
  images: { type: [String], default: [] },
  phoneNumber: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  active: { type: Boolean, default: true }
});
const Listing = mongoose.model('Listing', ListingSchema);

// تسجيل المستخدم
app.post('/api/register-user', async (req, res) => {
  try {
    const { piUid, piUsername, country } = req.body;
    if (!piUid || !piUsername || !country) return res.status(400).json({ error: 'Missing fields' });

    await User.findOneAndUpdate({ piUid }, { piUsername, country }, { upsert: true, new: true });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// إنشاء طلب دفع
app.post('/api/create-listing-payment', async (req, res) => {
  const { piUid } = req.body;
  if (!piUid) return res.status(400).json({ error: 'piUid required' });

  res.json({
    success: true,
    amount: 0.5,
    memo: 'CexPi Listing Fee - 0.5 Pi',
    metadata: { type: 'listing_fee', piUid }
  });
});

// موافقة على الدفع
app.post('/api/approve-payment', async (req, res) => {
  const { paymentId } = req.body;
  if (!paymentId) return res.status(400).json({ error: 'paymentId required' });

  try {
    await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/approve`, {}, {
      headers: { 'Authorization': `Key ${process.env.PI_API_KEY}` }
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Approve error:', e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

// إكمال الدفع
app.post('/api/complete-payment', async (req, res) => {
  const { paymentId, txid } = req.body;
  if (!paymentId || !txid) return res.status(400).json({ error: 'paymentId and txid required' });

  try {
    await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, { txid }, {
      headers: { 'Authorization': `Key ${process.env.PI_API_KEY}` }
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Complete error:', e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

// نشر الإعلان (المسار الرئيسي لزر Publish)
app.post('/api/complete-listing', async (req, res) => {
  try {
    const { piUid, title, description, priceInPi, category, make, model, year, mileage, country, region, images, phoneNumber } = req.body;

    if (!piUid || !title || !description || !priceInPi || !category || !country || !region || !phoneNumber) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newListing = new Listing({
      sellerUid: piUid,
      title,
      description,
      priceInPi,
      category,
      make: make || '',
      model: model || '',
      year: year || null,
      mileage: mileage || null,
      country,
      region,
      images: images || [],
      phoneNumber
    });

    await newListing.save();
    res.json({ success: true, message: 'Listing published successfully!' });
  } catch (e) {
    console.error('Save listing error:', e);
    res.status(500).json({ error: e.message || 'Failed to save listing' });
  }
});

// جلب الإعلانات
app.get('/api/get-listings', async (req, res) => {
  const { country } = req.query;
  if (!country) return res.status(400).json({ error: 'Country required' });

  try {
    const listings = await Listing.find({ country, active: true }).sort({ createdAt: -1 });
    res.json({ success: true, listings });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => res.send('<h1>CexPi Backend - Running successfully</h1>'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
