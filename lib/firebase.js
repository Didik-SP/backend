// Tambahkan ini di PALING ATAS file
require("dotenv").config();

const admin = require("firebase-admin");

let firebaseApp;

function initializeFirebase() {
  // Jika sudah diinisialisasi, return yang sudah ada
  if (firebaseApp) {
    return firebaseApp;
  }

  // Cek apakah sudah ada app yang terinisialisasi
  if (admin.apps.length > 0) {
    firebaseApp = admin.apps[0];
    return firebaseApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  // Debug log (hapus setelah berhasil)
  console.log("🔍 Checking Firebase credentials...");
  console.log("Project ID:", projectId ? "✅" : "❌");
  console.log("Client Email:", clientEmail ? "✅" : "❌");
  console.log(
    "Private Key:",
    privateKey ? "✅ (length: " + privateKey.length + ")" : "❌"
  );

  // Validasi kredensial
  if (!projectId || !clientEmail || !privateKey) {
    console.error("❌ Missing credentials:", {
      projectId: !!projectId,
      clientEmail: !!clientEmail,
      privateKey: !!privateKey,
    });
    throw new Error("Firebase credentials tidak lengkap!");
  }

  // Format private key - handle berbagai format
  let formattedPrivateKey = privateKey;

  // Replace literal \n dengan newline sebenarnya
  formattedPrivateKey = formattedPrivateKey.replace(/\\n/g, "\n");

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: formattedPrivateKey,
      }),
    });

    console.log("✅ Firebase initialized successfully");
    return firebaseApp;
  } catch (error) {
    console.error("❌ Firebase initialization error:", error.message);
    throw error;
  }
}

function getFirestore() {
  if (!firebaseApp) {
    initializeFirebase();
  }
  return admin.firestore();
}

module.exports = {
  getFirestore,
  initializeFirebase,
};
