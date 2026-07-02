/**
 * cameraManager.ts
 * Camera stream management with live vision support.
 * Keeps camera open and captures frames on-demand.
 */

export interface CapturedImage {
  dataUrl: string;
  mimeType: string;
}

export interface LiveCameraSession {
  stream: MediaStream;
  video: HTMLVideoElement;
  captureFrame: (quality?: number) => string;
  switchFacing: () => Promise<void>;
  stop: () => void;
  facing: "user" | "environment";
}

export async function openCameraSession(
  initialFacing: "user" | "environment" = "environment"
): Promise<LiveCameraSession> {
  let facing = initialFacing;

  const getStream = async (f: "user" | "environment") =>
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: f, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });

  let stream = await getStream(facing);
  const video = document.createElement("video");
  video.srcObject = stream;
  video.autoplay = true;
  video.playsInline = true;
  await new Promise<void>(res => { video.onloadedmetadata = () => res(); });
  await video.play();

  const capture = (quality = 0.82): string => {
    const canvas = document.createElement("canvas");
    const MAX = 1024;
    const scale = Math.min(1, MAX / Math.max(video.videoWidth, 1));
    canvas.width  = Math.round(video.videoWidth  * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  };

  const switchFacing = async () => {
    stream.getTracks().forEach(t => t.stop());
    facing = facing === "environment" ? "user" : "environment";
    stream = await getStream(facing);
    video.srcObject = stream;
    await video.play();
    session.facing = facing;
  };

  const session: LiveCameraSession = {
    stream, video,
    captureFrame: capture,
    switchFacing,
    stop: () => { stream.getTracks().forEach(t => t.stop()); video.srcObject = null; },
    facing,
  };
  return session;
}

/** One-shot: open camera, capture one frame, return dataUrl, close stream. */
export async function captureOneShot(facing: "user" | "environment" = "environment", quality = 0.82): Promise<string> {
  const session = await openCameraSession(facing);
  await new Promise(r => setTimeout(r, 300)); // brief settle
  const dataUrl = session.captureFrame(quality);
  session.stop();
  return dataUrl;
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach(t => t.stop());
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function compressImage(dataUrl: string, maxWidth = 1024, quality = 0.82): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });
}

// Legacy compat
export const openCamera = (facing: "user" | "environment" = "environment") =>
  navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });

export const captureFrame = (video: HTMLVideoElement, quality = 0.82): CapturedImage => {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  return { dataUrl: canvas.toDataURL("image/jpeg", quality), mimeType: "image/jpeg" };
};
