import React, { useState, useEffect } from "react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithCredential, 
  GoogleAuthProvider 
} from "firebase/auth";
import { auth } from "../firebase"; // Путь к твоему файлу firebase.ts

interface AuthScreenProps {
  onSuccess: (uid: string) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Обработка возврата с авторизации Google
  useEffect(() => {
    let hash = window.location.hash;
    
    // Если токен был передан через sessionStorage или URL параметры
    const savedToken = sessionStorage.getItem("oauth_access_token");
    if (savedToken) {
      sessionStorage.removeItem("oauth_access_token");
      hash = `#access_token=${savedToken}`;
    }

    if (hash && hash.includes("access_token")) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get("access_token");
      
      if (accessToken) {
        setLoading(true);
        const credential = GoogleAuthProvider.credential(null, accessToken);
        signInWithCredential(auth, credential)
          .then((result) => {
            onSuccess(result.user.uid);
            window.location.hash = "";
          })
          .catch((err) => {
            console.error("Ошибка авторизации с учетными данными:", err);
            setErrorMsg("Не удалось завершить вход через Google. Попробуйте еще раз.");
          })
          .finally(() => setLoading(false));
      }
    }
  }, [onSuccess]);

  // Стандартная авторизация по Email/Паролю
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      if (isLogin) {
        const res = await signInWithEmailAndPassword(auth, email, password);
        onSuccess(res.user.uid);
      } else {
        const res = await createUserWithEmailAndPassword(auth, email, password);
        onSuccess(res.user.uid);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        setErrorMsg("Неверный email или пароль.");
      } else if (err.code === "auth/email-already-in-use") {
        setErrorMsg("Этот email уже зарегистрирован.");
      } else {
        setErrorMsg("Произошла ошибка. Проверьте данные.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Исправленная функция входа через Google
  const handleGoogleAuth = () => {
    setLoading(true);
    setErrorMsg("");

    // Твой проверенный Web Client ID из Firebase
    const clientId = "482980463406-53ncf12c8ojkbqh6bmksjdf899moa3rv.apps.googleusercontent.com"; 
    
    // Доверенный домен Firebase для обхода ошибки redirect_uri_mismatch
    const redirectUri = "https://centered-kayak-xcf5x.firebaseapp.com"; 
    
    const scope = "openid email profile";
    const responseType = "token";

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=${responseType}&scope=${encodeURIComponent(scope)}&prompt=select_account`;

    // Перенаправляем пользователя на страницу авторизации Google
    window.location.href = authUrl;
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>{isLogin ? "Вход в приложение" : "Регистрация"}</h2>
        
        {errorMsg && <div style={styles.error}>{errorMsg}</div>}

        <form onSubmit={handleEmailAuth} style={styles.form}>
          <input
            type="email"
            placeholder="Электронная почта"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
            disabled={loading}
          />
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={styles.input}
            disabled={loading}
          />
          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? "Загрузка..." : isLogin ? "Войти" : "Зарегистрироваться"}
          </button>
        </form>

        <div style={styles.divider}>или</div>

        <button 
          onClick={handleGoogleAuth} 
          style={{ ...styles.button, ...styles.googleButton }} 
          disabled={loading}
        >
          <svg style={styles.googleIcon} viewBox="0 0 24 24">
            <path
              fill="#EA4335"
              d="M5.266 9.765A7.077 7.077 0 0112 4.909c1.69 0 3.218.6 4.418 1.582L19.9 3C17.782 1.145 15.055 0 12 0 7.33 0 3.357 2.72 1.5 6.664l3.766 3.101z"
            />
            <path
              fill="#4285F4"
              d="M23.49 12.275c0-.796-.073-1.564-.205-2.305H12v4.545h6.459a5.537 5.537 0 01-2.395 3.636l3.722 2.887c2.182-2.014 3.436-4.977 3.436-8.763z"
            />
            <path
              fill="#FBBC05"
              d="M5.266 14.235L1.5 17.336A11.954 11.954 0 010 12c0-1.923.455-3.736 1.5-5.336l3.766 3.101A7.07 7.07 0 004.91 12c0 8.04.136.79.356 2.235z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.955-1.077 7.936-2.918l-3.722-2.887c-1.032.69-2.35.1-4.214.1-4.418 0-6.146-4.855-6.734-7.146L1.5 14.235C3.357 21.28 7.33 24 12 24z"
            />
          </svg>
          Войти через Google
        </button>

        <div style={styles.toggleText}>
          {isLogin ? "Впервые у нас? " : "Уже есть аккаунт? "}
          <span onClick={() => setIsLogin(!isLogin)} style={styles.toggleLink}>
            {isLogin ? "Создать аккаунт" : "Войти"}
          </span>
        </div>
      </div>
    </div>
  );
};

// Простые встроенные стили
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: "#f5f5f7",
    fontFamily: "sans-serif"
  },
  card: {
    background: "#fff",
    padding: "30px",
    borderRadius: "12px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    width: "100%",
    maxWidth: "400px",
    boxSizing: "border-box",
    textAlign: "center"
  },
  title: {
    margin: "0 0 20px 0",
    color: "#333"
  },
  error: {
    color: "#fff",
    background: "#ea4335",
    padding: "10px",
    borderRadius: "6px",
    marginBottom: "15px",
    fontSize: "14px"
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  },
  input: {
    padding: "12px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    fontSize: "16px"
  },
  button: {
    padding: "12px",
    borderRadius: "6px",
    border: "none",
    backgroundColor: "#0071e3",
    color: "#fff",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "10px"
  },
  divider: {
    margin: "20px 0",
    color: "#888",
    fontSize: "14px"
  },
  googleButton: {
    backgroundColor: "#fff",
    color: "#5f6368",
    border: "1px solid #dadce0"
  },
  googleIcon: {
    width: "18px",
    height: "18px"
  },
  toggleText: {
    marginTop: "20px",
    fontSize: "14px",
    color: "#666"
  },
  toggleLink: {
    color: "#0071e3",
    cursor: "pointer",
    fontWeight: "bold"
  }
};
