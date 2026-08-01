import { PrismaClient } from "@prisma/client";
import webpush from "web-push";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

// إعداد مكتبة web-push بالمفاتيح اللي حفظناها في ملف .env
webpush.setVapidDetails(
  "mailto:test@example.com", // حط أي إيميل هنا
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export async function GET(req) {
  try {
    // 1. بنجيب كل الموبايلات المتسجلة عندنا من الداتابيز
    const subscriptions = await prisma.subscription.findMany();

    if (subscriptions.length === 0) {
      return NextResponse.json({ message: "مفيش أي أجهزة متسجلة" }, { status: 404 });
    }

    // 2. بنجهز شكل الإشعار اللي هيظهر على الشاشة
    const payload = JSON.stringify({
      title: "تذكير من السيستم 🔔",
      body: "ده إشعار تجريبي عشان نتأكد إن الدنيا شغالة تمام!",
    });

    // 3. بنبعت الإشعار لكل الأجهزة المتسجلة
    const sendPromises = subscriptions.map((sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          auth: sub.auth,
          p256dh: sub.p256dh,
        },
      };
      // لو جهاز لغى الاشتراك، بنمسكه هنا عشان ميعملش إيرور
      return webpush.sendNotification(pushSubscription, payload).catch((err) => {
        console.error("فشل إرسال إشعار لجهاز:", err);
      });
    });

    await Promise.all(sendPromises);

    return NextResponse.json({ message: "تم إرسال الإشعار بنجاح!" }, { status: 200 });
  } catch (error) {
    console.error("خطأ في نظام الإشعارات:", error);
    return NextResponse.json({ error: "حصلت مشكلة في السيرفر" }, { status: 500 });
  }
}
