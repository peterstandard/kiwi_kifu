/**
 * Kiwi Kifu - Local Storage & Game Archive Service
 */

const KEY_CURRENT = 'kiwikifu_current';
const KEY_LIBRARY = 'kiwikifu_library';
const LEGACY_CURRENT = 'simplekifu_current';
const LEGACY_LIBRARY = 'simplekifu_library';

export class StorageService {
  static saveCurrentGame(sgf) {
    try {
      localStorage.setItem(KEY_CURRENT, sgf);
    } catch (err) {
      console.warn('LocalStorage error saving current game', err);
    }
  }

  static loadCurrentGame() {
    try {
      return localStorage.getItem(KEY_CURRENT) || localStorage.getItem(LEGACY_CURRENT);
    } catch (err) {
      console.warn('LocalStorage error loading current game', err);
      return null;
    }
  }

  static archiveGame(game) {
    try {
      const sgf = game.toSgf();
      const library = this.getLibrary();

      const record = {
        id: Date.now(),
        date: game.info.date,
        black: game.info.blackName,
        white: game.info.whiteName,
        moves: game.history.length - 1,
        sgf
      };

      library.unshift(record);
      // Keep up to 50 saved games in library
      if (library.length > 50) library.pop();
      localStorage.setItem(KEY_LIBRARY, JSON.stringify(library));
      return record;
    } catch (err) {
      console.warn('Error archiving game', err);
      return null;
    }
  }

  static getLibrary() {
    try {
      const libraryStr = localStorage.getItem(KEY_LIBRARY) || localStorage.getItem(LEGACY_LIBRARY) || '[]';
      return JSON.parse(libraryStr);
    } catch (err) {
      console.warn('Error reading library', err);
      return [];
    }
  }

  static clearLibrary() {
    try {
      localStorage.removeItem(KEY_LIBRARY);
      localStorage.removeItem(LEGACY_LIBRARY);
    } catch (err) {
      console.warn('Error clearing library', err);
    }
  }
}
