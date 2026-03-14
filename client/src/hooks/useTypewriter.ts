/**
 * ============================================================================
 * FILE: useTypewriter.ts
 * LOCATION: client/src/hooks/useTypewriter.ts
 * ============================================================================
 *
 * PURPOSE:
 *    Custom React hook that creates a terminal-style character-by-character
 *    text reveal effect. Configurable speed and active state allow the
 *    animation to be paused or adjusted based on context.
 *
 * ROLE IN PROJECT:
 *    Provides the typewriter animation primitive used across the app for
 *    AI response streaming effects. Consumed by display components that
 *    need progressive text reveal rather than instant rendering.
 *
 * KEY COMPONENTS:
 *    - useTypewriter: Returns progressively revealed displayText string
 *
 * DEPENDENCIES:
 *    - External: react
 *    - Internal: (none)
 *
 * USAGE:
 *    ```tsx
 *    const displayText = useTypewriter(aiResponse, isGenerating, 30);
 *    return <TypewriterText text={displayText} />;
 *    ```
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