/**
 * ============================================================================
 * FILE: useTypewriter.ts
 * ============================================================================
 * 
 * PURPOSE:
 * Custom React hook that creates a terminal-style character-by-character
 * text reveal effect. Used to simulate typewriter or AI response generation
 * for a more engaging reading experience. Configurable speed and active
 * state allow the animation to be paused or adjusted based on context.
 * 
 * KEY COMPONENTS:
 * - useTypewriter: Main hook returning progressively revealed displayText
 * - Character reveal: Uses setInterval to add one character at a time
 * - Auto-reset: Clears and restarts when text or isActive changes
 * - Cleanup: Properly clears interval on unmount or dependency change
 * 
 * DEPENDENCIES:
 * - react: useState for displayText, useEffect for interval management
 * - No external packages required
 * 
 * USAGE PATTERN:
 * ```tsx
 * import { useTypewriter } from '@/hooks/useTypewriter';
 * import { TypewriterText } from '@/components/TypewriterText';
 * 
 * // In a component displaying AI response:
 * const displayText = useTypewriter(
 *   aiResponse,        // Full text to reveal
 *   isGenerating,      // Animation runs while AI is generating
 *   30                // Speed: ms per character (default: 30)
 * );
 * 
 * return <TypewriterText text={displayText} />;
 * ```
 * 
 * ERROR HANDLING:
 * - Timer is cleared on every dependency change (text, isActive, speed)
 * - Empty text case handled (immediate clearInterval)
 * - Interval auto-clears when full text is displayed (i >= text.length)
 * 
 * PERFORMANCE NOTES:
 * - Uses setInterval (not requestAnimationFrame) - suitable for text, not animations
 * - Default speed 30ms = ~33 characters/second (fast terminal style)
 * - Re-renders on each character add (consider memoization for long text)
 * - text.substring(0, i) creates new string each interval tick
 * 
 * RELATED FILES:
 * - TypewriterText.tsx: Display component that uses this hook
 * - ChatMessage.tsx: May use for streaming AI responses
 * - useChatSession.ts: Could integrate for streaming message display
 * 
 * NOTES:
 * - Not optimized for very long text (consider chunking or streaming)
 * - isActive=false immediately displays full text (no animation)
 * - Speed is in milliseconds per character; lower = faster
 * - Common speeds: 20ms (fast), 30ms (normal), 50ms (slow/emphasized)
 * ============================================================================
 */

// useTypewriter.ts
// Hook for terminal-style typing animation
import { useState, useEffect } from 'react';

export function useTypewriter(text: string, isActive: boolean = true, speed: number = 30) {
    const [displayText, setDisplayText] = useState('');

    useEffect(() => {
        if (!isActive) {
            setDisplayText(text);
            return;
        }

        setDisplayText(''); // Reset on new text
        let i = 0;
        
        const timer = setInterval(() => {
            if (i < text.length) {
                i++;
                setDisplayText(text.substring(0, i));
            } else {
                clearInterval(timer);
            }
        }, speed);

        return () => clearInterval(timer);
    }, [text, isActive, speed]);

    return displayText;
}