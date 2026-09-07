import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  makeCacheableSignalKeyStore
} from "@whiskeysockets/baileys";

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import pino from "pino";
import qrcode from "qrcode-terminal";
import fs from "fs";

// =====================================================
// إعدادات عامة
// =====================================================

const FIREBASE_CREDENTIALS =
  "./credentials/firebase-service-account.json";

const WHATSAPP_AUTH_FOLDER =
  "./auth_info";

const MESSAGES_COLLECTION =
  "messages";

// =====================================================
// Firebase
// =====================================================

console.log("🔥 تشغيل Firebase...");

if (!fs.existsSync(FIREBASE_CREDENTIALS)) {
  console.error(
    "❌ ملف Firebase غير موجود:"
  );

  console.error(
    FIREBASE_CREDENTIALS
  );

  process.exit(1);
}

const serviceAccount = JSON.parse(
  fs.readFileSync(
    FIREBASE_CREDENTIALS,
    "utf8"
  )
);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

const messagesRef =
  db.collection(MESSAGES_COLLECTION);

console.log(
  "✅ Firebase متصل"
);

// =====================================================
// WhatsApp
// =====================================================

const logger = pino({
  level: "silent"
});

let sock = null;

let firestoreListenerStarted = false;

// =====================================================
// تحويل رقم الهاتف إلى WhatsApp JID
// =====================================================

function phoneToJid(phone) {

  let number = String(phone)
    .replace(/\D/g, "");

  // 077xxxxxxx
  if (number.startsWith("0")) {
    number =
      "967" +
      number.substring(1);
  }

  // 77xxxxxxx
  if (!number.startsWith("967")) {
    number =
      "967" +
      number;
  }

  return `${number}@s.whatsapp.net`;
}

// =====================================================
// الاتصال بواتساب
// =====================================================

async function connectWhatsApp() {

  console.log(
    "📱 تشغيل WhatsApp..."
  );

  const {
    state,
    saveCreds
  } = await useMultiFileAuthState(
    WHATSAPP_AUTH_FOLDER
  );

  sock = makeWASocket({

    auth: {
      creds: state.creds,

      keys:
        makeCacheableSignalKeyStore(
          state.keys,
          logger
        )
    },

    browser:
      Browsers.ubuntu(
        "Chrome"
      ),

    logger,

    markOnlineOnConnect: false
  });

  // حفظ بيانات جلسة واتساب
  sock.ev.on(
    "creds.update",
    saveCreds
  );

  // =================================================
  // حالة الاتصال
  // =================================================

  sock.ev.on(
    "connection.update",
    async ({
      connection,
      lastDisconnect,
      qr
    }) => {

      // ---------------------------------------------
      // QR
      // ---------------------------------------------

      if (qr) {

        console.log("");
        console.log(
          "========================================"
        );

        console.log(
          "📱 امسح QR من واتساب"
        );

        console.log(
          "واتساب > الأجهزة المرتبطة > ربط جهاز"
        );

        console.log(
          "========================================"
        );

        qrcode.generate(
          qr,
          {
            small: true
          }
        );

        console.log("");
      }

      // ---------------------------------------------
      // Connecting
      // ---------------------------------------------

      if (
        connection === "connecting"
      ) {

        console.log(
          "🔄 جاري الاتصال بواتساب..."
        );
      }

      // ---------------------------------------------
      // Open
      // ---------------------------------------------

      if (
        connection === "open"
      ) {

        console.log("");
        console.log(
          "========================================"
        );

        console.log(
          "✅ WhatsApp متصل بنجاح"
        );

        console.log(
          "🔥 البوت جاهز"
        );

        console.log(
          "========================================"
        );

        console.log("");

        if (
          !firestoreListenerStarted
        ) {

          firestoreListenerStarted =
            true;

          startFirestoreListener();
        }
      }

      // ---------------------------------------------
      // Close
      // ---------------------------------------------

      if (
        connection === "close"
      ) {

        const statusCode =
          lastDisconnect
            ?.error
            ?.output
            ?.statusCode;

        console.log("");
        console.log(
          "⚠️ اتصال WhatsApp انقطع"
        );

        console.log(
          "Status:",
          statusCode
        );

        // تسجيل خروج يدوي
        if (
          statusCode ===
          DisconnectReason.loggedOut
        ) {

          console.log(
            "❌ تم تسجيل خروج الحساب"
          );

          console.log(
            "احذف مجلد auth_info ثم شغّل البوت مرة أخرى لعمل QR جديد."
          );

          return;
        }

        // إعادة الاتصال
        console.log(
          "🔄 إعادة الاتصال خلال 3 ثوانٍ..."
        );

        sock = null;

        setTimeout(
          () => {
            connectWhatsApp()
              .catch((error) => {

                console.error(
                  "❌ خطأ في إعادة الاتصال:",
                  error
                );
              });
          },
          3000
        );
      }
    }
  );
}

