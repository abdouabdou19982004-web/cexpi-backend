/* ====== Dependencies ====== */
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');

/* ====== Verify Pi Token Middleware ====== */
async function verifyPiToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No authorization header' });

  const token = authHeader.replace('Bearer ', '');
  try {
    const response = await axios.get('https://api.minepi.com/v2/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    req.user = response.data;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid Pi token' });
  }
}

/* ====== Express App ====== */
const app = express();

/* ====== Security Middleware ====== */
app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

/* ====== MongoDB Connection ====== */
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB successfully'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

/* ====== User Model ====== */
const UserSchema = new mongoose.Schema({
  piUid: { type: String, required: true, unique: true },
  piUsername: { type: String, required: true },
  country: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

/* ====== Listing Model ====== */
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
  expiresAt: { type: Date, default: () => new Date(Date.now() + 30*24*60*60*1000) }, // حذف تلقائي بعد 30 يوم
  active: { type: Boolean, default: true }
});
const Listing = mongoose.model('Listing', ListingSchema);

/* ====== Routes ====== */

/* تسجيل المستخدم */
app.post('/api/register-user', verifyPiToken, async (req, res) => {
  const { piUid, piUsername, country } = req.body;
  if (!piUid || !piUsername || !country)
    return res.status(400).json({ error: 'Missing fields' });

  try {
    await User.findOneAndUpdate({ piUid }, { piUsername, country }, { upsert: true, new: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* إنشاء طلب دفع */
app.post('/api/create-listing-payment', verifyPiToken, async (req, res) => {
  const { piUid } = req.body;
  if (!piUid) return res.status(400).json({ error: 'piUid required' });

  res.json({
    success: true,
    amount: 0.5,
    memo: 'CexPi Listing Fee - 0.5 Pi',
    metadata: { type: 'listing_fee', piUid }
  });
});

/* الموافقة على الدفع */
app.post('/api/approve-payment', verifyPiToken, async (req, res) => {
  const { paymentId } = req.body;
  if (!paymentId) return res.status(400).json({ error: 'paymentId required' });

  try {
    await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/approve`, {}, {
      headers: { Authorization: `Key ${process.env.PI_API_KEY}` }
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

/* إكمال الدفع */
app.post('/api/complete-payment', verifyPiToken, async (req, res) => {
  const { paymentId, txid } = req.body;
  if (!paymentId || !txid)
    return res.status(400).json({ error: 'paymentId and txid required' });

  try {
    await axios.post(`https://api.minepi.com/v2/payments/${paymentId}/complete`, { txid }, {
      headers: { Authorization: `Key ${process.env.PI_API_KEY}` }
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.response?.data || e.message });
  }
});

/* نشر إعلان */
app.post('/api/complete-listing', verifyPiToken, async (req, res) => {
  const piUid = req.user.uid;
  const { title, description, priceInPi, category, make, model, year, mileage, country, region, images, phoneNumber } = req.body;

  if (!piUid || !title || !description || !priceInPi || !category || !country || !region || !phoneNumber)
    return res.status(400).json({ error: 'Missing required fields' });

  try {
    const newListing = new Listing({
      sellerUid: piUid,
      title, description, priceInPi, category,
      make: make || '', model: model || '', year: year || null, mileage: mileage || null,
      country, region, images: images || [], phoneNumber
    });
    await newListing.save();
    res.json({ success: true, message: 'Listing published successfully!' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* جلب الإعلانات */
app.get('/api/get-listings', async (req, res) => {
  try {
    const now = new Date();
    const listings = await Listing.find({ active: true, expiresAt: { $gte: now } }).sort({ createdAt: -1 });
    res.json({ success: true, listings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* حذف إعلان */
app.post('/api/delete-listing', verifyPiToken, async (req, res) => {
  const { listingId, piUid } = req.body;
  if (!listingId || !piUid) return res.status(400).json({ error: 'listingId and piUid required' });

  try {
    const listing = await Listing.findOne({ _id: listingId, sellerUid: piUid });
    if (!listing) return res.status(404).json({ error: 'Listing not found or not owned by you' });

    await Listing.deleteOne({ _id: listingId });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* Root */
app.get('/', (req, res) => res.send('<h1>CexPi Backend - Running</h1>'));

/* ====== Cron Job لحذف الإعلانات القديمة ====== */
setInterval(async () => {
  try {
    const result = await Listing.deleteMany({ expiresAt: { $lt: new Date() } });
    if (result.deletedCount > 0)
      console.log(`🗑️ Deleted ${result.deletedCount} expired listings`);
  } catch (err) {
    console.error("Error deleting expired listings:", err);
  }
}, 24 * 60 * 60 * 1000); // كل 24 ساعة

/* Start Server */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
