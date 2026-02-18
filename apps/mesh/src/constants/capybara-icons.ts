/**
 * Capybara Icon Paths for Virtual MCPs
 *
 * Collection of capybara avatar images stored locally in /public/icons/.
 * These are used as default icons when creating virtual MCPs without a custom icon.
 */

/**
 * Array of 39 unique capybara icon paths
 * Capybara avatars stored locally for fast loading and offline support
 */
export const CAPYBARA_ICONS = [
  "/icons/capy.png",
  "/icons/capy-1.png",
  "/icons/capy-2.png",
  "/icons/capy-3.png",
  "/icons/capy-4.png",
  "/icons/capy-5.png",
  "/icons/capy-6.png",
  "/icons/capy-7.png",
  "/icons/capy-8.png",
  "/icons/capy-9.png",
  "/icons/capy-10.png",
  "/icons/capy-11.png",
  "/icons/capy-12.png",
  "/icons/capy-13.png",
  "/icons/capy-14.png",
  "/icons/capy-15.png",
  "/icons/capy-16.png",
  "/icons/capy-17.png",
  "/icons/capy-18.png",
  "/icons/capy-19.png",
  "/icons/capy-20.png",
  "/icons/capy-21.png",
  "/icons/capy-22.png",
  "/icons/capy-23.png",
  "/icons/capy-24.png",
  "/icons/capy-25.png",
  "/icons/capy-26.png",
  "/icons/capy-27.png",
  "/icons/capy-28.png",
  "/icons/capy-29.png",
  "/icons/capy-30.png",
  "/icons/capy-31.png",
  "/icons/capy-32.png",
  "/icons/capy-33.png",
  "/icons/capy-34.png",
  "/icons/capy-35.png",
  "/icons/capy-36.png",
  "/icons/capy-37.png",
  "/icons/capy-38.png",
] as const;

/**
 * Pick a random capybara icon from the available set
 * @returns A random capybara icon URL
 */
export function pickRandomCapybaraIcon(): string {
  const randomIndex = Math.floor(Math.random() * CAPYBARA_ICONS.length);
  return CAPYBARA_ICONS[randomIndex] as string;
}
