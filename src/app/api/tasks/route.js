import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// دالة التحليل المحلي الذكية (بدون ترحيل متسرع لبكرة وفهم دقيق للكسور)
function parseMultipleTasks(text) {
  const separators = /(?=\s+(?:هو|واكلم|وأكلم|وكلم|وهكلم|واروح|وأروح|وهروح|واعمل|وأعمل|وهعمل|وانزل|وأنزل|وهنزل|وبعدين|وبعدها|وكمان|كمان|ثم|و|والله|وارجع|وأرجع|وهارجع|وعايز|عايز|واطلع|وأطلع|وهطلع)\s+)/g;
  const chunks = text.split(separators).filter(chunk => chunk.trim() !== "");

  let tasks = [];
  let lastDateOffset = 0;

  for (let chunk of chunks) {
    let cleanTitle = chunk.replace(/^\s*(هو|وبعدين|وبعدها|وكمان|كمان|ثم|والله|و|وارجع|وأرجع|وهارجع|وعايز|عايز|واطلع|وأطلع|وهطلع|واكلم|وأكلم|وكلم|وهكلم|واروح|وأروح|وهروح|واعمل|وأعمل|وهعمل|وانزل|وأنزل|وهنزل)\s*/g, "").trim();
    cleanTitle = cleanTitle.replace(/^و(?=[أاإتثجحخدذرزسشصضطظعغفقكلمنهوي])/g, "").trim();
    if (!cleanTitle) continue;

    let hours = null; 
    let mins = 0;

    // تحديد اليوم لو المستخدم ذكر كلمات صريحة
    if (cleanTitle.includes("بكره") || cleanTitle.includes("غدا") || cleanTitle.includes("بكرة")) lastDateOffset = 1;
    else if (cleanTitle.includes("بعد بكره") || cleanTitle.includes("بعد بكرة")) lastDateOffset = 2;
    
    // استخراج الكسور بدقة تامة
    if (cleanTitle.includes("ونص") || cleanTitle.includes("و نص")) mins = 30;
    else if (cleanTitle.includes("وتلت") || cleanTitle.includes("و تلت")) mins = 20;
    else if (cleanTitle.includes("وربع") || cleanTitle.includes("و ربع")) mins = 15;
    
    let subtractHour = false;
    if (cleanTitle.includes("الا ربع") || cleanTitle.includes("إلا ربع")) {
        mins = 45;
        subtractHour = true;
    }

    const timeMatch = cleanTitle.match(/(?:الساع[ةه]\s*)?(\d{1,2})(?::(\d{2}))?\s*(الصبح|صباح[ااً]?|بالليل|مسا[ءااً]?|العصر|المغرب|الظهر)?/);
    
    if (timeMatch) {
      hours = parseInt(timeMatch[1]);
      if (timeMatch[2]) mins = parseInt(timeMatch[2]); 

      if (subtractHour) {
          hours -= 1;
          if (hours <= 0) hours += 12;
      }

      const period = timeMatch[3] || "";
      const isPM = period.includes("بالليل") || period.includes("مسا") || period.includes("العصر") || period.includes("المغرب") || period.includes("الظهر") || cleanTitle.includes("بالليل") || cleanTitle.includes("مسا") || cleanTitle.includes("العصر") || cleanTitle.includes("المغرب");
      const isAM = period.includes("الصبح") || period.includes("صباح");

      if (isPM && hours < 12) hours += 12; 
      else if (isAM && hours === 12) hours = 0; 
      else if (!isPM && !isAM && hours >= 1 && hours <= 6) hours += 12; // الافتراضي الساعات اللي بعد الظهر لو مقالش الصبح
    }
    
    let isoString = null;
    if (hours !== null) {
      let now = new Date();
      now.setUTCHours(now.getUTCHours() + 3); // توقيت مصر

      let targetDate = new Date(now);
      targetDate.setUTCDate(targetDate.getUTCDate() + lastDateOffset);
      targetDate.setUTCHours(hours, mins, 0, 0);

      // لن يتم ترحيل الوقت لبكرة أبداً إلا لو الوقت عدى وفات عليه أكتر من ساعة، أو لو المستخدم قال "بكرة" صراحة
      if (lastDateOffset === 0 && targetDate < now) {
          // لو الوقت فات بفارق بسيط (أقل من ساعة) نعتبرها النهاردة عادي، لو فات كتير ممكن نرحلها أو نسيبها زي ما تحب
          // بس هنا هنخليها النهاردة طالما اليوم لسه مقفلش عشان متترحش لوحدها بالغلط
      }

      const yyyy = targetDate.getUTCFullYear();
      const mm = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(targetDate.getUTCDate()).padStart(2, '0');
      const hh = String(targetDate.getUTCHours()).padStart(2, '0');
      const mn = String(targetDate.getUTCMinutes()).padStart(2, '0');
      
      isoString = `${yyyy}-${mm}-${dd}T${hh}:${mn}:00+03:00`;
    }

    // تنظيف اسم المهمة من الوقت والكسور
    cleanTitle = cleanTitle.replace(/(?:الساع[ةه]\s*)?\d{1,2}(?::\d{2})?\s*(الصبح|صباح[ااً]?|بالليل|مسا[ءااً]?|العصر|المغرب|الظهر)?/g, "").trim();
    cleanTitle = cleanTitle.replace(/\s*(بكره|بكرة|بعد بكره|النهارده|اليوم|غدا)\s*/g, "").trim();
    cleanTitle = cleanTitle.replace(/\s*(ونص|و نص|وربع|و ربع|وتلت|و tلت|الا ربع|إلا ربع)\s*/g, "").trim();

    if (cleanTitle) tasks.push({ title: cleanTitle, dueDate: isoString });
  }
  return tasks;
}

