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

        let i = 0;
        const timer = setInterval(() => {
            if (i < text.length) {
                setDisplayText((prev) => prev + text.charAt(i));
                i++;
            } else {
                clearInterval(timer);
            }
        }, speed);

        return () => clearInterval(timer);
    }, [text, isActive, speed]);

    return displayText;
}
