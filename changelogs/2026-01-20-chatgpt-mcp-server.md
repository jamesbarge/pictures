# Add Pictures.london ChatGPT App (MCP Server + Widgets)

**Date**: 2026-01-20

## Overview

Added MCP (Model Context Protocol) server and React widgets to enable Pictures.london integration with ChatGPT and other LLM clients. Users can now ask questions like "What's showing at BFI tonight?" and receive interactive cinema listings.

## Changes

### MCP Server (`packages/mcp-server/`)

New package providing 5 tools for querying London cinema data:

1. **search_london_screenings** - Find screenings by film, cinema, date, or format
2. **search_london_films** - Search or browse films currently showing
3. **list_london_cinemas** - List all covered cinemas with filtering by chain/area
4. **list_london_festivals** - Find upcoming film festivals with ticket status
5. **get_festival_screenings** - Get full screening programme for a festival

Key features:
- Wraps existing `/api/*` endpoints - no changes to core app needed
- Supports dual transport modes:
  - **Stdio** for local MCP clients (Claude Desktop)
  - **HTTP** for web-based clients (ChatGPT apps)
- Built with `@modelcontextprotocol/sdk`
- Full TypeScript with Zod schema validation

### React Widgets (`packages/chatgpt-widgets/`)

New package with React components for rendering cinema data:

1. **ScreeningListWidget** - Horizontal scrolling cards with posters, times, booking links
2. **FilmGridWidget** - Poster grid with screening count badges
3. **FestivalCardWidget** - Festival info with status badges and ticket sale info

Key features:
- Styled with Tailwind CSS matching Pictures.london aesthetic
- All widgets link back to pictures.london for full exploration
- Empty state handling with fallback CTAs
- Optimized for inline display in chat interfaces

## Architecture

```
packages/
├── mcp-server/                 # MCP server (port 8000)
│   ├── src/
│   │   ├── index.ts            # Server entry point
│   │   ├── lib/
│   │   │   ├── api-client.ts   # HTTP client for Pictures API
│   │   │   └── types.ts        # TypeScript types
│   │   └── tools/
│   │       ├── screenings.ts   # search_london_screenings
│   │       ├── films.ts        # search_london_films
│   │       ├── cinemas.ts      # list_london_cinemas
│   │       └── festivals.ts    # list_london_festivals, get_festival_screenings
│   └── package.json
│
└── chatgpt-widgets/            # React widgets (port 5000)
    ├── src/
    │   ├── widgets/
    │   │   ├── ScreeningListWidget.tsx
    │   │   ├── FilmGridWidget.tsx
    │   │   └── FestivalCardWidget.tsx
    │   └── lib/types.ts
    └── package.json
```

## Usage

### Running the MCP Server

```bash
# Stdio mode (for Claude Desktop)
cd packages/mcp-server
npm start

# HTTP mode (for web clients)
npm start -- --http --port=8000
```

### Environment Variables

```bash
PICTURES_API_URL=https://pictures.london  # API base URL
MCP_TRANSPORT=http                         # Transport mode
PORT=8000                                  # HTTP server port
```

## Impact

- **ChatGPT Users**: Can now get London cinema listings directly in conversations
- **Discovery**: ChatGPT can surface Pictures.london when users discuss films/cinema
- **No Core Changes**: Main app unchanged - all new code in separate packages
- **Future Extensibility**: Easy to add more tools (recommendations, watchlist, etc.)

## Files Added

### MCP Server
- `packages/mcp-server/package.json`
- `packages/mcp-server/tsconfig.json`
- `packages/mcp-server/README.md`
- `packages/mcp-server/src/index.ts`
- `packages/mcp-server/src/lib/api-client.ts`
- `packages/mcp-server/src/lib/types.ts`
- `packages/mcp-server/src/tools/screenings.ts`
- `packages/mcp-server/src/tools/films.ts`
- `packages/mcp-server/src/tools/cinemas.ts`
- `packages/mcp-server/src/tools/festivals.ts`

### Widgets
- `packages/chatgpt-widgets/package.json`
- `packages/chatgpt-widgets/tsconfig.json`
- `packages/chatgpt-widgets/vite.config.ts`
- `packages/chatgpt-widgets/tailwind.config.js`
- `packages/chatgpt-widgets/src/index.tsx`
- `packages/chatgpt-widgets/src/widgets/ScreeningListWidget.tsx`
- `packages/chatgpt-widgets/src/widgets/FilmGridWidget.tsx`
- `packages/chatgpt-widgets/src/widgets/FestivalCardWidget.tsx`
