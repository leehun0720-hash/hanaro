"use client";
import { deleteMember } from "./credits/actions";

/** 삭제 확인 대화상자를 거친 뒤 서버 액션 실행 */
export function DeleteMemberButton({ userId, email, disabled }: { userId: string; email: string; disabled?: boolean }) {
  return (
    <form
      action={deleteMember}
      onSubmit={(e) => {
        if (!confirm(`${email} 회원을 삭제할까요?\n작업·파일·크레딧이 모두 지워지며 되돌릴 수 없습니다.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="user_id" value={userId} />
      <button className="btn-danger px-2 py-1 text-xs" disabled={disabled} title={disabled ? "본인 계정은 삭제할 수 없습니다" : undefined}>삭제</button>
    </form>
  );
}
