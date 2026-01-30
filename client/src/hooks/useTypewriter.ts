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