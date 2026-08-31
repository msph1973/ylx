// Shared framer-motion constants. The easing matches the
// --transition-spring token in styles/variables.css (ease-out-quint) so JS
// animations and CSS transitions decelerate identically.
export const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

// Subtle press-scale for rectangular action buttons; circular icon toggles
// use a slightly deeper scale because they read as "pucks".
// PRESS_SCALE mirrors the --press-scale token in styles/variables.css — keep
// the two in sync (same pairing as EASE_OUT_QUINT <-> --transition-spring).
export const PRESS_SCALE = 0.97;
export const PUCK_SCALE = 0.9;
