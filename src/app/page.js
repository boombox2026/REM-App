"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// دالة مساعدة لتحويل المفتاح لنسخة يفهمها المتصفح (خليناها بره الدالة الرئيسية)
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function Home() {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [tasks, setTasks] = useState([]);
  
  // حالة شاشة الترحيب
  const [showIntro, setShowIntro] = useState(true);
  
  // الحالة الجديدة اللي هتحل مشكلة الـ Hydration
  const [isMounted, setIsMounted] = useState(false);

  // أول ما المتصفح يحمل، هنخليها true
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // مؤقت شاشة الترحيب
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowIntro(false);
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  // جلب المهام
  useEffect(() => {
    fetch("/api/tasks")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.tasks)) {
          setTasks(data.tasks);
        }
      });
  }, []);

  // لو الصفحة لسه محملتش بالكامل على المتصفح، هنعرض خلفية سودة بس عشان نمنع الإيرور
  if (!isMounted) {
    return <div className="min-h-screen bg-[#050505]"></div>;
  }

  // باقي الدوال زي ما هي (toggleTask, deleteTask, startListening)
  // ...

  const toggleTask = async (id, currentStatus) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, isCompleted: !currentStatus } : t));
    await fetch("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isCompleted: !currentStatus })
    });
  };

  const deleteTask = async (id) => {
    setTasks(tasks.filter(t => t.id !== id));
    await fetch("/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
  };

  // دالة تفعيل الإشعارات اللي ضفناها
  async function subscribeToNotifications() {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      try {
        const register = await navigator.serviceWorker.register("/sw.js");
        const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        const convertedVapidKey = urlBase64ToUint8Array(publicVapidKey);

        const subscription = await register.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        });

        await fetch("/api/subscribe", {
          method: "POST",
          body: JSON.stringify(subscription),
          headers: {
            "Content-Type": "application/json",
          },
        });

        alert("تم تفعيل الإشعارات بنجاح يا هندسة! 🚀");
      } catch (error) {
        console.error("مشكلة في التفعيل:", error);
        alert("حصلت مشكلة في تفعيل الإشعارات.");
      }
    } else {
      alert("المتصفح بتاعك مش بيدعم الإشعارات للأسف.");
    }
  }

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setTranscript("متصفحك لا يدعم التعرف على الصوت.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ar-EG";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript("جاري الاستماع... اتكلم دلوقتي");
    };

    recognition.onresult = async (event) => {
      const currentResult = event.results[event.resultIndex];
      const text = currentResult[0].transcript;
      setTranscript(text);

      if (currentResult.isFinal) {
        setTranscript("جاري معالجة المهام...");
        setIsListening(false);
        recognition.stop();

        try {
          const res = await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
          });
          
          const data = await res.json();
          if (data.success && Array.isArray(data.tasks)) {
            setTranscript(`تم حفظ ${data.tasks.length} مهام بنجاح.`);
            setTasks((prevTasks) => {
              const validNewTasks = data.tasks.filter(t => t && t.text);
              const combined = [...prevTasks, ...validNewTasks];
              return combined.sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate));
            });
          } else {
            setTranscript(`مشكلة في الحفظ: ${data.error}`);
          }
        } catch(err) {
          setTranscript("خطأ في الاتصال.");
        }
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      setTranscript("حصل خطأ في المايك.");
    };

    recognition.start();
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap');
        .font-ibm { font-family: 'IBM Plex Sans Arabic', sans-serif; }
      `}} />

      <AnimatePresence mode="wait">
        {showIntro ? (
          <motion.div
            key="intro-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050505] font-ibm"
          >
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
              className="text-4xl md:text-5xl font-bold text-white mb-4"
            >
              صباح الفل يا حج
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.8, ease: "easeOut" }}
              className="text-xl md:text-2xl text-indigo-400 font-medium"
            >
              يومك عامر بالخير بإذن الله
            </motion.p>
          </motion.div>
        ) : (
          <motion.div 
            key="main-app"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="min-h-screen bg-[#050505] text-slate-200 flex flex-col items-center pt-20 font-ibm pb-24 selection:bg-indigo-500/30 overflow-x-hidden relative"
          >
            <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[600px] h-[500px] bg-indigo-600/10 blur-[150px] rounded-full pointer-events-none"></div>

            <div className="text-center mb-14 relative z-10">
              <h1 className="text-5xl font-bold mb-2 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-white to-violet-300 drop-shadow-sm leading-relaxed py-2">
                مساعدك الشخصي
              </h1>
              <p className="text-slate-400 text-lg font-light">اضغط، اتكلم، وسيب الباقي عليا.</p>
            </div>
            
            <div className="relative mb-12 z-10">
              {isListening && (
                <div className="absolute inset-0 bg-indigo-500 rounded-full blur-2xl opacity-40 animate-pulse"></div>
              )}
              <button 
                onClick={isListening ? null : startListening}
                className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 ${
                  isListening 
                    ? 'bg-rose-500 scale-110 shadow-[0_0_40px_rgba(244,63,94,0.4)]' 
                    : 'bg-gradient-to-tr from-indigo-600 to-violet-500 hover:scale-105 shadow-[0_0_30px_rgba(99,102,241,0.25)] hover:shadow-[0_0_50px_rgba(99,102,241,0.4)] cursor-pointer border border-white/10'
                }`}
              >
                <svg width="40" height="40" viewBox="0 0 24 24" fill={isListening ? "white" : "white"} xmlns="http://www.w3.org/2000/svg" className="transition-all duration-300">
                  <path d="M12 14C13.6569 14 15 12.6569 15 11V5C15 3.34315 13.6569 2 12 2C10.3431 2 9 3.34315 9 5V11C9 12.6569 10.3431 14 12 14Z" fill="currentColor"/>
                  <path d="M19 10V11C19 14.866 15.866 18 12 18C8.13401 18 5 14.866 5 11V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M12 18V22M8 22H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="w-full max-w-lg min-h-[64px] bg-white/[0.02] backdrop-blur-xl border border-white/[0.05] rounded-2xl flex items-center justify-center p-5 text-center mb-14 shadow-2xl z-10 transition-all">
              <span className="text-slate-300 text-lg font-medium leading-relaxed">{transcript || "في انتظارك..."}</span>
            </div>

            <div className="w-full max-w-lg px-4 z-10">
              <div className="flex items-center justify-between mb-8 border-b border-white/[0.06] pb-5">
                <div className="flex items-center gap-4">
                  <h2 className="text-2xl font-semibold text-white">المهام القادمة</h2>
                  <button 
                    onClick={subscribeToNotifications}
                    className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-full hover:bg-indigo-500/40 transition-all font-medium flex items-center gap-1"
                  >
                    تفعيل الإشعارات 🔔
                  </button>
                </div>
                <span className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 py-1.5 px-4 rounded-full text-sm font-medium">
                  {tasks.length} مهام
                </span>
              </div>
              
              {tasks.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} 
                  className="text-center p-12 border border-dashed border-white/[0.08] rounded-3xl bg-white/[0.01]"
                >
                  <p className="text-slate-500 font-medium">يومك هادي.. اضغط على المايك وابدأ الإنجاز.</p>
                </motion.div>
              ) : (
                <div className="flex flex-col gap-5">
                  <AnimatePresence>
                    {tasks.map((task) => {
                      if (!task) return null;
                      const isDone = task.isCompleted;

                      return (
                        <motion.div 
                          layout 
                          initial={{ opacity: 0, y: 30, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, x: -100, scale: 0.9, transition: { duration: 0.2 } }}
                          transition={{ duration: 0.4, type: "spring", bounce: 0.25 }}
                          key={task.id} 
                          className={`group relative overflow-hidden flex items-center justify-between p-5 rounded-2xl transition-all duration-300 ${
                            isDone 
                              ? 'bg-white/[0.02] border border-white/[0.03] opacity-50 grayscale' 
                              : 'bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.15] shadow-xl hover:shadow-2xl'
                          }`}
                        >
                          <div className="flex items-center gap-5 z-10 w-full">
                            <button 
                              onClick={() => toggleTask(task.id, isDone)}
                              className={`min-w-[28px] h-7 rounded-full border-2 flex items-center justify-center transition-all duration-300 outline-none ${
                                isDone ? 'bg-indigo-500 border-indigo-500' : 'border-slate-500 hover:border-indigo-400'
                              }`}
                            >
                              {isDone && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              )}
                            </button>
                            
                            <div className="flex flex-col truncate w-full">
                              <span className={`text-lg font-medium truncate transition-all duration-300 ${isDone ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                                {task.text || "مهمة غير مسماة"}
                              </span>
                              <div className="flex items-center gap-2 mt-1.5 opacity-80">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isDone ? "#64748b" : "#818cf8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10"></circle>
                                  <polyline points="12 6 12 12 16 14"></polyline>
                                </svg>
                                <span className={`text-sm tracking-wide ${isDone ? 'text-slate-500' : 'text-indigo-300'}`}>
                                  {task.dueDate ? new Date(task.dueDate).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : "غير محدد"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <button 
                            onClick={() => deleteTask(task.id)}
                            className="absolute left-4 z-10 p-2.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all duration-300 opacity-0 group-hover:opacity-100"
                            title="حذف المهمة"
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18"></path>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}