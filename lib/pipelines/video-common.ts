import path from "node:path";
import fs from "node:fs/promises";
import type { JobContext } from "@/lib/jobs";
import { getVideoResult, getVideoStatus, isContentRejection, klingCostUsd, koReasonFor, submitVideo, type KlingAspect, FAL_I2V_AUDIO_ENDPOINT_DEFAULT } from "@/lib/providers/fal";
import { adminClient } from "@/lib/supabase/admin";
import { canStartVideoTasks } from "@/lib/concurrency";
import { downloadTo } from "@/lib/video/ffmpeg";

export type ClipSpec = { key: string; prompt: string; seconds: number };
export type VideoRatio = KlingAspect;

/**
 * 사용자가 명시적으로 고른 프로젝트 사진 1장만 Kling 첫 프레임(image-to-video) 참조로 넘긴다.
 * 고르지 않았으면 빈 배열 → text-to-video. 보관함·이전 작업 산출물은 절대 참조하지 않는다.
 */
export async function referenceUrls(ctx: JobContext, refPhoto: string | null | undefined): Promise<string[]> {
  if (!refPhoto) return [];
  const photos = ctx.project?.photos ?? [];
  if (!photos.includes(refPhoto)) throw new Error("참조 사진이 이 프로젝트의 사진이 아니에요. 다시 선택해 주세요.");
  const { data } = await adminClient().storage.from("uploads").createSignedUrl(refPhoto, 60 * 60 * 6);
  return data?.signedUrl ? [data.signedUrl] : [];
}

/** 현장음을 켤 때 프롬프트에 덧붙여 말소리(영어 더빙)를 막는다 */
const AMBIENT_SUFFIX = " Natural ambient sound and light sound effects only. No narration, no dialogue, no singing, no on-screen text.";

/** 홍보·MV 클립 공통 부정 조건: 화면 속 글자·로고 금지(자막은 따로 입힌다) */
const CLIP_NEGATIVE = "on-screen text, subtitles, captions, letters, signage with text, watermark, logo, distorted face, extra fingers, blur, low quality";

/**
 * 클립 생성 요청을 모두 보내고 fal request_id를 job에 저장 (Kling 3.0 via fal.ai).
 *  - 참조 사진이 있으면 image-to-video(첫 프레임), 없으면 text-to-video(비율 지정)
 *  - 전체 동시 실행 한도가 차 있으면 아무것도 보내지 않고 false → 파이프라인은 같은 단계를 유지해 다음 폴링 때 다시 시도
 */
export async function startClips(ctx: JobContext, clips: ClipSpec[], ratio: VideoRatio, refs: string[], opts: { ambient?: boolean } = {}): Promise<boolean> {
  const gate = await canStartVideoTasks(clips.length);
  if (!gate.ok) {
    await ctx.update({ output: { notice: `영상 생성 순서를 기다리는 중입니다 (진행 중 ${gate.active}/${gate.limit}). 잠시 후 자동으로 시작됩니다.` } });
    return false;
  }
  const ids: Record<string, string> = {};
  const endpoints: Record<string, string> = {};
  let cost = 0;
  try {
    const ambient = Boolean(opts.ambient);
    for (const c of clips) {
      const { requestId, endpoint } = await submitVideo({
        prompt: ambient ? c.prompt + AMBIENT_SUFFIX : c.prompt,
        duration: c.seconds,
        imageUrl: refs[0],
        // 현장음 + 참조 사진이면 오디오가 되는 standard 엔드포인트, 아니면 turbo
        endpoint: refs[0] && ambient ? FAL_I2V_AUDIO_ENDPOINT_DEFAULT : undefined,
        aspectRatio: ratio,
        generateAudio: ambient,
        negativePrompt: CLIP_NEGATIVE,
      });
      ids[c.key] = requestId;
      endpoints[c.key] = endpoint;
      cost += klingCostUsd(endpoint, c.seconds, ambient);
    }
  } catch (e) {
    throw new Error(isContentRejection(e) ? koReasonFor(e) : e instanceof Error ? e.message : String(e));
  }
  const nextCost = Math.round(((Number(ctx.job.cost_usd) || 0) + cost) * 10000) / 10000;
  await adminClient().from("jobs").update({ cost_usd: nextCost }).eq("id", ctx.job.id);
  await ctx.update({ provider_task_ids: ids, output: { clip_assets: {}, clip_endpoints: endpoints, fal_request_ids: Object.values(ids), notice: null } });
  return true;
}

