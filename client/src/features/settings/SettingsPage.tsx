/**
 * ============================================================================
 * FILE: SettingsPage.tsx
 * LOCATION: client/src/features/settings/SettingsPage.tsx
 * ============================================================================
 *
 * PURPOSE:
 *    Separate, dedicated page for configuring AI Provider settings and selecting 
 *    the app's appearance theme.
 *
 * ROLE IN PROJECT:
 *    Enables modular management of API keys and appearance preferences outside of
 *    the main dashboards, offering visual theme selection cards and deep 
 *    integration with the local ThemeProvider.
 *
 * KEY COMPONENTS:
 *    - SettingsPage: Main visual preferences container
 *    - Visual Theme Selection Cards: Custom Light, Dark, and System selectors
 *    - OpenRouterSettingsPanel: Integrates always-expanded API configuration
 *
 * DEPENDENCIES:
 *    - External: react, react-router-dom, lucide-react, framer-motion
 *    - Internal: @/hooks/useTheme, @/features/settings/OpenRouterSettingsPanel, @/lib/utils
 *
 * USAGE:
 *    import { SettingsPage } from '@/features/settings/SettingsPage';
 *    <Route path="/settings" element={<SettingsPage />} />
 * ============================================================================
 */

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sun, Moon, Monitor, Check, ArrowLeft } from 'lucide-react';

import { useTheme } from '@/hooks/useTheme';
import { OpenRouterSettingsPanel } from './OpenRouterSettingsPanel';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  const { theme, setTheme } = useTheme();

  const themes = [
    {
      id: 'light' as const,
      name: 'Light Mode',
      description: 'Clean, high-contrast crisp look.',
      icon: Sun,
      color: 'text-amber-500 bg-amber-500/10 dark:text-amber-400 dark:bg-amber-400/5',
      glow: 'shadow-amber-500/10 hover:border-amber-400/50',
    },
    {
      id: 'dark' as const,
      name: 'Dark Mode',
      description: 'Sleek, eye-strain-friendly dim vibe.',
      icon: Moon,
      color: 'text-indigo-400 bg-indigo-400/10 dark:text-indigo-300 dark:bg-indigo-300/5',
      glow: 'shadow-indigo-500/10 hover:border-indigo-400/50',
    },
    {
      id: 'system' as const,
      name: 'System Default',
      description: 'Synchronize layout with your OS settings.',
      icon: Monitor,
      color: 'text-emerald-400 bg-emerald-400/10 dark:text-emerald-300 dark:bg-emerald-300/5',
      glow: 'shadow-emerald-500/10 hover:border-emerald-400/50',
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            to="/learn"
            className={cn(
              'font-semibold text-lg hover:opacity-80 transition-opacity',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md px-2 py-1'
            )}
          >
            A2UI
          </Link>
          <nav className="flex items-center gap-4" aria-label="Main navigation">
            <Link
              to="/learn"
              className={cn(
                'flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md px-2 py-1'
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Learn</span>
            </Link>
          </nav>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-12 flex flex-col gap-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Settings</h1>
          <p className="text-muted-foreground">
            Configure system configurations, API credentials, and appearance preferences.
          </p>
        </div>

        {/* Section 1: Appearance & Theme */}
        <section className="space-y-4" aria-labelledby="appearance-heading">
          <h2 id="appearance-heading" className="text-lg font-semibold tracking-tight border-b pb-2">
            Appearance
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {themes.map((t) => {
              const isSelected = theme === t.id;
              const Icon = t.icon;

              return (
                <motion.button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className={cn(
                    'relative text-left p-4 rounded-xl border flex flex-col justify-between transition-all duration-200 shadow-sm cursor-pointer h-full min-h-[140px]',
                    'bg-white/5 border-white/10 backdrop-blur-md',
                    isSelected
                      ? 'border-[#FFD400] ring-1 ring-[#FFD400] shadow-md shadow-[#FFD400]/5 bg-[#FFD400]/5'
                      : t.glow,
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD400]'
                  )}
                >
                  <div className="flex items-start justify-between w-full mb-3">
                    <div className={cn('p-2 rounded-lg shrink-0', t.color)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="h-5 w-5 rounded-full bg-[#FFD400] flex items-center justify-center text-black shrink-0"
                      >
                        <Check className="h-3 w-3 stroke-[3]" />
                      </motion.div>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-1">{t.name}</h3>
                    <p className="text-xs text-muted-foreground leading-normal">{t.description}</p>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* Section 2: AI Provider configurations */}
        <section className="space-y-4" aria-labelledby="ai-provider-heading">
          <h2 id="ai-provider-heading" className="text-lg font-semibold tracking-tight border-b pb-2">
            AI Provider Credentials
          </h2>
          <div className="bg-white/5 border border-white/10 backdrop-blur-md p-6 rounded-xl shadow-sm">
            <p className="text-xs text-muted-foreground mb-4">
              Enter your API keys and select models below. Your API keys are saved securely in your local browser storage and are never uploaded to our servers.
            </p>
            {/* Always expanded multi-provider config panel */}
            <OpenRouterSettingsPanel />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-4 text-center text-sm text-muted-foreground">
        <p>A2UI Settings Panel &mdash; configuration persists in Local Storage</p>
      </footer>
    </div>
  );
}
