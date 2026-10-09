import go from './go.js';

// Gomoku reuses the kaya goban, stones and bowls from Go.
export default function gomoku(ctx) { return go(ctx, { gomoku: true }); }
