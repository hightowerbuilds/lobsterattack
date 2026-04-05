import { useEffect, useRef } from "react";

/**
 * ASCII characters ordered from sparse to dense — used to map
 * brightness values to visual weight.
 */
const FILL_CHARS = "LobsterAttack";

/** Configuration for the animation. */
const CONFIG = {
  /** Font used to render the source text onto the offscreen canvas. */
  sourceFont: "140px Yellowtail, cursive",
  /** Font used to draw individual ASCII chars on the visible canvas. */
  cellFont: "11px monospace",
  /** Size of each ASCII cell in pixels. */
  cellSize: 9,
  /** Text to render — single line, baseball script style. */
  text: "Lobster Attack",
  /** How many frames the reveal animation takes. */
  revealFrames: 90,
  /** Color of the ASCII characters. */
  charColor: "#00ffc8",
  /** Background color of the canvas. */
  bgColor: "#0a0a1a",
};

type Particle = {
  col: number;
  row: number;
  char: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  delay: number;
  opacity: number;
};

/**
 * Wait for the Yellowtail font to be fully loaded before drawing.
 */
async function waitForFont(): Promise<void> {
  try {
    // Explicitly load the Yellowtail font face at multiple sizes to ensure it's fetched.
    await document.fonts.load('140px Yellowtail', CONFIG.text);
    await document.fonts.ready;

    // Verify it actually loaded — if not, wait a bit and retry.
    if (!document.fonts.check('140px Yellowtail', CONFIG.text)) {
      await new Promise((r) => setTimeout(r, 800));
      await document.fonts.load('140px Yellowtail', CONFIG.text);
      await document.fonts.ready;
    }
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/**
 * Sample the offscreen canvas to build an ASCII brightness grid.
 */
function buildParticles(
  canvasWidth: number,
  canvasHeight: number,
  cellSize: number
): Particle[] {
  const offscreen = document.createElement("canvas");
  const cols = Math.floor(canvasWidth / cellSize);
  const rows = Math.floor(canvasHeight / cellSize);
  offscreen.width = canvasWidth;
  offscreen.height = canvasHeight;

  const ctx = offscreen.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, offscreen.width, offscreen.height);

  // Draw the source text centered — single line, baseball script.
  ctx.fillStyle = "#fff";
  ctx.font = CONFIG.sourceFont;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Measure to auto-scale if the text is wider than the canvas.
  const measured = ctx.measureText(CONFIG.text);
  const maxWidth = canvasWidth * 0.9;

  if (measured.width > maxWidth) {
    // Scale font down proportionally.
    const scale = maxWidth / measured.width;
    const fontSize = Math.floor(140 * scale);
    ctx.font = `${fontSize}px Yellowtail, cursive`;
  }

  ctx.fillText(CONFIG.text, canvasWidth / 2, canvasHeight / 2);

  // Sample pixels and build particles.
  const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  const pixels = imageData.data;
  const particles: Particle[] = [];
  let charIndex = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sx = Math.floor(col * cellSize + cellSize / 2);
      const sy = Math.floor(row * cellSize + cellSize / 2);
      const idx = (sy * canvasWidth + sx) * 4;
      const brightness = pixels[idx];

      if (brightness > 20) {
        const char = FILL_CHARS[charIndex % FILL_CHARS.length];
        charIndex++;

        const tx = col * cellSize + cellSize / 2;
        const ty = row * cellSize + cellSize / 2;

        // Start from a random scattered position.
        const angle = Math.random() * Math.PI * 2;
        const dist = 200 + Math.random() * 300;

        particles.push({
          col,
          row,
          char,
          x: tx + Math.cos(angle) * dist,
          y: ty + Math.sin(angle) * dist,
          tx,
          ty,
          delay: Math.random() * 40,
          opacity: 0,
        });
      }
    }
  }

  return particles;
}

export default function AsciiHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const ctx = canvas.getContext("2d")!;

    const resizeCanvas = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);
      return { width: rect.width, height: rect.height };
    };

    const start = async () => {
      // Wait for Yellowtail to load before sampling pixels.
      await waitForFont();
      if (cancelled) return;

      let { width, height } = resizeCanvas();
      let particles = buildParticles(width, height, CONFIG.cellSize);
      let frame = 0;

      const draw = () => {
        ctx.fillStyle = CONFIG.bgColor;
        ctx.fillRect(0, 0, width, height);
        ctx.font = CONFIG.cellFont;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (const p of particles) {
          const t = Math.max(0, Math.min(1, (frame - p.delay) / (CONFIG.revealFrames - p.delay)));
          const ease = 1 - Math.pow(1 - t, 3);

          p.x = p.x + (p.tx - p.x) * ease;
          p.y = p.y + (p.ty - p.y) * ease;
          p.opacity = ease;

          if (p.opacity > 0.01) {
            ctx.globalAlpha = p.opacity;
            ctx.fillStyle = CONFIG.charColor;
            ctx.fillText(p.char, p.x, p.y);
          }
        }

        ctx.globalAlpha = 1;

        // Subtle shimmer after reveal.
        if (frame > CONFIG.revealFrames + 20) {
          for (const p of particles) {
            if (Math.random() < 0.003) {
              const shimmer = FILL_CHARS[Math.floor(Math.random() * FILL_CHARS.length)];
              ctx.globalAlpha = 0.4;
              ctx.fillStyle = CONFIG.charColor;
              ctx.fillText(shimmer, p.tx, p.ty);
              ctx.globalAlpha = 1;
            }
          }
        }

        frame++;
        animRef.current = requestAnimationFrame(draw);
      };

      animRef.current = requestAnimationFrame(draw);

      const handleResize = () => {
        cancelAnimationFrame(animRef.current);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ({ width, height } = resizeCanvas());
        particles = buildParticles(width, height, CONFIG.cellSize);
        frame = 0;
        animRef.current = requestAnimationFrame(draw);
      };

      window.addEventListener("resize", handleResize);

      // Store cleanup for this specific run.
      cleanupRef.current = () => {
        cancelAnimationFrame(animRef.current);
        window.removeEventListener("resize", handleResize);
      };
    };

    const cleanupRef = { current: () => {} };

    void start();

    return () => {
      cancelled = true;
      cleanupRef.current();
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div className="ascii-hero-wrapper">
      <canvas ref={canvasRef} className="ascii-hero-canvas" />
    </div>
  );
}
