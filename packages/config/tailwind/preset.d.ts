import type { Config } from 'tailwindcss';

/** Shared Tailwind preset (design tokens). Consumed via `presets: [preset]`. */
declare const preset: Omit<Config, 'content'>;
export default preset;
