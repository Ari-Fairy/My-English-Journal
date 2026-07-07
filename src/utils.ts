// Sözel seslendirme (Speech Synthesis)
export function speak(text: string, lang = "en-US") {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) {
    console.error("Speech Synthesis Error:", e);
  }
}

// Получение даты YYYY-MM-DD в локальном часовом поясе
export function getLocalDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Отправка веб-уведомлений с поддержкой мобильных устройств через Service Worker
export function sendWebNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) {
    console.warn("Notifications are not supported in this environment");
    return;
  }
  if (Notification.permission !== "granted") {
    console.warn("Notification permission is not granted");
    return;
  }

  const options = {
    body,
    tag: "my-eng-reminder",
    renotify: true,
  };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js")
      .then((reg) => {
        if (reg && reg.showNotification) {
          reg.showNotification(title, options);
        } else {
          navigator.serviceWorker.ready.then((readyReg) => {
            if (readyReg && readyReg.showNotification) {
              readyReg.showNotification(title, options);
            } else {
              try {
                new Notification(title, options);
              } catch (e) {
                console.error("Fallback Notification failed:", e);
              }
            }
          }).catch(() => {
            try {
              new Notification(title, options);
            } catch (e) {
              console.error("Fallback Notification failed after ready catch:", e);
            }
          });
        }
      })
      .catch((err) => {
        console.error("Service worker registration/get failed:", err);
        try {
          new Notification(title, options);
        } catch (e) {
          console.error("Fallback standard Notification failed:", e);
        }
      });
  } else {
    try {
      new Notification(title, options);
    } catch (e) {
      console.error("Standard Notification constructor failed:", e);
    }
  }
}


