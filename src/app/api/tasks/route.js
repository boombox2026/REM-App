import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// دالة التحليل المحلي المحسنة لقراءة الساعات بدقة
function parseMultipleTasks(text) {
  const separators = /(?=\s+(?:هو|واكلم|وكلم|وهكلم|واروح|وهروح|واعمل|وهعمل|وانزل|وهنزل|وبعدين|وبعدها|وكمان|كمان|ثم|و|والله|وارجع|وهارجع|ارجع|وعايز|عايز|واطلع|وهطلع|اطلع|هطلع)\s+)/g;
  const chunks = text.split(separators).filter(chunk => chunk.trim() !== "");

  let tasks = [];
  let lastDateOffset = 0;

  for (let chunk of chunks) {
    let cleanTitle = chunk.replace(/^\s*(هو|وبعدين|وبعدها|وكمان|كمان|ثم|والله|و|وارجع|وهارجع|ارجع|وعايز|عايز|واطلع|وهطلع|اطلع|هطلع)\s*/g, "").trim();
    cleanTitle = cleanTitle.replace(/^و(?=[أاإتثجحخدذرزسشصضطظعغفقكلمنهوي])/g, "").trim();
    if (!cleanTitle) continue;

    let dueDate = new Date();
    let hours = null; // بيخليه فارغ عشان نعرف لو المستخدم مدرج وقت ولا لأ
    let mins = 0;

    if (cleanTitle.includes("بكره") || cleanTitle.includes("غدا") || cleanTitle.includes("بكرة")) lastDateOffset = 1;
    else if (cleanTitle.includes("بعد بكره") || cleanTitle.includes("بعد بكرة")) lastDateOffset = 2;
    else if (cleanTitle.includes("النهارده") || cleanTitle.includes("اليوم")) lastDateOffset = 0;
    
    dueDate.setDate(dueDate.getDate() + lastDateOffset);

    // بحث دقيق عن الساعات (سواء مكتوبة كـ 3، 5، أو الساعة 3)
    const timeMatch = cleanTitle.match(/(?:الساع[ةه]\s*)?(\d{1,2})(?::(\d{2}))?\s*(الصبح|صباح[ااً]?|بالليل|مسا[ءااً]?|العصر|المغرب|الظهر)?/);
    
    if (timeMatch) {
      hours = parseInt(timeMatch[1]);
      if (timeMatch[2]) mins = parseInt(timeMatch[2]);

      const period = timeMatch[3] || "";
      const isPM = period.includes("بالليل") || period.includes("مسا") || period.includes("العصر") || period.includes("المغرب") || period.includes("الظهر");
      const isAM = period.includes("الصبح") || period.includes("صباح");

      // تعديل التوقيت بناءً على الفترة المسائية أو الصباحية
      if (isPM && hours < 12) {
        hours += 12;
      } else if (isAM && hours === 12) {
        hours = 0;
      } else if (!isPM && !isAM) {
        // لو مكشفتش كلمة ليل أو صبح، لو الساعة أقل من 12 والوقت نهاراً نفترضها سياقياً، أو نسيبها زي ما هي
        if (hours >= 1 && hours <= 6) hours += 12; // افتراض العصر أو المساء لو قال الساعة 3 سكتة
      }
    }
    
    if (hours !== null) {
      dueDate.setHours(hours, mins, 0, 0);
    } else {
      dueDate = null; // لو مفيش وقت مذكور، متبوظش اليوم وتخليه الساعة 12 الصبح
    }

    // تنظيف اسم المهمة من الوقت والأيام
    cleanTitle = cleanTitle.replace(/(?:الساع[ةه]\s*)?\d{1,2}(?::\d{2})?\s*(الصبح|صباح[ااً]?|بالليل|مسا[ءااً]?|العصر|المغرب|الظهر)?/g, "").trim();
    cleanTitle = cleanTitle.replace(/\s*(بكره|بكرة|بعد بكره|النهارده|اليوم|غدا)\s*/g, "").trim();

    if (cleanTitle) tasks.push({ title: cleanTitle, dueDate });
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
          "dueDate": "ISO 8601 format for date and time if a specific time/hour is mentioned by the user, otherwise null"
        }
      ]
      
      Rules:
      1. Split every distinct action into a separate task.
      2. Extract the exact hour/time mentioned by the user (e.g., if user says at 5, set the time to 17:00 or 5:00 based on context, do NOT default to 8 or 12 unless specified).
      3. Do NOT wrap output in markdown code blocks like \`\`\`json. Return raw JSON array only.
    `;

    const apiKey = process.env.GROQ_API_KEY?.replace(/["\s]/g, '');
    let tasksData = [];

    try {
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
      const localParsedTasks = parseMultipleTasks(text);
      tasksData = localParsedTasks.map(t => ({
        title: t.title,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null
      }));
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