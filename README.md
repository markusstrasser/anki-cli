# Anki Database Query CLI

## Requirements
- Bun (https://bun.sh)

## Usage
```bash
# Make sure the script is executable
chmod +x anki-query.js

# Get collection overview
./anki-query.js overview

# Search cards by keyword (optionally in a specific deck)
./anki-query.js search "biology"
./anki-query.js search "chemistry" "Science Deck"

# Get review statistics
./anki-query.js reviews

# Get detailed deck information
./anki-query.js decks
```

## Features
- Robust error handling
- Flexible querying
- Supports searching cards by:
  - Keyword
  - Optional deck filtering
- Detailed review statistics
- Deck-level insights

## Installation
1. Install Bun: `curl -fsSL https://bun.sh/install | bash`
2. Ensure the script points to the correct Anki database path