// =====================================================
// إرسال رسالة واتساب
// =====================================================

async function sendWhatsAppMessage(
  phone,
  text
) {

  if (!sock) {

    throw new Error(
      "WhatsApp غير متصل"
    );
  }

  const jid =
    phoneToJid(phone);

  console.log("");
  console.log(
    `📤 إرسال رسالة إلى ${phone}`
  );

  console.log(
    `📱 JID: ${jid}`
  );

  console.log(
    `💬 الرسالة: ${text}`
  );

  await sock.sendMessage(
    jid,
    {
      text: String(text)
    }
  );

  console.log(
    "✅ تم إرسال الرسالة إلى WhatsApp"
  );
}

// =====================================================
// حجز رسالة قبل الإرسال
// =====================================================

async function claimMessage(
  docRef
) {

  return await db.runTransaction(
    async (transaction) => {

      const snapshot =
        await transaction.get(
          docRef
        );

      if (
        !snapshot.exists
      ) {
        return false;
      }

      const data =
        snapshot.data();

      // الرسالة لم تعد pending
      if (
        data.status !== "pending"
      ) {
        return false;
      }

      transaction.update(
        docRef,
        {
          status: "processing",

          whatsappProcessingAt:
            Date.now()
        }
      );

      return true;
    }
  );
}

// =====================================================
// معالجة رسالة واحدة
// =====================================================

async function processMessage(
  doc
) {

  const data =
    doc.data();

  const phone =
    data.phone;

  const message =
    data.message;

  console.log("");
  console.log(
    "----------------------------------------"
  );

  console.log(
    `📨 رسالة جديدة: ${doc.id}`
  );

  console.log(
    "الهاتف:",
    phone
  );

  // ---------------------------------------------
  // التحقق من البيانات
  // ---------------------------------------------

  if (
    !phone ||
    !message
  ) {

    console.log(
      "❌ الرسالة ناقصة phone أو message"
    );

    await doc.ref.update({
      status: "failed",

      error:
        "phone أو message مفقود",

      whatsappFailedAt:
        Date.now()
    });

    return;
  }

  // ---------------------------------------------
  // حجز الرسالة
  // ---------------------------------------------

  let claimed = false;

  try {

    claimed =
      await claimMessage(
        doc.ref
      );

  } catch (error) {

    console.error(
      "❌ خطأ أثناء حجز الرسالة:",
      error.message
    );

    return;
  }

  if (!claimed) {

    console.log(
      "⏭️ الرسالة تم التعامل معها مسبقًا"
    );

    return;
  }

  // ---------------------------------------------
  // إرسال واتساب
  // ---------------------------------------------

  try {

    await sendWhatsAppMessage(
      phone,
      message
    );

    // نجاح
    await doc.ref.update({

      status: "sent",

      deliveredAt:
        Date.now(),

      whatsappSentAt:
        Date.now()
    });

    console.log(
      `🎉 ${doc.id} → sent`
    );

  } catch (error) {

    console.error(
      "❌ فشل إرسال WhatsApp:",
      error.message
    );

    await doc.ref.update({

      status: "failed",

      whatsappFailedAt:
        Date.now(),

      error:
        error.message
    });
  }
}

// =====================================================
// مراقبة Firestore
// =====================================================

function startFirestoreListener() {

  console.log("");
  console.log(
    "👀 بدء مراقبة Firestore..."
  );

  console.log(
    `📂 Collection: ${MESSAGES_COLLECTION}`
  );

  console.log(
    "🔎 الشرط: status == pending"
  );

  messagesRef
    .where(
      "status",
      "==",
      "pending"
    )
    .onSnapshot(

      async (snapshot) => {

        // -------------------------------------------
        // الرسائل الجديدة فقط
        // -------------------------------------------

        for (
          const change
          of snapshot.docChanges()
        ) {

          if (
            change.type !==
            "added"
          ) {
            continue;
          }

          try {

            await processMessage(
              change.doc
            );

          } catch (error) {

            console.error(
              "❌ خطأ أثناء معالجة الرسالة:",
              error
            );
          }
        }
      },

      (error) => {

        console.error("");
        console.error(
          "❌ Firestore Listener Error:"
        );

        console.error(
          error
        );
      }
    );

  console.log(
    "✅ Firestore Listener يعمل"
  );
}

// =====================================================
// تشغيل البوت
// =====================================================

async function main() {

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    "      WhatsApp Firebase Bot"
  );

  console.log(
    "========================================"
  );

  console.log("");

  await connectWhatsApp();
}

// =====================================================
// بدء البرنامج
// =====================================================

main()
  .catch((error) => {

    console.error("");
    console.error(
      "❌ خطأ رئيسي:"
    );

    console.error(
      error
    );

    process.exit(1);
  });