/**
 * cameraManager.ts
 * Handles camera capture and image compression for voice+vision mode.
 */

export interface CapturedImage {
  dataUrl: string;   // base64 data URL ready for OpenRouter vision
  mimeType: string;
}

export async function openCamera(facing: "user" | "environment" = "environment"): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
}

export function captureFrame(video: HTMLVideoElement, quality = 0.8): CapturedImage {
  const canvas = document.createElement("canvas");
  canvas.width  = video.videoWidth  || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return { dataUrl, mimeType: "image/jpeg" };
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach(t => t.stop());
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function compressImage(dataUrl: string, maxWidth = 1024, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });
}
