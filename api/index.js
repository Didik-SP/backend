const axios = require("axios");
const express = require("express");
const serverless = require("serverless-http");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");

const app = express();
app.use(bodyParser.json());

// ---------------- FIREBASE ADMIN -------------------
if (!admin.apps.length) {
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
const FONNTE_API_KEY = "diYa3hVukHmTeKrZ98Zx";
const FONNTE_API_URL = "https://api.fonnte.com/send";
const ADMIN_PHONE = "62853332494472";

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
        timeout: 10000, // 10 detik timeout
      }
    );

    console.log("✅ Response Fonnte (Admin):", response.data);
    
    if (response.status === 200) {
      console.log("✅ Notifikasi WA berhasil dikirim ke admin:", ADMIN_PHONE);
      return true;
    } else {
      console.log("⚠️ Gagal kirim notifikasi WA:", response.data);
      return false;
    }
  } catch (error) {
    console.error("❌ Error mengirim notifikasi WA ke admin:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });
    return false;
  }
}

// ----------- FUNGSI KIRIM NOTIFIKASI WA KE USER -----------
async function sendUserPaymentConfirmation(userPhone, transactionData) {
  try {
    let formattedPhone = userPhone;
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "62" + formattedPhone.substring(1);
    }
    
    console.log("📱 Mengirim WA ke user:", formattedPhone);
    
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
        timeout: 10000, // 10 detik timeout
      }
    );
    
    console.log("✅ Response Fonnte (User):", response.data);
    
    if (response.status === 200) {
      console.log("✅ Konfirmasi pembayaran dikirim ke user:", formattedPhone);
      return true;
    } else {
      console.log("⚠️ Gagal kirim konfirmasi ke user:", response.data);
      return false;
    }
  } catch (error) {
    console.error("❌ Error mengirim konfirmasi ke user:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });
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
    console.log("📩 Callback diterima dari Midtrans:", JSON.stringify(notif, null, 2));
    
    const orderId = notif.order_id;
    const status = notif.transaction_status;
    const fraud = notif.fraud_status;
    
    console.log(`🔍 Processing Order ID: ${orderId}, Status: ${status}, Fraud: ${fraud}`);
    
    let statusPembayaran = "belum bayar";
    let isPaymentSuccess = false;
    
    if (status === "settlement" || (status === "capture" && fraud === "accept")) {
      statusPembayaran = "selesai";
      isPaymentSuccess = true;
      console.log("✅ Pembayaran BERHASIL");
    } else if (status === "pending") {
      statusPembayaran = "menunggu pembayaran";
      console.log("⏳ Pembayaran PENDING");
    } else if (["deny", "expire", "cancel"].includes(status)) {
      statusPembayaran = "gagal";
      console.log("❌ Pembayaran GAGAL");
    }
    
    // 🔎 Cari transaksi berdasarkan bookingId
    const transaksiRef = db.collection("transaksi");
    const snap = await transaksiRef.where("bookingId", "==", orderId).get();
    
    if (snap.empty) {
      console.log("❌ Dokumen tidak ditemukan di Firestore:", orderId);
      return res.status(200).send("OK");
    }
    
    console.log(`📄 Ditemukan ${snap.docs.length} dokumen untuk update`);
    
    // Update dokumen dan kirim notifikasi
    for (const doc of snap.docs) {
      try {
        // Update status pembayaran
        await transaksiRef.doc(doc.id).update({
          statusPembayaran: statusPembayaran,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        console.log("✅ Firestore updated:", doc.id, "Status:", statusPembayaran);
        
        // 🔔 KIRIM NOTIFIKASI WA JIKA PEMBAYARAN BERHASIL
        if (isPaymentSuccess) {
          console.log("📲 Memulai proses pengiriman WhatsApp...");
          
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
                console.log("📱 Nomor WA user ditemukan:", userPhone);
              } else {
                console.log("⚠️ User document tidak ditemukan");
              }
            } catch (error) {
              console.error("❌ Error getting user data:", error);
            }
          } else {
            console.log("⚠️ userId tidak ada di transaksi data");
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
          
          console.log("📋 Notification Data:", JSON.stringify(notificationData, null, 2));
          
          // PENTING: Tunggu notifikasi selesai sebelum response
          try {
            // Kirim notifikasi ke admin
            console.log("📤 Mengirim notifikasi ke admin...");
            const adminSent = await sendAdminNotification(notificationData);
            console.log("Admin notification result:", adminSent);
            
            // Kirim konfirmasi ke user
            if (userPhone) {
              console.log("📤 Mengirim konfirmasi ke user...");
              const userSent = await sendUserPaymentConfirmation(userPhone, notificationData);
              console.log("User confirmation result:", userSent);
            } else {
              console.log("⚠️ User phone tidak tersedia, skip konfirmasi user");
            }
            
            console.log("✅ Semua notifikasi selesai diproses");
          } catch (notifError) {
            console.error("❌ Error saat mengirim notifikasi:", notifError);
            // Tetap lanjut, jangan throw error
          }
        }
      } catch (docError) {
        console.error("❌ Error processing document:", doc.id, docError);
      }
    }
    
    console.log("✅ Callback processing selesai, mengirim response OK");
    return res.status(200).send("OK");
    
  } catch (err) {
    console.error("🔥 Error critical di midtrans-callback:", err);
    // Tetap return 200 agar Midtrans tidak retry
    return res.status(200).send("OK");
  }
});

// ----------------------------------------------------
module.exports = app;
module.exports.handler = serverless(app);