export async function GET() {
  try {
    const tasks = await prisma.task.findMany({ orderBy: { dueDate: 'asc' } });
    return NextResponse.json({ success: true, tasks });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message });
  }
}

export async function POST(request) {
  try {
    const { text } = await request.json();
    let tasksData = [];

    try {
      const currentTime = new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" });
      const prompt = `
        You are a smart personal assistant. Extract tasks from the following user input in Arabic.
        Input: "${text}"
        Current Date and Time in Egypt: ${currentTime}
        
        Requirements:
        Return the result strictly as a JSON array of objects. No markdown formatting, no explanations.
        Format:
        [
          {
            "title": "Task name in Arabic without time or date mentions",
            "dueDate": "ISO 8601 format with EGYPT timezone offset +03:00 (e.g. 2026-08-03T17:30:00+03:00)"
          }
        ]
        
        Rules:
        1. CRITICAL: Split EVERY distinct action into a separate task.
        2. FRACTIONS: Handle Arabic time fractions ("ونص" = +30 mins, "وربع" = +15 mins). Example: "6 ونص" means 18:30.
        3. DO NOT shift to tomorrow unless explicitly requested by the user ("بكرة"). Keep it for today.
        4. You MUST append +03:00 to the end of the dueDate string. Never use 'Z'.
        5. Do NOT wrap output in markdown code blocks. Return raw JSON array only.
      `;

      const apiKey = process.env.GROQ_API_KEY?.replace(/["\s]/g, '');
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama3-70b-8192",
          messages: [{ role: "system", content: prompt }],
          temperature: 0.1
        })
      });

      if (!response.ok) throw new Error("Groq API Error");

      const data = await response.json();
      const responseText = data.choices[0].message.content;
      const jsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      tasksData = JSON.parse(jsonString);

    } catch (apiError) {
      tasksData = parseMultipleTasks(text);
    }

    const createdTasks = await Promise.all(
      tasksData.map(task => 
        prisma.task.create({
          data: { 
            text: task.title, 
            dueDate: task.dueDate ? new Date(task.dueDate) : null 
          },
        })
      )
    );

    return NextResponse.json({ success: true, tasks: createdTasks });
  } catch (error) {
    return NextResponse.json({ success: false, error: "حدث خطأ غير متوقع" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { id, isCompleted } = await request.json();
    const updatedTask = await prisma.task.update({
      where: { id: parseInt(id) },
      data: { isCompleted },
    });
    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { id } = await request.json();
    await prisma.task.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}