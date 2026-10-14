# Sharper light theme and app-wide polish

Light mode currently washes out: the page background, cards and borders are nearly the same shade, and the grey secondary text is too faint. The goal is a minimal, crisp look with clear contrast on every page. Dark mode stays as it is.

## What changes visually

**Light palette (contrast first, still minimal)**
- The page background is a soft neutral grey, so white cards stand out clearly against it.
- Cards are pure white with a visible hairline border and a very soft shadow.
- Main text is near-black. Secondary text is darker, so it is readable rather than faded.
- Green is kept for actions only: buttons, the active menu item and links. The green is a deeper shade so white text on it has strong contrast.
- Input boxes, menu chips and suggestion pills get clear borders, plus a visible focus ring when selected.
- Warning, success and danger colours get tuned so their tinted boxes stay legible on white.

**Layout polish across all pages**
- **Top bar:** a solid white bar with a bottom border. The active page shows as a filled pill, and inactive items are dark grey instead of faint.
- **Page headers:** every page gets the same title size, subtitle and spacing.
- **Cards:** consistent inner spacing, with small uppercase section labels in a readable grey.
- **Agronomist chat:** the empty state gets a short heading and helper line above the suggestion pills. The pills get borders, and the reply area has a clear border and a solid send button.
- **Dashboard:** stat numbers get stronger, the agent panel's step log and the quick-link cards get clear edges, and hover states look the same everywhere.
- **Disease Detection:** the engine switch, drop zone and result card all use the stronger borders. The confidence bars get a visible track.
- **Fertilizer and Algorithm Inspector:** tables and code blocks get a tinted background with a border, so they don't blend into the card.
- **Footer note:** becomes darker and readable.

## Not changing
- Dark mode colours, and the special dark irrigation control-room look.
- Any calculations, data or behaviour.

## Technical details
- Retune only the light-mode colour values at the top of `src/styles.css` (background around 0.965 lightness, card 1.0, border around 0.87, muted-foreground around 0.45, foreground around 0.2, primary around 0.42 lightness). Add a `--shadow-card` token, and have the `Card` component use it through a semantic utility.
- Light component adjustments use existing tokens only: AppShell nav, the chat empty state and input, the AgentFlowPanel, the scanner toggle and drop zone, and the shared page header spacing. No hardcoded colours.
- Verify with Playwright screenshots of all six pages in light and dark mode at 1280px and 390px. Check that there is no horizontal overflow and no console errors.
