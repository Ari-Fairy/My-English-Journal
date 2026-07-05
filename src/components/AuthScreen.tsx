import React, { useState } from "react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider 
} from "firebase/auth";
import { auth } from "../firebase";

interface AuthScreenProps {
  onGuestMode: () => void;
  onSuccess: (userId: string) => void;
}

export default function AuthScreen({ onGuestMode, onSuccess }: AuthScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setErrorMsg("");

    try {
      if (isRegistering) {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        onSuccess(credential.user.uid);
      } else {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        onSuccess(credential.user.uid);
      }
    } catch (err: any) {
      console.error(err);
      let message = "Произошла ошибка при входе.";
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        message = "Неверный логин или пароль.";
      } else if (err.code === "auth/email-already-in-use") {
        message = "Этот Email уже зарегистрирован.";
      } else if (err.code === "auth/weak-password") {
        message = "Пароль должен быть не менее 6 символов.";
      } else if (err.code === "auth/invalid-email") {
        message = "Некорректный формат Email.";
      }
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    setErrorMsg("");
    const provider = new GoogleAuthProvider();
    try {
      const credential = await signInWithPopup(auth, provider);
      onSuccess(credential.user.uid);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Вход через Google временно недоступен или заблокирован в браузере.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container fade-in">
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h1 style={{ fontFamily: "Lora, serif", fontStyle: "italic", fontSize: 34, color: "var(--warm)" }}>
          My English Journal
        </h1>
        <p className="sub-text" style={{ color: "var(--sage)", marginTop: 6, fontSize: 12 }}>
          Синхронизация прогресса и чтение книг
        </p>
      </div>

      <div className="card">
        <h3 className="section-title" style={{ textAlign: "center", marginBottom: 16 }}>
          {isRegistering ? "Регистрация" : "Вход в аккаунт"}
        </h3>

        {errorMsg && (
          <div style={{ color: "var(--rose)", background: "rgba(212,165,165,0.12)", border: "1.5px solid rgba(212,165,165,0.3)", borderRadius: "1rem", padding: "10px 14px", fontSize: 13, marginBottom: 14, textAlign: "center" }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleEmailAuth} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label className="sub-text" style={{ fontSize: 10, display: "block", marginBottom: 4, fontWeight: 600 }}>Email адрес</label>
            <input 
              type="email" 
              className="input" 
              placeholder="name@example.com" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="sub-text" style={{ fontSize: 10, display: "block", marginBottom: 4, fontWeight: 600 }}>Пароль</label>
            <input 
              type="password" 
              className="input" 
              placeholder="••••••" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: "100%", padding: 14, marginTop: 8 }}
            disabled={loading}
          >
            {loading ? "⏳ Пожалуйста, подождите..." : isRegistering ? "Зарегистрироваться" : "Войти"}
          </button>
        </form>

        <div style={{ margin: "16px 0", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ fontSize: 11, color: "#ccc", textTransform: "uppercase" }}>или</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        <button 
          className="btn btn-outline" 
          style={{ width: "100%", padding: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 14 }}
          onClick={handleGoogleAuth}
          disabled={loading}
        >
          <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24">
            <path fill="#EA4335" d="M12 5.04c1.63 0 3.1.56 4.25 1.66l3.18-3.18C17.51 1.7 14.98 1 12 1 7.35 1 3.37 3.67 1.39 7.56l3.86 2.45c.91-2.73 3.49-4.97 6.75-4.97z"/>
            <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.27H12v4.51h6.44c-.28 1.47-1.08 2.72-2.33 3.56l3.63 2.81c2.13-1.96 3.75-4.84 3.75-8.61z"/>
            <path fill="#FBBC05" d="M5.25 14.51c-.24-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27L1.39 7.52C.5 9.27 0 11.23 0 12.27s.5 3 1.39 4.75l3.86-2.51z"/>
            <path fill="#34A853" d="M12 22.96c3.24 0 5.96-1.08 7.94-2.91l-3.63-2.81c-1.01.68-2.3 1.08-4.31 1.08-3.26 0-5.84-2.24-6.75-4.97H1.39v2.51c1.98 3.89 5.96 6.56 10.61 6.56z"/>
          </svg>
          Войти через Google
        </button>

        <button 
          className="btn btn-ghost" 
          style={{ width: "100%", marginTop: 14, fontSize: 13, color: "var(--sage)" }}
          onClick={() => setIsRegistering(!isRegistering)}
        >
          {isRegistering ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться"}
        </button>
      </div>

      <button 
        className="btn btn-ghost" 
        style={{ width: "100%", marginTop: 16, fontSize: 13, color: "var(--muted)" }}
        onClick={onGuestMode}
      >
        Войти как Гость (прогресс сохранится только в этом браузере)
      </button>
    </div>
  );
}
