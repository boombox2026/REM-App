self.addEventListener("push", function (event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: "/favicon.ico", // ده الأيقون اللي هيظهر مع الإشعار
      vibrate: [200, 100, 200], // عشان الموبايل يتهز
      data: {
        dateOfArrival: Date.now(),
        primaryKey: "1",
      },
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});