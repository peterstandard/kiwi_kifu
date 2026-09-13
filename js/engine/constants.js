/**
 * SimpleKifu - Board and SGF Constants
 */

export const COORD_LETTERS = ['A','B','C','D','E','F','G','H','J','K','L','M','N','O','P','Q','R','S','T'];
export const SGF_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export const HOSHI_POINTS = {
  19: {
    points: [
      { x: 3, y: 3 }, { x: 9, y: 3 }, { x: 15, y: 3 },
      { x: 3, y: 9 }, { x: 9, y: 9 }, { x: 15, y: 9 },
      { x: 3, y: 15 }, { x: 9, y: 15 }, { x: 15, y: 15 }
    ],
    handicapMap: {
      d4: { x: 3, y: 15 }, q16: { x: 15, y: 3 }, q4: { x: 15, y: 15 }, d16: { x: 3, y: 3 },
      k10: { x: 9, y: 9 }, d10: { x: 3, y: 9 }, q10: { x: 15, y: 9 },
      k4: { x: 9, y: 15 }, k16: { x: 9, y: 3 }
    }
  },
  13: {
    points: [
      { x: 3, y: 3 }, { x: 9, y: 3 },
      { x: 6, y: 6 },
      { x: 3, y: 9 }, { x: 9, y: 9 }
    ],
    handicapMap: {
      d4: { x: 3, y: 9 }, k10: { x: 9, y: 3 }, k4: { x: 9, y: 9 }, d10: { x: 3, y: 3 }, g7: { x: 6, y: 6 }
    }
  },
  9: {
    points: [
      { x: 2, y: 2 }, { x: 6, y: 2 },
      { x: 4, y: 4 },
      { x: 2, y: 6 }, { x: 6, y: 6 }
    ],
    handicapMap: {
      c3: { x: 2, y: 6 }, g7: { x: 6, y: 2 }, g3: { x: 6, y: 6 }, c7: { x: 2, y: 2 }, e5: { x: 4, y: 4 }
    }
  }
};
