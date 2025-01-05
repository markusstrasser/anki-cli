#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { join } from "node:path";

const AnkiUtils = {
  DB_PATH: join(
    process.env.HOME || "",
    "Library",
    "Application Support",
    "Anki2",
    "alien",
    "collection.anki2"
  ),

  withDatabase(callback, { readonly = true } = {}) {
    const db = new Database(this.DB_PATH, { readonly });

    try {
      return callback(db);
    } finally {
      db.close();
    }
  },

  searchCards({
    keyword = "",
    deck = null,
    sortBy = "last_review_time",
    limit = 9999,
    minReviewCount = 0,
    easeFactor = null,
    fields = ["front", "back"],
  } = {}) {
    return this.withDatabase((db) => {
      const query = `
        WITH card_stats AS (
          SELECT 
            c.id as card_id,
            COUNT(*) as review_count,
            AVG(r.time) as avg_review_time,
            MAX(r.id) as last_review_time,
            MAX(r.ease) as last_ease_factor
          FROM cards c
          LEFT JOIN revlog r ON r.cid = c.id
          GROUP BY c.id
        )
        SELECT 
          n.id as note_id, 
          c.id as card_id, 
          n.flds as note_fields,
          d.name as deck_name,
          COALESCE(cs.review_count, 0) as review_count,
          cs.avg_review_time,
          cs.last_review_time,
          cs.last_ease_factor
        FROM notes n
        JOIN cards c ON n.id = c.nid
        JOIN decks d ON c.did = d.id
        LEFT JOIN card_stats cs ON cs.card_id = c.id
        WHERE 1=1
        ${keyword ? "AND n.flds LIKE ?" : ""}
        ${deck ? "AND d.name = ?" : ""}
        ${minReviewCount > 0 ? "AND COALESCE(cs.review_count, 0) >= ?" : ""}
        ${easeFactor ? "AND cs.last_ease_factor = ?" : ""}
        ORDER BY cs.${sortBy} DESC NULLS LAST 
        LIMIT ?`;

      const params = [];
      if (keyword) params.push(`%${keyword}%`);
      if (deck) params.push(deck);
      if (minReviewCount > 0) params.push(minReviewCount);
      if (easeFactor) params.push(easeFactor);
      params.push(limit);

      const results = db.query(query).all(...params);

      return results.map((result) => {
        const fieldsData = result.note_fields.split("\u001f");
        const fieldMap = {
          front: fieldsData[0],
          back: fieldsData[1] || null,
        };

        return fields.reduce(
          (acc, field) => {
            if (fieldMap[field] !== undefined) {
              acc[field] = fieldMap[field];
            }
            return acc;
          },
          { ...result }
        );
      });
    });
  },
};

function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    if (command === "search") {
      console.log(
        JSON.stringify(
          AnkiUtils.searchCards({ keyword: args[0], deck: args[1] }),
          null,
          2
        )
      );
    } else {
      console.log("Usage:");
      console.log("  anki search [keyword] [deck]");
      process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
