/**
 * ============================================================================
 * FILE: SettingsButton.tsx
 * LOCATION: client/src/components/SettingsButton.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Premium header navigation button rendering a gear icon that navigates to 
 *    the settings page with an interactive click rotation animation.
 *
 * ROLE IN PROJECT:
 *    Replaces the previous theme toggle in headers across the app. Enhances UX
 *    with responsive micro-animations on hover and tap/click.
 *
 * KEY COMPONENTS:
 *    - SettingsButton: Button wrapping a motion-animated Lucide Settings gear
 *
 * DEPENDENCIES:
 *    - External: react, react-router-dom, lucide-react, framer-motion
 *    - Internal: @/lib/utils
 *
 * USAGE:
 *    <SettingsButton />
 * ============================================================================
 */

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SettingsButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isRotating, setIsRotating] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isRotating) return;
    setIsRotating(true);
    
    // Complete the rotation animation before navigating
    setTimeout(() => {
      navigate('/settings', { state: { from: location.pathname + location.search + location.hash } });
    }, 400); // 400ms matching transition duration
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'inline-flex items-center justify-center rounded-md p-2 text-sm font-medium transition-colors',
        'hover:bg-accent/50 text-muted-foreground hover:text-[#ffb74d] dark:hover:text-[#ffb74d] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer'
      )}
      title="System preferences & settings"
    >
      <motion.div
        animate={isRotating ? { rotate: 360 } : { rotate: 0 }}
        whileHover={!isRotating ? { rotate: 45 } : undefined}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
        className="flex items-center justify-center"
      >
        <Settings className="h-5 w-5" />
      </motion.div>
      <span className="sr-only">Settings</span>
    </button>
  );
}
