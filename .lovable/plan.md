# App-wide light and dark themes

## What will change
- Add a light/dark switch to the main navigation, available on every page.
- Remember the selected mode in the browser and restore it on future visits.
- Apply both themes consistently across Dashboard, Scanner, Agronomist, Irrigation, Fertilizer, and Algorithms.
- Keep the existing AgriSense light palette unchanged.
- Rework the shared dark palette around near-black and charcoal surfaces, using AgriDSS green only for actions, status, and data emphasis.
- Preserve the irrigation dashboard’s dark control-room styling when dark mode is selected, while allowing it to use the light theme when switched.

## Technical details
- Theme state will live in the shared app shell and use semantic color tokens, so existing screens inherit the chosen mode without page-specific color overrides.
- Browser storage will save the choice; first-time visitors will default to their device preference.
- The switch will be icon-based, keyboard accessible, and include an accessible label and tooltip.
- The irrigation-only forced dark class will be removed; its specialized dashboard styling remains scoped to that page.
- Update the project architecture note to reflect user-selectable app-wide theming.
- Verify both modes on desktop and mobile, including persistence and horizontal overflow.