/**
 * 모든 클립 상태 확인. 완료된 클립은 outputs에 저장. 전부 끝나면 true.
 * 필터 거부·실패는 한국어 사유로 예외.
 */
export async function waitClips(ctx: JobContext, keys: string[], tmp: string): Promise<boolean> {
  const saved = { ...((ctx.job.output.clip_assets as Record<string, string> | undefined) ?? {}) };
  const endpoints = (ctx.job.output.clip_endpoints as Record<string, string> | undefined) ?? {};
  let allDone = true;
  let queued = 0;
  for (const key of keys) {
    if (saved[key]) continue;
    const requestId = ctx.job.provider_task_ids[key];
    const endpoint = endpoints[key];
    if (!requestId || !endpoint) throw new Error(`클립 ${key}의 작업 ID가 없습니다.`);
    try {
      const s = await getVideoStatus(endpoint, requestId);
      if (s.status !== "COMPLETED") {
        allDone = false;
        if (s.status === "IN_QUEUE") queued++;
        continue;
      }
      const { videoUrl } = await getVideoResult(endpoint, requestId);
      const file = path.join(tmp, `${key}.mp4`);
      await downloadTo(videoUrl, file); // 결과 URL은 만료되므로 즉시 Storage로 복사
      const data = await fs.readFile(file);
      const asset = await ctx.saveAsset({ kind: "video", ext: "mp4", data, mime: "video/mp4", meta: { filename: `클립_${key}.mp4`, clip: key, intermediate: true } });
      saved[key] = asset.id;
      await ctx.update({ output: { clip_assets: saved } });
    } catch (e) {
      if (isContentRejection(e)) throw new Error(`영상 클립(${key}) 생성 실패: ${koReasonFor(e)}`);
      throw e;
    }
  }
  await ctx.update({ output: { notice: allDone ? null : queued ? `Kling 큐 대기 중 (${queued}개 클립). 보통 1.5~3분 걸립니다.` : "Kling이 클립을 만드는 중입니다 (1.5~3분)." } });
  return allDone;
}

/** 저장된 클립 자산을 임시 폴더로 내려받아 경로를 돌려준다 */
export async function fetchClipFiles(ctx: JobContext, keys: string[], tmp: string): Promise<Record<string, string>> {
  const db = adminClient();
  const saved = (ctx.job.output.clip_assets as Record<string, string> | undefined) ?? {};
  const files: Record<string, string> = {};
  for (const key of keys) {
    const { data: asset } = await db.from("assets").select("storage_path").eq("id", saved[key]).single();
    if (!asset) throw new Error(`클립 ${key} 파일을 찾을 수 없습니다.`);
    const { data } = await db.storage.from("outputs").download(asset.storage_path);
    if (!data) throw new Error(`클립 ${key} 다운로드 실패`);
    const file = path.join(tmp, `${key}.mp4`);
    await fs.writeFile(file, Buffer.from(await data.arrayBuffer()));
    files[key] = file;
  }
  return files;
}

export async function fetchAssetFile(assetId: string, tmp: string, name: string): Promise<string> {
  const db = adminClient();
  const { data: asset } = await db.from("assets").select("storage_path").eq("id", assetId).single();
  if (!asset) throw new Error("파일을 찾을 수 없습니다.");
  const { data } = await db.storage.from("outputs").download(asset.storage_path);
  if (!data) throw new Error("파일 다운로드 실패");
  const file = path.join(tmp, name);
  await fs.writeFile(file, Buffer.from(await data.arrayBuffer()));
  return file;
}
