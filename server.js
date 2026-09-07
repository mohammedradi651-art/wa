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

const WHATSAPP_AUTH_FOLDER =
  "./auth_info";

const MESSAGES_COLLECTION =
  "messages";

const RECONNECT_DELAY_MS =
  3000;

const FIREBASE_SERVICE_ACCOUNT = {
  type: "service_account",
  project_id: "alwadi-52b96",
  private_key_id: "34df697220557dd98f9d8a71f0708635f8556654",
  private_key:
    "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDnhFrOVCTrubLB\nQ+x6y5UgS0iSHW2EFOU/CPkdZToHEIReoausw8vahfY9Teal57SgmkeLtHMB8aoM\npn49piu3ZjxuvBeaMXUzYFri9VtcdREwQNvCAnWudgY97qePW+Cddq5doi4EglpW\nZWZrNHzc75NY3ZrNXsF2+h++B9vPiu+N7KO1se1VCZ3sIfPuYFT/1qPmZ6rkxVDK\n5LurL9xagGVhgNQvUxLtgOCX9rrUIG+RtVVhINozMi5wokbWENnLs2yTUTP8qlCn\nFAOSGLXldOTRVFmjCdb4t8erLsiCXdlUF+9hVBhAMIhLBX+ZtVqYVnoIL2rv4fwf\ndoTOyYxfAgMBAAECggEAL+S3+kX6607blVKNWavC2k7ooN14meHOuNcM3dFiizKW\nB5OPVaqdgcPDuFPkun5v5ed0lIiMYCMTqBFLPUqicYqzRr8fbNT9Z1bwBlJ2h25q\nU16fd4eVu7ULvoUf4a7CjSCPmqwhs+oZcRUB9nyBthzTkQcq7oBDKm884M10Yf75\nqVloKE2Hhs/fxPIGPzxjQZrWws6kXOuRTG3b0wwTLwsOPXSh7Eyyo34rX2fY0vLj\nLjwf6W+onYgzGVpVxaM/K+IqgfIkHUII4Ey6DFF+Ji9TGAZmi5PpuTGsn5OkB0sQ\nLtBlrtqf8d392qNMKO8R2RJQm1ZBJDQkJiy6Gl3yrQKBgQD3cIUBL7lgyqlI9mYD\nbBGg5TfLI/1EQdxStClLlflMsE0pP+DAdu97H/VAArkh2ERB9M+kQBbPDS/LI/F0\n/gnxqyx/UYIo20ldwoEjT+V4EvmETuTtLiCUutPuX8JFDbGus9B0/aP7CSbzGUgh\n6MtGRK3tsjo0CGyh7ruXOnzKpQKBgQDvhtC3Tx0UmgW49K48kB4SWzdCeHbI3yC6\nyp+GTzQLosstZLBk0nHU4mLL3D6HJzNw/i8J0bZdVy7VvHeVmYGs18aU9dAs4BlV\nkRK98rtzh7xkzHbfGjgY29DpvvrixqsP9PJuYoLsLVyAU58etqQRK7WVTVcyRO5a\nuPhULQB/swKBgQDbslcVt5cD/s0R0FzBWxnH3t2MC3dbPJLwB7DGwPFqCvtnzaSz\nnqaBjt2FqSVRjKEGYuReNN1Ll6zA1DgWJV0U62QF44wK1LEug31/qffXhhlvRVFz\n2cnp5Hw5oWJvR3pk4JkM1wva38Rqgh8OpJCf4mj/rIiLHJO/r6V13+NfVQKBgQCa\nuxxZTmIazOSldmqX9QF4GjS4W9lgKcOa5wnmWYPlgGSADmtktg2S2Cu6Raye4lP4\nyjrYvQBxi8BVkkot+dwrK7i8wY6Zbqru+6h/zC4Lk8O/2dVwih9y740lcpnfpTcc\nN7/kTv8EUslOnLZNwO57qSDEMhICB0VylcrVlbycwQKBgBrrHfn8n8ueAoDi88wO\nGa0lpU6NO7uIfWxcAL1PAcJl1V+z3xS8MdiFpQe5ptUtdF15/80qnWwDWZl8Q7uH\nxnchL87RN7HFEX8t4yS5bpIsyXU6cNwiD3RkSKej/v55LjcE0Pym+RW+H2orQeLx\n7UHd6TZN28V9u4ug7mH4baBw\n-----END PRIVATE KEY-----\n",
  client_email: "firebase-adminsdk-fbsvc@alwadi-52b96.iam.gserviceaccount.com",
  client_id: "104247278729354888343",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40alwadi-52b96.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
};

// =====================================================
// Firebase
// =====================================================

