const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config()

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

/* -------------------- MULTER CONFIG -------------------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({
  storage,
  fileFilter(req, file, cb) {
    const allowed = ["image/png", "image/jpeg", "image/jpg"];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Only JPG & PNG allowed"));
  },
});

/* -------------------- DATABASE CONNECTION -------------------- */
const uri =
  `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.iovcwwa.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

/* -------------------- MAIN RUN FUNCTION -------------------- */
async function run() {
  await client.connect();
  console.log("MongoDB Connected ✔");

  const db = client.db("a10krishilink");
  const cropsCollection = db.collection("allcrops");
  const interestCollection = db.collection("interests");

  /* ---------------------- CROPS API ---------------------- */

  app.get("/allcrops", async (req, res) => {
    try {
      const crops = await cropsCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();
      res.send(crops);
    } catch (err) {
      console.error("GET /allcrops error:", err);
      res.status(500).send({ message: "Failed to fetch crops" });
    }
  });

  app.get("/allcrops/:id", async (req, res) => {
    try {
      const id = req.params.id;
      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid ID" });

      const crop = await cropsCollection.findOne({ _id: new ObjectId(id) });
      if (!crop) return res.status(404).send({ message: "Crop not found" });

      res.send(crop);
    } catch (err) {
      console.error("GET /allcrops/:id error:", err);
      res.status(500).send({ message: "Failed to load crop detail" });
    }
  });

  app.get("/mycrops/:email", async (req, res) => {
    try {
      const email = req.params.email;
      const crops = await cropsCollection
        .find({ userEmail: email })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(crops);
    } catch (err) {
      console.error("GET /mycrops/:email error:", err);
      res.status(500).send({ message: "Failed to fetch user crops" });
    }
  });

  app.get("/myinterests/:email", async (req, res) => {
    try {
      const email = req.params.email;
      const interests = await interestCollection
        .find({ buyerEmail: email })
        .sort({ createdAt: -1 })
        .toArray();

      const result = interests.map((i) => ({
        _id: i._id,
        cropId: i.cropId,
        cropName: i.cropName,
        sellerEmail: i.sellerEmail,
        quantity: i.quantity,
        message: i.message,
        status: i.status,
        date: i.createdAt ? i.createdAt.toISOString().split("T")[0] : null,
      }));

      res.send(result);
    } catch (err) {
      console.error("GET /myinterests/:email error:", err);
      res.status(500).send({ message: "Failed to fetch my interests" });
    }
  });

  app.post("/allcrops", upload.single("image"), async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).send({ message: "Image required" });

      const cropData = {
        name: req.body.name,
        type: req.body.type,
        pricePerUnit: Number(req.body.pricePerUnit),
        unit: req.body.unit,
        quantity: Number(req.body.quantity),
        description: req.body.description,
        location: req.body.location,
        image: req.file.filename,
        userEmail: req.body.userEmail,
        userName: req.body.userName,
        userPhoto: req.body.userPhoto || "",
        interests: [],
        createdAt: new Date(),
      };

      const result = await cropsCollection.insertOne(cropData);
      cropData._id = result.insertedId;

      res.send({ success: true, data: cropData });
    } catch (error) {
      console.error("POST /allcrops error:", error);
      res.status(500).send({ message: "Failed to add crop" });
    }
  });

  app.put("/allcrops/:id", upload.single("image"), async (req, res) => {
    try {
      const id = req.params.id;
      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid ID" });

      const existing = await cropsCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!existing) return res.status(404).send({ message: "Crop not found" });

      if (existing.userEmail !== req.body.userEmail)
        return res.status(403).send({ message: "Unauthorized" });

      let imageName = existing.image;
      if (req.file) {
        imageName = req.file.filename;
        const oldPath = path.join("uploads", existing.image);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      const updateDoc = {
        $set: {
          name: req.body.name,
          type: req.body.type,
          pricePerUnit: Number(req.body.pricePerUnit),
          unit: req.body.unit,
          quantity: Number(req.body.quantity),
          description: req.body.description,
          location: req.body.location,
          image: imageName,
          updatedAt: new Date(),
        },
      };

      await cropsCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);
      res.send({ success: true });
    } catch (err) {
      console.error("PUT /allcrops/:id error:", err);
      res.status(500).send({ message: "Failed to update crop" });
    }
  });

  app.delete("/allcrops/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const email = req.query.email;

      if (!email)
        return res.status(400).send({ message: "Email missing" });

      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid ID" });

      const crop = await cropsCollection.findOne({ _id: new ObjectId(id) });
      if (!crop) return res.status(404).send({ message: "Crop not found" });

      if (crop.userEmail !== email)
        return res.status(403).send({ message: "Unauthorized" });

      const imgPath = path.join("uploads", crop.image);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);

      await cropsCollection.deleteOne({ _id: new ObjectId(id) });

      res.send({ success: true });
    } catch (err) {
      console.error("DELETE /allcrops/:id error:", err);
      res.status(500).send({ message: "Delete failed" });
    }
  });

  /* ---------------------- INTEREST API ---------------------- */

  app.post("/interest", async (req, res) => {
    try {
      const { cropId, userEmail, userName, quantity, message } = req.body;

      if (!cropId || !ObjectId.isValid(cropId))
        return res
          .status(400)
          .send({ message: "Invalid or missing cropId" });

      if (!userEmail || typeof userEmail !== "string")
        return res.status(400).send({ message: "Missing userEmail" });

      const qtyNum = Number(quantity);
      if (!qtyNum || qtyNum < 1)
        return res.status(400).send({ message: "Quantity must be >= 1" });

      const crop = await cropsCollection.findOne({
        _id: new ObjectId(cropId),
      });
      if (!crop) return res.status(404).send({ message: "Crop not found" });

      if (crop.userEmail === userEmail)
        return res
          .status(403)
          .send({ message: "Owner cannot send interest" });

      if (typeof crop.quantity === "number" && qtyNum > crop.quantity)
        return res
          .status(400)
          .send({ message: `Requested quantity exceeds available (${crop.quantity})` });

      const already = crop.interests?.some(
        (i) => i.userEmail === userEmail
      );
      if (already)
        return res
          .status(400)
          .send({ message: "Already sent interest" });

      const interestId = new ObjectId();
      const newInterest = {
        _id: interestId,
        cropId,
        cropName: crop.name,
        userEmail,
        userName,
        quantity: qtyNum,
        message,
        status: "pending",
        createdAt: new Date(),
      };

      await cropsCollection.updateOne(
        { _id: new ObjectId(cropId) },
        { $push: { interests: newInterest } }
      );

      await interestCollection.insertOne({
        _id: interestId,
        cropId,
        cropName: crop.name,
        sellerEmail: crop.userEmail,
        buyerEmail: userEmail,
        userName,
        quantity: qtyNum,
        message,
        status: "pending",
        createdAt: new Date(),
      });

      res.send({ success: true, data: newInterest });
    } catch (err) {
      console.error("POST /interest error:", err);
      res.status(500).send({ message: "Failed to add interest" });
    }
  });

  app.get("/interest/:email", async (req, res) => {
    try {
      const email = req.params.email;
      const crops = await cropsCollection.find({ userEmail: email }).toArray();

      let all = [];
      for (const crop of crops) {
        if (Array.isArray(crop.interests)) {
          crop.interests.forEach((i) =>
            all.push({
              ...i,
              cropId: crop._id,
              cropName: crop.name,
              sellerEmail: crop.userEmail,
              cropImage: crop.image || null,
            })
          );
        }
      }

      all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.send(all);
    } catch (err) {
      console.error("GET /interest/:email error:", err);
      res.status(500).send({ message: "Failed to fetch interests" });
    }
  });

  app.get("/myInterests/:email", async (req, res) => {
    try {
      const email = req.params.email;

      const interests = await interestCollection
        .find({ buyerEmail: email })
        .sort({ createdAt: -1 })
        .toArray();

      const result = interests.map((i) => ({
        _id: i._id,
        cropId: i.cropId,
        cropName: i.cropName,
        sellerEmail: i.sellerEmail,
        quantity: i.quantity,
        message: i.message,
        status: i.status,
        date: i.createdAt ? i.createdAt.toISOString().split("T")[0] : null,
      }));

      res.send(result);
    } catch (err) {
      console.error("GET /myInterests/:email error:", err);
      res.status(500).send({ message: "Failed to fetch my interests" });
    }
  });

  app.patch("/interests/:id", async (req, res) => {
    try {
      const interestId = req.params.id;
      const { status } = req.body;

      if (!ObjectId.isValid(interestId))
        return res.status(400).send({ message: "Invalid interest id" });

      if (!["pending", "accepted", "rejected"].includes(status))
        return res.status(400).send({ message: "Invalid status" });

      const existingInterest = await interestCollection.findOne({
        _id: new ObjectId(interestId),
      });
      if (!existingInterest)
        return res.status(404).send({ message: "Interest not found" });

      const cropId = existingInterest.cropId;
      if (!ObjectId.isValid(cropId))
        return res.status(400).send({ message: "Invalid crop id" });

      const crop = await cropsCollection.findOne({ _id: new ObjectId(cropId) });
      if (!crop) return res.status(404).send({ message: "Crop not found" });

      await interestCollection.updateOne(
        { _id: new ObjectId(interestId) },
        { $set: { status: status, updatedAt: new Date() } }
      );

      await cropsCollection.updateOne(
        { _id: new ObjectId(cropId), "interests._id": new ObjectId(interestId) },
        { $set: { "interests.$.status": status, "interests.$.updatedAt": new Date() } }
      );

      if (status === "accepted") {
        const qtyToReduce = Number(existingInterest.quantity || 0);
        if (qtyToReduce > 0) {
          const newQty = Math.max(0, Number(crop.quantity || 0) - qtyToReduce);
          await cropsCollection.updateOne(
            { _id: new ObjectId(cropId) },
            { $set: { quantity: newQty, updatedAt: new Date() } }
          );
        }
      }

      const updatedInterest = await interestCollection.findOne({
        _id: new ObjectId(interestId),
      });

      res.send({ success: true, interest: updatedInterest });
    } catch (err) {
      console.error("PATCH /interests/:id error:", err);
      res.status(500).send({ message: "Failed to update interest status" });
    }
  });

 app.delete("/interest/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const email = req.query.email;

      if (!email)
        return res
          .status(400)
          .send({ message: "Email missing (authorization)" });

      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid ID" });

      const doc = await interestCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!doc)
        return res.status(404).send({ message: "Interest not found" });

      if (doc.buyerEmail !== email)
        return res.status(403).send({
          message: "Unauthorized — only buyer can delete",
        });

      await interestCollection.deleteOne({ _id: new ObjectId(id) });

      await cropsCollection.updateOne(
        { "interests._id": new ObjectId(id) },
        { $pull: { interests: { _id: new ObjectId(id) } } }
      );

      res.send({ success: true });
    } catch (err) {
      console.error("DELETE /interest/:id error:", err);
      res.status(500).send({ message: "Failed to delete interest" });
    }
  });
}

run().catch((err) => console.error("RUN failed:", err));
