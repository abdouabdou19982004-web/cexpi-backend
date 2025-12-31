require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.log('❌ MongoDB error:', err));

// User Model
const UserSchema = new mongoose.Schema({
  piUid: { type: String, required: true, unique: true },
  piUsername: { type: String, required: true },
  country: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// Listing Model
const ListingSchema = new mongoose.Schema({
  sellerUid: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  priceInPi: { type: Number, required: true },
  category: { type: String, required: true },
  make: String,
  model: String,
  year: Number,
  mileage: Number,
  country: { type: String, required: true },
  region: { type: String, required: true },
  images: [String],
  phoneNumber: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  active: { type: Boolean, default: true }
});
const Listing = mongoose.model('Listing', ListingSchema);

// Register user
app.post('/api/register-user', async (req, res) => {
  const { piUid, piUsername, country } = req.body;
  if (!piUid || !piUsername || !country) return res.status(400).json({ error: 'Missing fields' });

  try {
    await User.findOneAndUpdate({ piUid }, { piUsername, country }, { upsert: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create payment request
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

// Approve payment
app.post('/api/approve-payment', async (req, res) => {
  const { paymentId } = req.body;
  try {
    await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/approve`, {}, {
      headers: { 'Authorization': `Key ${process.env.PI_API_KEY}` }
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

// Complete payment and publish listing
app.post('/api/complete-listing', async (req, res) => {
  const { paymentId, txid, piUid, title, description, priceInPi, category, make, model, year, mileage, country, region, images, phoneNumber } = req.body;

  try {
    // تأكيد إكمال الدفع لـ Pi (مهم جدًا عشان ما يبقاش معلق)
    await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, { txid }, {
      headers: { 'Authorization': `Key ${process.env.PI_API_KEY}` }
    });

    // حفظ الإعلان
    const listing = new Listing({
      sellerUid: piUid,
      title, description, priceInPi, category, make, model, year, mileage,
      country, region, images, phoneNumber
    });
    await listing.save();

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

// جلب الإعلانات حسب الدولة
app.get('/api/get-listings', async (req, res) => {
  const { country } = req.query;
  if (!country) return res.status(400).json({ error: 'Country required' });

  try {
    const listings = await Listing.find({ country: country.trim(), active: true }).sort({ createdAt: -1 });
    res.json({ success: true, listings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => res.send('<h1>CexPi Backend - Running</h1>'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
