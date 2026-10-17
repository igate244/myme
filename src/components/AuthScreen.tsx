import React, { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { outerStyle, cardStyle, primaryButtonStyle, sectionTitleStyle, errorTextStyle } from "./uiStyles";

const AuthScreen: React.FC = () => {
  const { login, error } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  const handleLogin = async (): Promise<void> => {
    setSigningIn(true);
    try {
      await login();
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div style={{ ...outerStyle, justifyContent: "center" }}>
      <div style={{ ...cardStyle, maxWidth: 400, textAlign: "center", padding: "40px 24px" }}>
        <h1
          style={{
            ...sectionTitleStyle,
            fontSize: "2rem",
            marginBottom: 16,
            textShadow: "none",
          }}
        >
          MYME
        </h1>
        <p style={{ color: "#8b8a87", marginBottom: 32, lineHeight: 1.6 }}>
          人生を記録して振り返る
          <br />
          自分用のライフログ
        </p>

        <button
          type="button"
          onClick={() => void handleLogin()}
          disabled={signingIn}
          style={{
            ...primaryButtonStyle,
            background: "#fff",
            color: "#18191c",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <span style={{ fontSize: "1.2rem" }}>G</span>
          {signingIn ? "ログイン中..." : "Googleでログイン"}
        </button>

        {error && <p style={{ ...errorTextStyle, marginTop: 16 }}>{error}</p>}
      </div>
    </div>
  );
};

export default AuthScreen;
