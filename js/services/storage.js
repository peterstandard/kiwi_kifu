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

  static getLibraryRaw() {
    try {
      const libraryStr = localStorage.getItem(KEY_LIBRARY) || localStorage.getItem(LEGACY_LIBRARY) || '[]';
      return JSON.parse(libraryStr);
    } catch (err) {
      console.warn('Error reading library', err);
      return [];
    }
  }

  static getLibrary() {
    const list = this.getLibraryRaw();
    return list.sort((a, b) => {
      const aFav = !!a.isFavorite;
      const bFav = !!b.isFavorite;
      if (bFav && !aFav) return 1;
      if (!bFav && aFav) return -1;
      return (b.id || 0) - (a.id || 0);
    });
  }

  static saveLibraryRaw(library) {
    try {
      localStorage.setItem(KEY_LIBRARY, JSON.stringify(library));
    } catch (err) {
      console.warn('Error saving library', err);
    }
  }

  static getUniqueId() {
    this._seq = ((this._seq || 0) + 1) % 1000;
    return Date.now() * 1000 + this._seq;
  }

  static archiveGame(game) {
    try {
      const sgf = game.toSgf();
      const library = this.getLibraryRaw();

      // Deduplication check: avoid duplicate identical saves
      const existing = library.find(item => item.sgf === sgf);
      if (existing) {
        return existing;
      }

      const record = {
        id: this.getUniqueId(),
        date: game.info.date || new Date().toISOString().slice(0, 10),
        black: game.info.blackName || 'Black',
        white: game.info.whiteName || 'White',
        moves: game.history.length - 1,
        sgf,
        isFavorite: false
      };

      library.unshift(record);
      if (library.length > 60) library.pop();
      this.saveLibraryRaw(library);
      return record;
    } catch (err) {
      console.warn('Error archiving game', err);
      return null;
    }
  }

  static saveGameOverwrite(game, existingId = null) {
    try {
      const sgf = game.toSgf();
      const library = this.getLibraryRaw();
      const moves = game.history.length - 1;
      const date = game.info.date || new Date().toISOString().slice(0, 10);
      const black = game.info.blackName || 'Black';
      const white = game.info.whiteName || 'White';

      let targetIdx = -1;
      if (existingId) {
        targetIdx = library.findIndex(item => item.id === existingId);
      }

      if (targetIdx !== -1) {
        library[targetIdx].sgf = sgf;
        library[targetIdx].moves = moves;
        library[targetIdx].date = date;
        library[targetIdx].black = black;
        library[targetIdx].white = white;
        this.saveLibraryRaw(library);
        return { record: library[targetIdx], isNew: false };
      } else {
        const duplicateIdx = library.findIndex(item => item.sgf === sgf);
        if (duplicateIdx !== -1) {
          return { record: library[duplicateIdx], isNew: false };
        }

        const record = {
          id: this.getUniqueId(),
          date,
          black,
          white,
          moves,
          sgf,
          isFavorite: false
        };
        library.unshift(record);
        if (library.length > 60) library.pop();
        this.saveLibraryRaw(library);
        return { record, isNew: true };
      }
    } catch (err) {
      console.warn('Error overwriting game', err);
      return null;
    }
  }

  static saveGameCopy(game) {
    try {
      const sgf = game.toSgf();
      const library = this.getLibraryRaw();

      const record = {
        id: this.getUniqueId(),
        date: game.info.date || new Date().toISOString().slice(0, 10),
        black: game.info.blackName || 'Black',
        white: game.info.whiteName || 'White',
        moves: game.history.length - 1,
        sgf,
        isFavorite: false
      };

      library.unshift(record);
      if (library.length > 60) library.pop();
      this.saveLibraryRaw(library);
      return record;
    } catch (err) {
      console.warn('Error saving game copy', err);
      return null;
    }
  }

  static deleteGame(gameId) {
    try {
      const library = this.getLibraryRaw();
      const updated = library.filter(item => item.id !== gameId);
      this.saveLibraryRaw(updated);
      return true;
    } catch (err) {
      console.warn('Error deleting game', err);
      return false;
    }
  }

  static toggleFavorite(gameId) {
    try {
      const library = this.getLibraryRaw();
      const target = library.find(item => item.id === gameId);
      if (target) {
        target.isFavorite = !target.isFavorite;
        this.saveLibraryRaw(library);
        return target.isFavorite;
      }
      return false;
    } catch (err) {
      console.warn('Error toggling favorite', err);
      return false;
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
