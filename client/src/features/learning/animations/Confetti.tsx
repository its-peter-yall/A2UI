/**
 * ============================================================================
 * FILE: Confetti.tsx
 * ============================================================================
 * 
 * PURPOSE:
 * Canvas-based confetti particle celebration effect that creates a burst of
 * colorful falling rectangles with physics simulation (gravity, rotation,
 * velocity). Used to celebrate learning achievements (topic mastery, course
 * completion). Renders directly to HTML Canvas for GPU-accelerated performance
 * with requestAnimationFrame-based animation loop.
 * 
 * KEY COMPONENTS:
 * - Confetti: Main component rendering canvas overlay with particle physics
 * - Particle system: Each particle has position, velocity, color, size, rotation
 * - Physics simulation: Gravity pulls particles down, rotation adds visual interest
 * - Reduced motion fallback: Static sparkle emoji for accessibility
 * 
 * DEPENDENCIES:
 * - react: useEffect, useRef, useCallback for canvas and animation management
 * - @/features/learning/animations/index: prefersReducedMotion helper
 * 
 * USAGE PATTERN:
 * ```tsx
 * import { Confetti } from './animations/Confetti';
 * 
 * // In celebration component:
 * <Confetti
 *   active={isCelebrating}
 *   duration={3000}
 *   particleCount={100}
 *   onComplete={() => setIsCelebrating(false)}
 * />
 * ```
 * 
 * ERROR HANDLING:
 * - Handles missing canvas context gracefully (early return)
 * - Clears animation frame on unmount to prevent memory leaks
 * - Removes resize listener on cleanup
 * - Reduced motion calls onComplete after 500ms timeout
 * 
 * PERFORMANCE NOTES:
 * - Uses requestAnimationFrame for smooth 60fps animation
 * - Canvas clears each frame for clean redraw
 * - Particles fade out over duration (opacity = 1 - progress)
 * - mixBlendMode: 'screen' creates additive blending for bright effect
 * - Default particle count: 100; course completion: 200
 * - Physics: gravity 0.3, initial velocity -15 to -5 (upward burst)
 * 
 * RELATED FILES:
 * - MasteryCelebration.tsx: Parent component that triggers confetti
 * - index.ts: prefersReducedMotion helper used here
 * 
 * NOTES:
 * - Accessibility: Static sparkle (✨) shown instead when prefers-reduced-motion
 * - Particle colors: green, blue, amber, pink, violet, teal (celebratory palette)
 * - Initial burst from center-top (canvas.width/2, canvas.height/3)
 * - Particles have random rotation speed for varied tumbling effect
 * ============================================================================
 */

// Confetti.tsx
// Canvas-based confetti celebration effect

import { useEffect, useRef, useCallback } from 'react';
import { prefersReducedMotion } from './index';

interface ConfettiProps {
  /** Whether to trigger the confetti burst */
  active: boolean;
  /** Callback when animation completes */
  onComplete?: () => void;
  /** Duration in ms (default 3000) */
  duration?: number;
  /** Number of particles (default 100) */
  particleCount?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  gravity: number;
  opacity: number;
}

const COLORS = [
  '#22c55e', // green-500
  '#3b82f6', // blue-500
  '#f59e0b', // amber-500
  '#ec4899', // pink-500
  '#8b5cf6', // violet-500
  '#14b8a6', // teal-500
];

export function Confetti({
  active,
  onComplete,
  duration = 3000,
  particleCount = 100,
}: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number | undefined>(undefined);

  const createParticles = useCallback(
    (canvas: HTMLCanvasElement): Particle[] => {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 3;

      return Array.from({ length: particleCount }, () => ({
        x: centerX,
        y: centerY,
        vx: (Math.random() - 0.5) * 15,
        vy: Math.random() * -15 - 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: Math.random() * 8 + 4,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        gravity: 0.3,
        opacity: 1,
      }));
    },
    [particleCount]
  );

  useEffect(() => {
    if (!active) return;
    if (prefersReducedMotion()) {
      // For reduced motion, just call complete after a brief delay
      const timeout = setTimeout(() => onComplete?.(), 500);
      return () => clearTimeout(timeout);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const updateSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    const particles = createParticles(canvas);
    startTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - (startTimeRef.current || currentTime);
      const progress = elapsed / duration;

      if (progress >= 1) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        onComplete?.();
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        // Update physics
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.rotation += p.rotationSpeed;
        p.opacity = 1 - progress;

        // Draw particle
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', updateSize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [active, duration, createParticles, onComplete]);

  if (!active) return null;

  // For reduced motion, show static sparkles
  if (prefersReducedMotion()) {
    return (
      <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
        <div className="text-6xl animate-pulse">✨</div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
      style={{ mixBlendMode: 'screen' }}
    />
  );
}
