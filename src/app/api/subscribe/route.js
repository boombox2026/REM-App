import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function POST(req) {
  try {
    const subscription = await req.json();

    // هندور لو الاشتراك موجود نحدثه، لو مش موجود نكریته (عشان لو ضغطت مرتين ميعملش إيرور)
    await prisma.subscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      create: {
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });

    return NextResponse.json({ message: "تم الحفظ بنجاح!" }, { status: 201 });
  } catch (error) {
    console.error("Error saving subscription:", error);
    return NextResponse.json({ error: "حصلت مشكلة" }, { status: 500 });
  }
}