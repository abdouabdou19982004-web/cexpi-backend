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

// User and Listing models (same as before)
const UserSchema = new mongoose.Schema({
  piUid: String,
  piUsername: String,
  country: String,
  phoneNumber: String,
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const ListingSchema = new mongoose.Schema({
  sellerUid: String,
  title: String,
  description: String,
  priceInPi: Number,
  category: String,
  make: String,
  model: String,
  year: Number,
  mileage: Number,
  country: String,
  region: String,
  images: [String],
  phoneNumber: String,
  paid: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
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

// Create payment (returns payment object for frontend)
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

// Approve payment (called from frontend onReadyForServerApproval)
app.post('/api/approve-payment', async (req, res) => {
  const { paymentId } = req.body;

  try {
    await axios.post(
      `https://api.minepi.com/v2/payments/${paymentId}/approve`,
      {},
      { headers: { 'Authorization': `Key ${process.env.PI_API_KEY}` } }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

// Complete payment and publish listing (called from frontend onReadyForServerCompletion)
app.post('/api/complete-payment', async (req, res) => {
  const { paymentId, txid, listingData } = req.body;

  try {
    // تأكيد الدفع لـ Pi API
    await axios.post(
      `https://api.minepi.com/v2/payments/${paymentId}/complete`,
      { txid },
      { headers: { 'Authorization': `Key ${process.env.PI_API_KEY}` } }
    );

    // حفظ الإعلان بعد التأكيد الناجح
    const listing = new Listing({
      ...listingData,
      paid: true,
      active: true
    });
    await listing.save();

    res.json({ success: true, message: 'Payment completed and listing published!' });
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

app.get('/', (req, res) => res.send('<h1>CexPi Backend - Ready for real payments</h1>'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
