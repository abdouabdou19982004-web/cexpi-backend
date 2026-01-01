// نشر الإعلان بعد الدفع
app.post('/api/complete-listing', async (req, res) => {
  const { piUid, title, description, priceInPi, category, make, model, year, mileage, country, region, images, phoneNumber } = req.body;

  if (!piUid || !title || !description || !priceInPi || !category || !country || !region || !phoneNumber) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const newListing = new Listing({
      sellerUid: piUid,
      title,
      description,
      priceInPi,
      category,
      make,
      model,
      year: year || null,
      mileage: mileage || null,
      country,
      region,
      images: images || [],
      phoneNumber,
      active: true
    });

    await newListing.save();

    res.json({ success: true, message: 'Listing published successfully!' });
  } catch (error) {
    console.error("Save listing error:", error);
    res.status(500).json({ error: error.message || 'Failed to save listing' });
  }
});
