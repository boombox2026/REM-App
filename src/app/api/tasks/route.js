import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
      Return the result strictly as a JSON array of objects. NO MARKDOWN FORMATTING, NO EXPLANATIONS. Return raw JSON only starting with [ and ending with ].
      Format:
      [
        {
          "title": "Task name in Arabic without time or date mentions",
          "dueDate": "ISO 8601 format with EGYPT timezone offset +03:00 (e.g. 2026-08-03T17:30:00+03:00)"
        }
      ]
      
      Rules:
      1. CRITICAL: Split EVERY distinct action into a separate task.
      2. FRACTIONS: You MUST handle Arabic time fractions. "ونص" = +30 mins. "وربع" = +15 mins. "وتلت" = +20 mins. "إلا ربع" = -15 mins. Example: "6 ونص" means 06:30 or 18:30.
      3. AUTO-TOMORROW: If the user says a time (like 2 PM) and that time has ALREADY PASSED based on the Current Date and Time, you MUST set the date to TOMORROW.
      4. You MUST append +03:00 to the end of the dueDate string. Never use 'Z'.
      5. Do NOT wrap output in markdown code blocks like \`\`\`json. Return raw JSON array only.
    `;

    const apiKey = process.env.GROQ_API_KEY?.replace(/["\s]/g, '');
    
    const response = await fetch("[https://api.groq.com/openai/v1/chat/completions](https://api.groq.com/openai/v1/chat/completions)", {
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
      const errText = await response.text();
      console.error("Groq API error response:", errText);
      throw new Error(`Groq API Error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.choices[0].message.content;
    
    // تنظيف أقوى لأي نص زايغ من الذكاء الاصطناعي
    let jsonString = responseText.trim();
    if (jsonString.startsWith("```json")) {
      jsonString = jsonString.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (jsonString.startsWith("```")) {
      jsonString = jsonString.replace(/^```/, "").replace(/```$/, "").trim();
    }

    const tasksData = JSON.parse(jsonString);

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
    // هنطبع الخطأ الحقيقي في الرف (Terminal) عشان نشوفه واضح
    console.error("CRITICAL ERROR IN POST /api/tasks:", error);
    return NextResponse.json({ success: false, error: error.message || "حدث خطأ غير متوقع" }, { status: 500 });
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
    return NextResponse.json({ success: false, error: error.message }, { status: 500});
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