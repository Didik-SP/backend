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

// API Key WhatsApp Fonnte
const FONNTE_API_KEY = "V6HUVKJDCtsZga1Y45gf";
const FONNTE_API_URL = "https://api.fonnte.com/send";
const ADMIN_PHONE = "62853332494472"; // Format internasional

// ----------- FUNGSI KIRIM NOTIFIKASI WA KE ADMIN -----------
async function sendAdminNotification(transactionData) {
  try {
    const {
      bookingId,
      namaLengkap,
      tanggalBooking,
      tema,
      tempat,
      hargaDP,
      hargaTotal,
      statusPembayaran,
      userPhone,
    } = transactionData;

    // Format pesan untuk admin
    const message = `
🔔 *NOTIFIKASI PEMBAYARAN*

User telah menyelesaikan transaksi DP!

📋 *Detail Transaksi:*
━━━━━━━━━━━━━━━━━━━━
👤 Nama: ${namaLengkap}
📅 Tanggal Booking: ${tanggalBooking}
🎭 Tema: ${tema}
📍 Tempat: ${tempat}

💰 *Detail Pembayaran:*
━━━━━━━━━━━━━━━━━━━━
💵 DP: Rp ${hargaDP.toLocaleString("id-ID")}
💸 Total: Rp ${hargaTotal.toLocaleString("id-ID")}
✅ Status: ${statusPembayaran}

📱 No. User: ${userPhone || "Tidak tersedia"}
🆔 Booking ID: ${bookingId}

Silakan cek aplikasi untuk verifikasi lebih lanjut.
`.trim();

    const response = await axios.post(
      FONNTE_API_URL,
      new URLSearchParams({
        target: ADMIN_PHONE,
        message: message,
        countryCode: "62",
      }),
      {
        headers: {
          Authorization: FONNTE_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (response.status === 200) {
      console.log("✅ Notifikasi WA berhasil dikirim ke admin:", ADMIN_PHONE);
      return true;
    } else {
      console.log("⚠️ Gagal kirim notifikasi WA:", response.data);
      return false;
    }
  } catch (error) {
    console.error("❌ Error mengirim notifikasi WA ke admin:", error.message);
    return false;
  }
}

// ----------- FUNGSI KIRIM NOTIFIKASI WA KE USER -----------
async function sendUserPaymentConfirmation(userPhone, transactionData) {
  try {
    // Format nomor telepon
    let formattedPhone = userPhone;
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "62" + formattedPhone.substring(1);
    }
    const { namaLengkap, tanggalBooking, tema, tempat, hargaDP, hargaTotal } =
      transactionData;
    const message = `
✅ *PEMBAYARAN DP BERHASIL!*
Terima kasih, ${namaLengkap}!
Pembayaran DP Anda telah kami terima.
📋 *Detail Booking:*
━━━━━━━━━━━━━━━━━━━━
📅 Tanggal: ${tanggalBooking}
🎭 Tema: ${tema}
📍 Tempat: ${tempat}
💰 *Detail Pembayaran:*
━━━━━━━━━━━━━━━━━━━━
✅ DP Dibayar: Rp ${hargaDP.toLocaleString("id-ID")}
💸 Total Booking: Rp ${hargaTotal.toLocaleString("id-ID")}
💰 Sisa Pelunasan: Rp ${(hargaTotal - hargaDP).toLocaleString("id-ID")}
Tim kami akan menghubungi Anda untuk konfirmasi lebih lanjut.
Terima kasih telah menggunakan layanan Dina Griya Rias! 🙏
`.trim();
    const response = await axios.post(
      FONNTE_API_URL,
      new URLSearchParams({
        target: formattedPhone,
        message: message,
        countryCode: "62",
      }),
      {
        headers: {
          Authorization: FONNTE_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    if (response.status === 200) {
      console.log("✅ Konfirmasi pembayaran dikirim ke user:", formattedPhone);
      return true;
    } else {
      console.log("⚠️ Gagal kirim konfirmasi ke user:", response.data);
      return false;
    }
  } catch (error) {
    console.error("❌ Error mengirim konfirmasi ke user:", error.message);
    return false;
  }
}

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
  try {
    const notif = req.body;
    console.log("📩 Callback diterima:", notif);
    const orderId = notif.order_id;
    const status = notif.transaction_status;
    const fraud = notif.fraud_status;
    let statusPembayaran = "belum bayar";
    let isPaymentSuccess = false;
    if (
      status === "settlement" ||
      (status === "capture" && fraud === "accept")
    ) {
      statusPembayaran = "selesai";
      isPaymentSuccess = true;
    } else if (status === "pending") {
      statusPembayaran = "menunggu pembayaran";
    } else if (["deny", "expire", "cancel"].includes(status)) {
      statusPembayaran = "gagal";
    }
    // 🔎 cari transaksi berdasarkan bookingId
    const transaksiRef = db.collection("transaksi");
    const snap = await transaksiRef.where("bookingId", "==", orderId).get();
    if (snap.empty) {
      console.log("❌ Dokumen tidak ditemukan:", orderId);
      return res.status(200).send("OK"); // ← Midtrans HARUS dapat 200, meskipun gagal
    }
    // update dokumen
    for (const doc of snap.docs) {
      await transaksiRef.doc(doc.id).update({
        statusPembayaran: statusPembayaran,
      });
      console.log("✅ Firestore updated:", doc.id, statusPembayaran);
      // 🔔 KIRIM NOTIFIKASI WA JIKA PEMBAYARAN BERHASIL
      if (isPaymentSuccess) {
        const transactionData = doc.data();
        // Ambil data user dari collection users
        let userPhone = null;
        if (transactionData.userId) {
          try {
            const userDoc = await db
              .collection("users")
              .doc(transactionData.userId)
              .get();
            if (userDoc.exists) {
              userPhone = userDoc.data().wa;
            }
          } catch (error) {
            console.error("Error getting user data:", error);
          }
        }
        // Data lengkap untuk notifikasi
        const notificationData = {
          bookingId: transactionData.bookingId || orderId,
          namaLengkap: transactionData.namaLengkap || "User",
          tanggalBooking: transactionData.tanggalBooking || "Tidak tersedia",
          tema: transactionData.tema || "Tidak tersedia",
          tempat: transactionData.tempat || "Tidak tersedia",
          hargaDP: transactionData.hargaDP || 0,
          hargaTotal: transactionData.hargaTotal || 0,
          statusPembayaran: statusPembayaran,
          userPhone: userPhone,
        };
        // Kirim notifikasi ke admin (fire-and-forget)
        sendAdminNotification(notificationData).catch((err) =>
          console.error("Error sending admin notification:", err)
        );
        // Kirim konfirmasi ke user (fire-and-forget)
        if (userPhone) {
          sendUserPaymentConfirmation(userPhone, notificationData).catch(
            (err) => console.error("Error sending user confirmation:", err)
          );
        }
      }
    }
    return res.status(200).send("OK");
  } catch (err) {
    console.error("🔥 Error update firestore:", err);
    return res.status(200).send("OK");
  }
});
// ----------------------------------------------------
module.exports = app;
module.exports.handler = serverless(app);
