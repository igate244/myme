// src/components/Field.tsx
import React from "react";
import { labelStyle } from "./uiStyles";

type Props = {
  label: string;
  name: string;
  children: React.ReactNode;
  style?: React.CSSProperties; // ★追加: styleを受け取れるようにする
};

const Field: React.FC<Props> = ({ label, name, children, style }) => {
  return (
    // ★追加: 受け取ったstyleをdivに適用
    <div style={style}>
      <label htmlFor={name} style={labelStyle}>
        {label}
      </label>
      {children}
    </div>
  );
};

export default Field;