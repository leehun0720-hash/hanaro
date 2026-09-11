/**
 * 외부 API 호출 재시도 — 20명 동시 실습 시 429(한도 초과)·일시 장애를 흡수한다.
 * 지수 백오프 + 지터, 총 대기 시간은 서버리스 함수 제한(300초) 안에 들어오도록 짧게 유지.
 */
export class ProviderHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ProviderHttpError";
    this.status = status;
  }
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

export function isRetryable(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const status = (e as { status?: unknown }).status;
  if (typeof status === "number") return RETRYABLE_STATUS.has(status);
  const msg = String((e as { message?: unknown }).message ?? "").toLowerCase();
  return /rate limit|too many requests|overloaded|429|503|timeout|econnreset|fetch failed/.test(msg);
}

export type RetryOptions = {
  tries?: number; // 총 시도 횟수 (기본 4)
  baseMs?: number; // 첫 대기 (기본 1500ms)
  maxMs?: number; // 대기 상한 (기본 20초)
  label?: string;
  retryIf?: (e: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
};

/** 대기 시간 계산 (순수 함수, 테스트용) */
export function backoffMs(attempt: number, baseMs = 1500, maxMs = 20000, jitter = Math.random()): number {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(exp * (0.7 + 0.6 * jitter));
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const tries = Math.max(1, opts.tries ?? 4);
  const retryIf = opts.retryIf ?? isRetryable;
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (attempt === tries - 1 || !retryIf(e)) throw e;
      const ms = backoffMs(attempt, opts.baseMs, opts.maxMs);
      console.warn(`[retry${opts.label ? ` ${opts.label}` : ""}] ${attempt + 1}/${tries} 실패, ${ms}ms 후 재시도:`, e instanceof Error ? e.message : e);
      await sleep(ms);
    }
  }
  throw last;
}
