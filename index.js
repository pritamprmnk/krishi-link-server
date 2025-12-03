// server.js — Optimized Express + MongoDB backend (Base64 Image Compatible)

const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "20mb" })); // high limit for base64 images

// -------------------- DATABASE CONNECTION --------------------
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.iovcwwa.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { serverApi: ServerApiVersion.v1 });

const toOID = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : null);

// -------------------- MAIN RUN --------------------
async function run() {
  try {
    await client.connect();
    console.log("🌿 MongoDB Connected");

    const db = client.db("a10krishilink");
    const cropsCollection = db.collection("allcrops");
    const interestCollection = db.collection("interests");

    // -------------------- CROPS --------------------

    // Get all crops
    app.get("/allcrops", async (_req, res) => {
      try {
        const crops = await cropsCollection.find().sort({ createdAt: -1 }).toArray();
        res.send(crops);
      } catch {
        res.status(500).send({ error: "Failed to fetch crops" });
      }
    });

    // Get single crop
    app.get("/allcrops/:id", async (req, res) => {
      const oid = toOID(req.params.id);
      if (!oid) return res.status(400).send({ error: "Invalid crop ID" });

      const crop = await cropsCollection.findOne({ _id: oid });
      if (!crop) return res.status(404).send({ error: "Crop not found" });

      res.send(crop);
    });

    // User crops
    app.get("/mycrops/:email", async (req, res) => {
      try {
        const crops = await cropsCollection
          .find({ userEmail: req.params.email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(crops);
      } catch {
        res.status(500).send({ error: "Failed to fetch user crops" });
      }
    });

    // -------------------- ADD CROP --------------------
    app.post("/allcrops", async (req, res) => {
      try {
        const data = req.body;

        if (!data.image) return res.status(400).send({ error: "Image required" });
        if (!data.userEmail) return res.status(400).send({ error: "User email required" });

        const crop = {
          name: data.name,
          type: data.type,
          pricePerUnit: Number(data.pricePerUnit) || 0,
          unit: data.unit,
          quantity: Number(data.quantity) || 0,
          description: data.description,
          location: data.location,
          image: data.image, // Base64
          userEmail: data.userEmail,
          userName: data.userName || "",
          userPhoto: data.userPhoto || "",
          interests: [],
          createdAt: new Date(),
        };

        const result = await cropsCollection.insertOne(crop);
        crop._id = result.insertedId;

        res.send({ success: true, data: crop });
      } catch (err) {
        console.error("Add Crop Error:", err);
        res.status(500).send({ error: "Failed to add crop" });
      }
    });

    // -------------------- UPDATE CROP --------------------
    app.put("/allcrops/:id", async (req, res) => {
      try {
        const oid = toOID(req.params.id);
        if (!oid) return res.status(400).send({ error: "Invalid ID" });

        const existing = await cropsCollection.findOne({ _id: oid });
        if (!existing) return res.status(404).send({ error: "Crop not found" });

        if (existing.userEmail !== req.body.userEmail)
          return res.status(403).send({ error: "Unauthorized" });

        const body = req.body;

        await cropsCollection.updateOne(
          { _id: oid },
          {
            $set: {
              name: body.name,
              type: body.type,
              description: body.description,
              location: body.location,
              pricePerUnit: Number(body.pricePerUnit),
              quantity: Number(body.quantity),
              unit: body.unit,
              image: body.image || existing.image,
              updatedAt: new Date(),
            },
          }
        );

        res.send({ success: true });
      } catch {
        res.status(500).send({ error: "Failed to update crop" });
      }
    });

    // -------------------- DELETE CROP --------------------
    app.delete("/allcrops/:id", async (req, res) => {
      try {
        const oid = toOID(req.params.id);
        if (!oid) return res.status(400).send({ error: "Invalid ID" });

        const email = req.query.email;
        if (!email) return res.status(400).send({ error: "Email missing" });

        const crop = await cropsCollection.findOne({ _id: oid });
        if (!crop) return res.status(404).send({ error: "Crop not found" });

        if (crop.userEmail !== email) return res.status(403).send({ error: "Unauthorized" });

        await cropsCollection.deleteOne({ _id: oid });
        await interestCollection.deleteMany({ cropId: req.params.id });

        res.send({ success: true });
      } catch {
        res.status(500).send({ error: "Failed to delete crop" });
      }
    });

    // -------------------- INTEREST APIs --------------------

    // Add interest
    app.post("/interest", async (req, res) => {
      try {
        const { cropId, userEmail, userName, quantity, message } = req.body;

        if (!cropId || !userEmail)
          return res.status(400).send({ error: "Required fields missing" });

        const oid = toOID(cropId);
        if (!oid) return res.status(400).send({ error: "Invalid crop ID" });

        const crop = await cropsCollection.findOne({ _id: oid });
        if (!crop) return res.status(404).send({ error: "Crop not found" });

        if (crop.userEmail === userEmail)
          return res.status(403).send({ error: "You cannot show interest on your own crop" });

        const qty = Number(quantity);
        if (qty < 1) return res.status(400).send({ error: "Quantity must be >= 1" });

        const newInterest = {
          _id: new ObjectId(),
          cropId,
          cropName: crop.name,
          buyerEmail: userEmail,
          buyerName: userName,
          quantity: qty,
          message,
          status: "pending",
          createdAt: new Date(),
        };

        await cropsCollection.updateOne(
          { _id: oid },
          { $push: { interests: newInterest } }
        );

        await interestCollection.insertOne({
          ...newInterest,
          sellerEmail: crop.userEmail,
        });

        res.send({ success: true, data: newInterest });
      } catch {
        res.status(500).send({ error: "Failed to add interest" });
      }
    });

    // Seller interest list
    app.get("/interest/:email", async (req, res) => {
      try {
        const sellerEmail = req.params.email;

        const crops = await cropsCollection.find({ userEmail: sellerEmail }).toArray();

        const list = crops.flatMap((crop) =>
          (crop.interests || []).map((i) => ({
            ...i,
            cropId: String(crop._id),
            cropName: crop.name,
            cropImage: crop.image,
            sellerEmail,
          }))
        );

        list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.send(list);
      } catch {
        res.status(500).send({ error: "Failed to fetch interests" });
      }
    });

    // Update interest status
    app.patch("/interests/:id", async (req, res) => {
      try {
        const oid = toOID(req.params.id);
        if (!oid) return res.status(400).send({ error: "Invalid ID" });

        const { status } = req.body;

        await interestCollection.updateOne(
          { _id: oid },
          { $set: { status, updatedAt: new Date() } }
        );

        await cropsCollection.updateMany(
          { "interests._id": oid },
          {
            $set: {
              "interests.$.status": status,
              "interests.$.updatedAt": new Date(),
            },
          }
        );

        res.send({ success: true });
      } catch {
        res.status(500).send({ error: "Failed to update interest" });
      }
    });

    // Delete interest
    app.delete("/interest/:id", async (req, res) => {
      try {
        const oid = toOID(req.params.id);
        if (!oid) return res.status(400).send({ error: "Invalid ID" });

        const email = req.query.email;
        if (!email) return res.status(400).send({ error: "Email required" });

        const interest = await interestCollection.findOne({ _id: oid });
        if (!interest) return res.status(404).send({ error: "Interest not found" });

        if (interest.buyerEmail !== email)
          return res.status(403).send({ error: "Unauthorized" });

        await interestCollection.deleteOne({ _id: oid });

        await cropsCollection.updateOne(
          { "interests._id": oid },
          { $pull: { interests: { _id: oid } } }
        );

        res.send({ success: true });
      } catch {
        res.status(500).send({ error: "Failed to delete interest" });
      }
    });

    // Get buyer interests (My Interests)
app.get("/myInterests/:email", async (req, res) => {
  try {
    const buyerEmail = req.params.email;

    const list = await interestCollection
      .find({ buyerEmail })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(list);
  } catch (error) {
    console.error("Error fetching buyer interests:", error);
    res.status(500).send({ error: "Failed to fetch buyer interests" });
  }
});


    // Health route
    app.get("/", (_req, res) => res.send("Server OK ✓"));
  } catch (err) {
    console.error("Run Error:", err);
  }
}

run();

// For Vercel serverless compatibility
module.exports = app;

// Local run
if (require.main === module) {
  app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
}