console.log("🔥 تشغيل Firebase...");

const firebaseCredential =
  cert(FIREBASE_SERVICE_ACCOUNT);

try {
  await firebaseCredential.getAccessToken();
} catch (error) {
  console.error(
    "❌ بيانات Firebase غير صالحة أو تم إلغاء المفتاح:"
  );

  console.error(error.message);
  process.exit(1);
}

initializeApp({
  credential: firebaseCredential
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
let firestoreListenerUnsubscribe = null;
let firestoreRestartTimer = null;

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

function clearWhatsAppSession() {

  const attemptDelete = (attempt = 0) => {
    try {

      if (
        fs.existsSync(
          WHATSAPP_AUTH_FOLDER
        )
      ) {

        const backupPath =
          `${WHATSAPP_AUTH_FOLDER}-backup-${Date.now()}`;

        try {
          fs.renameSync(
            WHATSAPP_AUTH_FOLDER,
            backupPath
          );
        } catch {
          fs.rmSync(
            WHATSAPP_AUTH_FOLDER,
            {
              recursive: true,
              force: true
            }
          );
        }

        try {
          fs.rmSync(
            backupPath,
            {
              recursive: true,
              force: true
            }
          );
        } catch (error) {
          if (attempt < 3) {
            setTimeout(
              () => {
                attemptDelete(attempt + 1);
              },
              1000
            );
            return;
          }
        }
      }

      console.log(
        "🧹 تم حذف جلسة واتساب القديمة. قم بمسح QR جديد عند التشغيل التالي."
      );

    } catch (error) {

      if (attempt < 3) {
        setTimeout(
          () => {
            attemptDelete(attempt + 1);
          },
          1000
        );
        return;
      }

      console.error(
        "❌ فشل حذف جلسة واتساب:",
        error
      );
    }
  };

  attemptDelete();
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

          if (
            sock?.ws
          ) {
            sock.ws.close();
          }

          clearWhatsAppSession();

          return;
        }

        const staleSessionStatusCodes = [
          440,
          DisconnectReason.badSession,
          DisconnectReason.connectionLost,
          DisconnectReason.timedOut
        ];

        if (
          staleSessionStatusCodes.includes(
            statusCode
          )
        ) {

          console.log(
            "⚠️ جلسة واتساب منتهية أو مكسورة. سيتم حذف الجلسة وإعادة ربط QR."
          );

          if (
            sock?.ws
          ) {
            sock.ws.close();
          }

          clearWhatsAppSession();

          firestoreListenerStarted = false;

          if (
            firestoreListenerUnsubscribe
          ) {
            firestoreListenerUnsubscribe();
            firestoreListenerUnsubscribe = null;
          }

          sock = null;

          return;
        }

        // إعادة الاتصال
        console.log(
          "🔄 إعادة الاتصال خلال 3 ثوانٍ..."
        );

        firestoreListenerStarted = false;

        if (
          firestoreListenerUnsubscribe
        ) {
          firestoreListenerUnsubscribe();
          firestoreListenerUnsubscribe = null;
        }

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
          RECONNECT_DELAY_MS
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

async function processPendingMessages() {

  try {

    const snapshot = await messagesRef
      .where(
        "status",
        "==",
        "pending"
      )
      .get();

    for (
      const doc
      of snapshot.docs
    ) {

      try {

        await processMessage(
          doc
        );

      } catch (error) {

        console.error(
          "❌ خطأ أثناء معالجة الرسالة الحالية:",
          error
        );
      }
    }

  } catch (error) {

    console.error(
      "❌ فشل جلب الرسائل pending عند التشغيل:",
      error
    );
  }
}

function startFirestoreListener() {

  if (
    firestoreListenerStarted
  ) {
    return;
  }

  firestoreListenerStarted = true;

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

  if (
    firestoreListenerUnsubscribe
  ) {
    firestoreListenerUnsubscribe();
    firestoreListenerUnsubscribe = null;
  }

  const query = messagesRef.where(
    "status",
    "==",
    "pending"
  );

  processPendingMessages();

  firestoreListenerUnsubscribe =
    query.onSnapshot(

      async (snapshot) => {

        for (
          const change
          of snapshot.docChanges()
        ) {

          if (
            change.type ===
            "removed"
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

        firestoreListenerStarted = false;

        if (
          firestoreListenerUnsubscribe
        ) {
          firestoreListenerUnsubscribe();
          firestoreListenerUnsubscribe = null;
        }

        if (
          firestoreRestartTimer
        ) {
          return;
        }

        firestoreRestartTimer = setTimeout(
          () => {
            firestoreRestartTimer = null;
            startFirestoreListener();
          },
          5000
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