import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// دالة التحليل المحلي 
function parseMultipleTasks(text) {
  // ضفنا (واطلع، وهطلع، اطلع، هطلع)
  const separators = /(?=\s+(?:هو|واكلم|وكلم|وهكلم|واروح|وهروح|واعمل|وهعمل|وانزل|وهنزل|وبعدين|وبعدها|وكمان|كمان|ثم|و|والله|وارجع|وهارجع|ارجع|وعايز|عايز|واطلع|وهطلع|اطلع|هطلع)\s+)/g;
  const chunks = text.split(separators).filter(chunk => chunk.trim() !== "");

  let tasks = [];
  let lastDateOffset = 0;

  for (let chunk of chunks) {
    let cleanTitle = chunk.replace(/^\s*(هو|وبعدين|وبعدها|وكمان|كمان|ثم|والله|و|وارجع|وهارجع|ارجع|وعايز|عايز|واطلع|وهطلع|اطلع|هطلع)\s*/g, "").trim();
    cleanTitle = cleanTitle.replace(/^و(?=[أاإتثجحخدذرزسشصضطظعغفقكلمنهوي])/g, "").trim();
    if (!cleanTitle) continue;

    let dueDate = new Date();
    let hours = 12;
    let mins = 0;

    if (cleanTitle.includes("بكره") || cleanTitle.includes("غدا") || cleanTitle.includes("بكرة")) lastDateOffset = 1;
    else if (cleanTitle.includes("بعد بكره") || cleanTitle.includes("بعد بكرة")) lastDateOffset = 2;
    else if (cleanTitle.includes("النهارده") || cleanTitle.includes("اليوم")) lastDateOffset = 0;
    
    dueDate.setDate(dueDate.getDate() + lastDateOffset);

    const timeMatch = cleanTitle.match(/(?:الساع[ةه]\s*)?(\d{1,2})(?::(\d{2}))?\s*(الصبح|صباح[ااً]?|بالليل|مسا[ءااً]?|العصر|المغرب)?/);
    if (timeMatch) {
      hours = parseInt(timeMatch[1]);
      if (timeMatch[2]) mins = parseInt(timeMatch[2]);
      const isPM = cleanTitle.includes("بالليل") || cleanTitle.includes("مسا") || cleanTitle.includes("العصر") || cleanTitle.includes("المغرب");
      const isAM = cleanTitle.includes("الصبح") || cleanTitle.includes("صباح");
      if (isPM && hours < 12) hours += 12; 
      else if (isAM && hours === 12) hours = 0; 
      else if (!isPM && !isAM && hours >= 1 && hours <= 6) hours += 12;
    }
    
    dueDate.setHours(hours, mins, 0, 0);

    cleanTitle = cleanTitle.replace(/(?:الساع[ةه]\s*)?\d{1,2}(?::\d{2})?\s*(الصبح|صباح[ااً]?|بالليل|مسا[ءااً]?|العصر|المغرب)?/g, "").trim();
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

    // أوامر أكثر صرامة للذكاء الاصطناعي عشان يفصل المهام بالعافية
    const prompt = `
      You are a smart personal assistant. Extract tasks from the following user input in Arabic.
      Input: "${text}"
      Current Date and Time in Egypt: ${currentTime}
      
      Requirements:
      Return the result strictly as a JSON array of objects. No markdown formatting, no explanations, no text outside the JSON array.
      Format:
      [
        {
          "title": "Task name in Arabic without the time mention",
          "dueDate": "ISO 8601 format for date and time, or null if no time is mentioned"
        }
      ]
      
      Rules:
      1. CRITICAL: Split EVERY distinct action into a separate task. If the user says "Go to work and then go to the gym", you MUST create TWO separate objects. Never group multiple actions into one task.
      2. Calculate dates and times accurately based on the provided current time.
      3. Do NOT wrap the output in markdown code blocks like \`\`\`json. Just return the raw JSON array.
    `;

    const apiKey = process.env.GROQ_API_KEY?.replace(/["\s]/g, '');
    let tasksData = [];

    try {
      console.log("✅ جاري الاتصال بـ Groq API (Llama 3)...");
      
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

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "Groq API Error");
      }

      const data = await response.json();
      const responseText = data.choices[0].message.content;
      
      const jsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      tasksData = JSON.parse(jsonString);
      console.log("✅ تم تحليل المهام بنجاح وبسرعة صاروخية بواسطة Groq!");

    } catch (apiError) {
      console.error("⚠️ Groq فشل، تم تفعيل المحلل المحلي كبديل طوارئ:", apiError.message);
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
    console.error("System Fatal Error:", error);
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