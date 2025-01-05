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
    limit = 50,
    minReviewCount = 0,
    easeFactor = null,
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

      return db.query(query).all(...params);
    });
  },

  addCard({ deck = "ai_inbox", fields = {}, modelName = "Basic" } = {}) {
    return this.withDatabase(
      (db) => {
        const noteTypeId = db
          .query("SELECT id FROM notetypes WHERE name = ?")
          .get(modelName)?.id;
        if (!noteTypeId) throw new Error(`Note type ${modelName} not found`);

        const deckId = db
          .query("SELECT id FROM decks WHERE name = ?")
          .get(deck)?.id;
        if (!deckId) throw new Error(`Deck ${deck} not found`);

        const now = Date.now();
        const fieldStr = Object.values(fields).join("\u001f");
        const noteId = now;
        const guid = Math.random().toString(36).substring(2);

        db.query(
          `
          INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          noteId,
          guid,
          noteTypeId,
          now,
          -1,
          "",
          fieldStr,
          fieldStr.split("\u001f")[0],
          0,
          0,
          ""
        );

        db.query(
          `
          INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          now + 1,
          noteId,
          deckId,
          0,
          now,
          -1,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          ""
        );

        return { noteId, cardId: now + 1 };
      },
      { readonly: false }
    );
  },

  archiveCard(cardId) {
    return this.withDatabase(
      (db) => {
        const toDeleteDeckId = db
          .query("SELECT id FROM decks WHERE name = 'to_delete'")
          .get()?.id;
        if (!toDeleteDeckId) throw new Error("to_delete deck not found");
        return db
          .query("UPDATE cards SET did = ? WHERE id = ?")
          .run(toDeleteDeckId, cardId);
      },
      { readonly: false }
    );
  },

  getReviewMetrics({ startDate = null, endDate = null, deck = null } = {}) {
    return this.withDatabase((db) => {
      const query = `
        SELECT 
          COUNT(*) as total_reviews,
          AVG(time) as avg_review_time,
          AVG(ease) as avg_ease_factor,
          MIN(id) as first_review,
          MAX(id) as last_review,
          SUM(CASE WHEN ease = 1 THEN 1 ELSE 0 END) as again_count,
          SUM(CASE WHEN ease = 2 THEN 1 ELSE 0 END) as hard_count,
          SUM(CASE WHEN ease = 3 THEN 1 ELSE 0 END) as good_count,
          SUM(CASE WHEN ease = 4 THEN 1 ELSE 0 END) as easy_count
        FROM revlog r
        JOIN cards c ON r.cid = c.id
        JOIN decks d ON c.did = d.id
        WHERE 1=1
        ${startDate ? "AND r.time >= ?" : ""}
        ${endDate ? "AND r.time <= ?" : ""}
        ${deck ? "AND d.name = ?" : ""}`;

      const params = [];
      if (startDate) params.push(startDate);
      if (endDate) params.push(endDate);
      if (deck) params.push(deck);

      return db.query(query).get(...params);
    });
  },
};

function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    switch (command) {
      case "search":
        console.log(
          JSON.stringify(
            AnkiUtils.searchCards({ keyword: args[0], deck: args[1] }),
            null,
            2
          )
        );
        break;
      case "add":
        console.log(
          JSON.stringify(
            AnkiUtils.addCard({
              deck: args[0] || "ai_inbox",
              fields: { Front: args[1], Back: args[2] },
            }),
            null,
            2
          )
        );
        break;
      case "archive":
        console.log(
          JSON.stringify(AnkiUtils.archiveCard(BigInt(args[0])), null, 2)
        );
        break;
      case "metrics":
        console.log(
          JSON.stringify(
            AnkiUtils.getReviewMetrics({
              deck: args[0],
              startDate: args[1] ? BigInt(args[1]) : null,
              endDate: args[2] ? BigInt(args[2]) : null,
            }),
            null,
            2
          )
        );
        break;
      default:
        console.log("Usage:");
        console.log("  anki search [keyword] [deck]");
        console.log("  anki add [deck] [front] [back]");
        console.log("  anki archive [card_id]");
        console.log("  anki metrics [deck] [start_date] [end_date]");
        process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
