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
