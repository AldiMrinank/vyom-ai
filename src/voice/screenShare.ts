/**
 * screenShare.ts
 * Screen capture with frame extraction for AI vision.
 */

export interface ScreenShareSession {
  stream: MediaStream;
  video: HTMLVideoElement;
  stop: () => void;
}

export async function startScreenShare(): Promise<ScreenShareSession> {
  const stream = await (navigator.mediaDevices as any).getDisplayMedia({
    video: { cursor: "always", displaySurface: "monitor" },
    audio: false,
  });

  const video = document.createElement("video");
  video.srcObject = stream;
  video.autoplay  = true;
  video.playsInline = true;
  await new Promise<void>(res => { video.onloadedmetadata = () => res(); });
  await video.play();

  return {
    stream,
    video,
    stop: () => {
      stream.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    },
  };
}

export function captureScreenFrame(video: HTMLVideoElement, quality = 0.85): string {
  const canvas = document.createElement("canvas");
  canvas.width  = Math.min(video.videoWidth,  1920);
  canvas.height = Math.min(video.videoHeight, 1080);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function isScreenShareSupported(): boolean {
  return !!(navigator.mediaDevices as any).getDisplayMedia;
}
