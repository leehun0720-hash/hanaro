"use client";
import type { ReactNode } from "react";

/** 제출 전 confirm()을 띄우는 서버 액션 폼 (삭제 버튼용) */
export function ConfirmForm({ action, message, children, className }: { action: (formData: FormData) => void | Promise<void>; message: string; children: ReactNode; className?: string }) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
