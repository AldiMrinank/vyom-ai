export const fireConfetti = async () => {
  const confetti = (await import("canvas-confetti")).default;
  const end = Date.now() + 2000;
  const colors = ["#06b6d4","#7c3aed","#ec4899","#10b981","#f59e0b"];
  const frame = () => {
    confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 }, colors });
    confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
};
