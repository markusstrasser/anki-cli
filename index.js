#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import path from "node:path";

class AnkiDatabase {
  constructor(dbPath) {
    this.db = new Database(dbPath);
  }

  /**
   * Get basic collection overview
   * @returns {Object} Collection statistics
   */
  getOverview() {
    const stmt = this.db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM cards) as total_cards,
        (SELECT COUNT(DISTINCT did) FROM cards) as total_decks,
        (SELECT COUNT(*) FROM notes) as total_notes,
        (SELECT COUNT(*) FROM revlog) as total_reviews
    `);
    return stmt.get();
  }

  /**
   * Find cards by keyword in note content
   * @param {string} keyword - Keyword to search for
   * @param {Object} options - Optional search parameters
   * @returns {Array} Matching cards
   */
  findCardsByKeyword(keyword, options = {}) {
    const {
      limit = 100,
      offset = 0,
      deck = null,
      caseSensitive = false,
    } = options;

    const searchOperator = caseSensitive ? "LIKE BINARY" : "LIKE";
    const searchParam = `%${keyword}%`;

    let query = `
      SELECT 
        n.id as note_id, 
        c.id as card_id, 
        n.flds as note_fields,
        d.name as deck_name
      FROM notes n
      JOIN cards c ON n.id = c.nid
      JOIN decks d ON c.did = d.id
      WHERE n.flds ${searchOperator} ?
    `;

    const params = [searchParam];

    if (deck) {
      query += " AND d.name = ?";
      params.push(deck);
    }

    query += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Get review statistics
   * @param {Object} options - Optional filter parameters
   * @returns {Object} Review statistics
   */
  getReviewStats(options = {}) {
    const { startDate = null, endDate = null } = options;

    let query = `
      SELECT 
        COUNT(*) as total_reviews,
        MIN(id) as first_review,
        MAX(id) as last_review,
        AVG(time) as avg_review_time,
        SUM(CASE WHEN ease = 1 THEN 1 ELSE 0 END) as again_count,
        SUM(CASE WHEN ease = 2 THEN 1 ELSE 0 END) as hard_count,
        SUM(CASE WHEN ease = 3 THEN 1 ELSE 0 END) as good_count,
        SUM(CASE WHEN ease = 4 THEN 1 ELSE 0 END) as easy_count
      FROM revlog
    `;

    const params = [];
    const conditions = [];

    if (startDate) {
      conditions.push("id >= ?");
      params.push(startDate);
    }

    if (endDate) {
      conditions.push("id <= ?");
      params.push(endDate);
    }

    if (conditions.length) {
      query += " WHERE " + conditions.join(" AND ");
    }

    const stmt = this.db.prepare(query);
    return stmt.get(...params);
  }

  /**
   * Get detailed deck information
   * @returns {Array} Deck details with card counts
   */
  getDeckDetails() {
    const stmt = this.db.prepare(`
      SELECT 
        id as deck_id,
        name as deck_name,
        (SELECT COUNT(*) FROM cards WHERE did = decks.id) as total_cards,
        (SELECT COUNT(*) FROM cards WHERE did = decks.id AND queue = 0) as new_cards,
        (SELECT COUNT(*) FROM cards WHERE did = decks.id AND queue = 1) as learning_cards,
        (SELECT COUNT(*) FROM cards WHERE did = decks.id AND queue = 2) as review_cards
      FROM decks
      ORDER BY total_cards DESC
    `);
    return stmt.all();
  }

  /**
   * Close the database connection
   */
  close() {
    this.db.close();
  }
}

// Utility function to get Anki database path
function getAnkiDatabasePath() {
  const homeDir = process.env.HOME;
  return path.join(
    homeDir,
    "Library",
    "Application Support",
    "Anki2",
    "alien",
    "collection.anki2"
  );
}

// CLI Interface
function main() {
  const dbPath = getAnkiDatabasePath();
  const db = new AnkiDatabase(dbPath);

  try {
    const command = process.argv[2];
    const arg1 = process.argv[3];
    const arg2 = process.argv[4];

    switch (command) {
      case "overview":
        console.log(JSON.stringify(db.getOverview(), null, 2));
        break;
      case "search":
        if (!arg1) {
          console.error("Please provide a search keyword");
          process.exit(1);
        }
        console.log(
          JSON.stringify(
            db.findCardsByKeyword(arg1, {
              deck: arg2,
              limit: 50,
            }),
            null,
            2
          )
        );
        break;
      case "reviews":
        console.log(JSON.stringify(db.getReviewStats(), null, 2));
        break;
      case "decks":
        console.log(JSON.stringify(db.getDeckDetails(), null, 2));
        break;
      default:
        console.log("Available commands:");
        console.log("- overview: Get collection statistics");
        console.log("- search <keyword> [deck]: Search cards by keyword");
        console.log("- reviews: Get review statistics");
        console.log("- decks: Get detailed deck information");
        process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
