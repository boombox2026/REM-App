import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: { dueDate: 'asc' }
    });
    return NextResponse.json({ success: true, tasks });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message });
  }
}

function parseMultipleTasks(text) {
  const separators = /(?=\s+(?:هو|واكلم|وكلم|وهكلم|واروح|وهروح|واعمل|وهعمل|وانزل|وهنزل|وبعدين|وبعدها|وكمان|كمان|ثم)\s+)/g;
  const chunks = text.split(separators).filter(chunk => chunk.trim() !== "");

  let tasks = [];
  let lastDateOffset = 0;

  for (let chunk of chunks) {
    let cleanTitle = chunk.replace(/^\s*(هو|وبعدين|وبعدها|وكمان|كمان|ثم)\s*/g, "").trim();
    cleanTitle = cleanTitle.replace(/^و(?=[أاإتثجحخدذرزسشصضطظعغفقكلمنهوي])/g, "").trim();
    
    if (!cleanTitle) continue;

    let dueDate = new Date();
    let hours = 12;
    let mins = 0;

    // تظبيط الأيام
    if (cleanTitle.includes("بكره") || cleanTitle.includes("غدا") || cleanTitle.includes("بكرة")) {
      lastDateOffset = 1;
    } else if (cleanTitle.includes("بعد بكره") || cleanTitle.includes("بعد بكرة")) {
      lastDateOffset = 2;
    } else if (cleanTitle.includes("النهارده") || cleanTitle.includes("اليوم")) {
      lastDateOffset = 0;
    }
    dueDate.setDate(dueDate.getDate() + lastDateOffset);

    // تظبيط الساعات والدقايق
    const timeMatch = cleanTitle.match(/الساع[ةه]\s*(\d+)(?::(\d+))?/);
    if (timeMatch) {
      hours = parseInt(timeMatch[1]);
      if (timeMatch[2]) {
        mins = parseInt(timeMatch[2]);
      }

      const isPMExplicit = cleanTitle.includes("بالليل") || cleanTitle.includes("مسا") || cleanTitle.includes("العصر") || cleanTitle.includes("المغرب");
      const isAMExplicit = cleanTitle.includes("الصبح") || cleanTitle.includes("صباح");

      if (isPMExplicit) {
        if (hours < 12) hours += 12; 
      } else if (isAMExplicit) {
        if (hours === 12) hours = 0; 
      } else {
        if (hours >= 1 && hours <= 6) {
          hours += 12;
        }
      }
    }
    
    dueDate.setHours(hours, mins, 0, 0);

    // السطر السحري الجديد: هيمسح كلمة "الساعة كذا" والكلمات اللي بتدل على الوقت من اسم التاسك نفسه
    cleanTitle = cleanTitle.replace(/\s*الساع[ةه]\s*\d+(?::\d+)?\s*(الصبح|صباح[ااً]?|بالليل|مسا[ءااً]?|العصر|المغرب)?/g, "").trim();

    // مسح كلمات الأيام برضه عشان التاسك يكون نضيف جداً
    cleanTitle = cleanTitle.replace(/\s*(بكره|بكرة|بعد بكره|النهارده|اليوم|غدا)\s*/g, "").trim();

    // لو بعد التنضيف ده كله التاسك بقى فاضي، نتجاهله
    if (!cleanTitle) continue;

    tasks.push({
      title: cleanTitle,
      dueDate: dueDate
    });
  }
  
  return tasks;
}

export async function POST(request) {
  try {
    const { text } = await request.json();
    const tasksData = parseMultipleTasks(text);

    const createdTasks = await Promise.all(
      tasksData.map(task => 
        prisma.task.create({
          data: { text: task.title, dueDate: task.dueDate },
        })
      )
    );

    return NextResponse.json({ success: true, tasks: createdTasks });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { id, isCompleted } = await request.json();
    const updatedTask = await prisma.task.update({
      where: { id },
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
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}