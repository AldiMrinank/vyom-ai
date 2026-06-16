export const haptic = (ms: number | number[] = 10) => {
  try { if ("vibrate" in navigator) navigator.vibrate(ms); } catch {}
};
