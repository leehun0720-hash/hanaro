import { describe, it, expect } from "vitest";
import { PROMO_CUTS, promoUserPrompt, promoPosterPrompt } from "@/lib/prompts/promo";
import { buildCompositionPlan, MV_GENRES, MV_SCENES, MV_SCENE_SECONDS, mvUserPrompt, type MvOutput } from "@/lib/prompts/mv";
import { planDurationMs } from "@/lib/providers/elevenlabs";
import type { Project } from "@/lib/types";

const project: Project = {
  id: "p1", user_id: "u1", name: "추석", what: "안성배 추석 선물세트 예약", when_text: "9월 20일까지",
  where_text: "하나로마트 본점", audience: "60대 조합원", cta: "031-000-0000 전화 예약", photos: [], created_at: "",
};

describe("promo", () => {
  it("3컷 초 합계는 30초", () => {
    expect(PROMO_CUTS.reduce((a, c) => a + c.seconds, 0)).toBe(30);
  });
  it("프롬프트에 비율·CTA가 들어간다", () => {
    const p = promoUserPrompt({ ratio: "9:16", sound: { ambient: true, narration: true }, quality: "standard", model: "kling" }, project, "안성농협");
    expect(p).toContain("9:16");
    expect(p).toContain("031-000-0000 전화 예약");
  });
  it("포스터 프롬프트", () => {
    const p = promoPosterPrompt({ headline: "추석 선물세트", lines: ["a", "b"], footer: "☎", scene: "pear" }, "16:9", null);
    expect(p).toContain("16:9");
    expect(p).not.toContain("모서리");
  });
});

describe("music video", () => {
  const out: MvOutput = {
    title: "안성배 노래",
    lyrics: { verse1: ["a", "b"], chorus: ["c", "d"], verse2: ["e"], chorus2: ["c", "d"] },
    scenes: Array.from({ length: 4 }, (_, i) => ({ captionKo: `line ${i}`, videoPrompt: "golden field" })),
    musicStyles: ["warm brass stabs"],
  };
  it("장면 4개 × 15초 = 60초", () => {
    expect(MV_SCENES * MV_SCENE_SECONDS).toBe(60);
  });
  it("composition_plan 총 길이 60000ms, 장르 스타일 반영", () => {
    const plan = buildCompositionPlan(out, "trot", { vocal: "duet", tempo: "fast", mood: "bright", instruments: "accordion, brass" });
    expect(planDurationMs(plan)).toBe(60000);
    expect(plan.sections).toHaveLength(4);
    expect(plan.positive_global_styles).toContain("Korean trot (ppongjjak)");
    expect(plan.positive_global_styles).toContain("male and female duet");
    expect(plan.positive_global_styles).toContain("130 bpm");
    expect(plan.positive_global_styles).toContain("warm brass stabs");
    expect(plan.sections[1].lines).toEqual(["c", "d"]);
    const inst = buildCompositionPlan(out, "folk", { vocal: "instrumental", tempo: "slow", mood: "warm" });
    expect(inst.sections.every((s) => s.lines.length === 0)).toBe(true);
  });
  it("장르 5종", () => {
    expect(Object.keys(MV_GENRES)).toEqual(["trot", "folk", "kids", "dance", "ballad"]);
  });
  it("가사 프롬프트에 조합·특산물이 들어간다", () => {
    const p = mvUserPrompt({ genre: "folk", orgName: "안성농협", specialty: "안성배", region: "경기 안성" }, project);
    expect(p).toContain("우리 조합: 안성농협 (경기 안성)");
    expect(p).toContain("지역 특산물: 안성배");
    expect(p).toContain("포크·통기타");
  });
});
