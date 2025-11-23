const axios = require("axios");
const express = require("express");
const serverless = require("serverless-http");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");

const app = express();
app.use(bodyParser.json());

// ---------------- FIREBASE ADMIN -------------------
if (!admin.apps.length) {
  // Validasi environment variables
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!projectId || !privateKey || !clientEmail) {
    console.error("Missing env vars:", {
      projectId: !!projectId,
      privateKey: !!privateKey,
      clientEmail: !!clientEmail,
    });
    throw new Error(
      "Firebase credentials tidak lengkap! Periksa environment variables."
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: projectId,
      // Handle both formats: with literal \n or actual newlines
      privateKey: privateKey.replace(/\\n/g, "\n"),
      clientEmail: clientEmail,
    }),
  });
}

const db = admin.firestore();
// ---------------------------------------------------

const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const MIDTRANS_BASE_URL =
  "https://app.sandbox.midtrans.com/snap/v1/transactions";

// ------------------- SNAP TOKEN --------------------
app.post("/get-snap-token", async (req, res) => {
  try {
    const { order_id, gross_amount } = req.body;

    const parameter = {
      transaction_details: {
        order_id,
        gross_amount,
      },
    };

    const response = await axios.post(MIDTRANS_BASE_URL, parameter, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization:
          "Basic " + Buffer.from(MIDTRANS_SERVER_KEY + ":").toString("base64"),
      },
    });

    return res.status(200).json({
      snap_token: response.data.token,
    });
  } catch (error) {
    console.error("Midtrans Error:", error.response?.data || error.message);
    return res.status(500).json({
      status: "error",
      message: "Gagal membuat transaksi Midtrans.",
      detail: error.response?.data || error.message,
    });
  }
});

// ---------------- MIDTRANS CALLBACK -----------------
app.post("/midtrans-callback", async (req, res) => {
  const notif = req.body;
  console.log("📩 Callback diterima:", notif);
  const orderId = notif.order_id;
  const status = notif.transaction_status;
  const fraud = notif.fraud_status;
  let statusPembayaran = "belum bayar";
  // ======== STATUS SUKSES =========
  if (status === "settlement" || (status === "capture" && fraud === "accept")) {
    statusPembayaran = "sudah dp";
  }
  // ======== PENDING ===============
  else if (status === "pending") {
    statusPembayaran = "menunggu pembayaran";
  }
  // ======== GAGAL ==================
  else if (status === "deny" || status === "expire" || status === "cancel") {
    statusPembayaran = "gagal";
  }
  try {
    // CARI DOKUMEN Firestore BERDASARKAN bookingId order_id
    const transaksiRef = db.collection("transaksi");
    const snap = await transaksiRef.where("bookingId", "==", orderId).get();
    if (snap.empty) {
      console.log("❌ dokumen tidak ditemukan:", orderId);
      return res.status(404).json({ message: "Dokumen tidak ditemukan" });
    }
    snap.forEach(async (doc) => {
      await transaksiRef.doc(doc.id).update({
        statusPembayaran: statusPembayaran,
      });
      console.log("✔ Firestore updated:", doc.id);
    });
    return res.status(200).json({ message: "Callback processed" });
  } catch (err) {
    console.error("🔥 Error update firestore:", err);
    return res.status(500).json({ error: err.message });
  }
});
// ----------------------------------------------------
module.exports = app;
module.exports.handler = serverless(app);
