require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Successfully connected to MongoDB Atlas'))
  .catch(err => console.log('❌ MongoDB connection error:', err));

// ==================== User Model ====================
const UserSchema = new mongoose.Schema({
  piUid: { type: String, required: true, unique: true },
  piUsername: { type: String, required: true },
  country: { type: String, required: true },
  phoneNumber: { type: String },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// ==================== Listing Model ====================
const ListingSchema = new mongoose.Schema({
  sellerUid: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  priceInPi: { type: Number, required: true, min: 0 },
  category: { type: String, required: true, enum: ['car', 'truck', 'motorcycle'] },
  make: { type: String },
  model: { type: String },
  year: { type: Number },
  mileage: { type: Number },
  country: { type: String, required: true },
  region: { type: String, required: true },
  images: [String],
  phoneNumber: { type: String, required: true },
  paid: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  active: { type: Boolean, default: false }
});
const Listing = mongoose.model('Listing', ListingSchema);

// ==================== API Routes ====================

// 1. Register User (free)
app.post('/api/register-user', async (req, res) => {
  const { piUid, piUsername, country } = req.body;
  if (!piUid || !piUsername || !country) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const user = await User.findOneAndUpdate(
      { piUid },
      { piUsername, country },
      { upsert: true, new: true }
    );

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Create Payment for New Listing (0.5 Pi)
app.post('/api/create-listing-payment', async (req, res) => {
  const { piUid } = req.body;
  if (!piUid) return res.status(400).json({ error: 'piUid required' });

  try {
    const paymentId = 'list_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); // Mock for Sandbox, real in Mainnet

    res.json({
      success: true,
      paymentId,
      amount: 0.5,
      memo: `CexPi Listing Fee - 0.5 Pi - User: ${piUid}`,
      metadata: { type: 'listing_fee', piUid }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Approve Payment (called from Frontend onReadyForServerApproval)
app.post('/api/approve-payment', async (req, res) => {
  const { paymentId } = req.body;

  try {
    const response = await axios.post(
      `https://api.minepi.com/v2/payments/${paymentId}/approve`,
      {},
      {
        headers: { 'Authorization': `Key ${process.env.PI_API_KEY}` }
      }
    );
    res.json({ success: true, response: response.data });
  } catch (error) {
    res.status(500).json({ error: error.response ? error.response.data : error.message });
  }
});

// 4. Complete Payment and Publish Listing (called from Frontend onReadyForServerCompletion)
app.post('/api/complete-listing', async (req, res) => {
  const { paymentId, title, description, priceInPi, category, make, model, year, mileage, region, images, phoneNumber, piUid } = req.body;

  try {
    // Complete the payment
    const completeResponse = await axios.post(
      `https://api.minepi.com/v2/payments/${paymentId}/complete`,
      { txid: 'dummy_txid' }, // In real, get txid from frontend or Pi SDK
      {
        headers: { 'Authorization': `Key ${process.env.PI_API_KEY}` }
      }
    );

    // Save listing after complete
    const listing = new Listing({
      sellerUid: piUid,
      title, description, priceInPi, category, make, model, year, mileage,
      country: (await User.findOne({ piUid })).country,
      region,
      images,
      phoneNumber,
      paid: true,
      active: true
    });
    await listing.save();

    res.json({
      success: true,
      message: 'Payment completed and listing published!'
    });
  } catch (error) {
    res.status(500).json({ error: error.response ? error.response.data : error.message });
  }
});

// Test Route
app.get('/', (req, res) => {
  res.send(`
    <div style="text-align:center; margin-top:100px; font-family:Arial;">
      <h1 style="color:#6B4CE6;">🚗 CexPi Marketplace</h1>
      <h2 style="color:green;">Backend Updated</h2>
      <p>Free access • Pay 0.5 Pi per listing</p>
    </div>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 CexPi Backend running on http://localhost:${PORT}`);
});
