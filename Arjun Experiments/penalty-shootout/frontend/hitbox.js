/**
 * Save detection aligned to the goalkeeper sprite (180×280px in an 800×400 goal).
 * Uses an ellipse plus ball radius so shots that hit the visible keeper register as saves.
 */
const GK_HOME_X = 0.5;
const GK_HOME_Y = 0.65;

// Normalised half-size of the keeper body in goal coordinates
const GK_HALF_WIDTH = 180 / 800 / 2;
const GK_HALF_HEIGHT = 280 / 400 / 2;
const BALL_RADIUS = 0.04;

function isGoalkeeperSave(kickX, kickY, gkX, gkY) {
    const horizDive = Math.abs(gkX - GK_HOME_X);
    // Full stretch dives cover more horizontal area
    const rx = (GK_HALF_WIDTH + BALL_RADIUS) * (1 + horizDive * 0.9);
    const ry = GK_HALF_HEIGHT + BALL_RADIUS;

    const dx = (kickX - gkX) / rx;
    const dy = (kickY - gkY) / ry;
    return dx * dx + dy * dy <= 1;
}
