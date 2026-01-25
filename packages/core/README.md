# @nostrdraw/core

Core library for NostrDraw - encode, decode, validate, and build Nostr drawing events.

## Installation

```bash
npm install @nostrdraw/core
# or
pnpm add @nostrdraw/core
```

## Usage

### Parse NostrDraw Event

```typescript
import { parseNostrDrawEvent, extractSvg } from '@nostrdraw/core';

const event = {
  kind: 31898,
  pubkey: '...',
  content: '{"svgCompressed":"H4sI...","compression":"gzip+base64",...}',
  tags: [['d', 'public-20260125-143052'], ['client', 'nostrdraw']],
  // ...
};

const post = parseNostrDrawEvent(event);
console.log(post.svg); // Decompressed SVG string
console.log(post.message);
console.log(post.tags);
```

### Build NostrDraw Event

```typescript
import { buildNostrDrawEvent } from '@nostrdraw/core';

const eventTemplate = buildNostrDrawEvent({
  svg: '<svg>...</svg>',
  message: 'My drawing',
  layoutId: 'vertical',
  allowExtend: true,
  categoryTags: ['pixel-art', 'character'],
});

// Sign the event with your preferred method (NIP-07, etc.)
const signedEvent = await signEvent(eventTemplate);
```

### Extend (Collaborate) on Existing Drawing

```typescript
import { buildExtendEvent } from '@nostrdraw/core';

const extendEvent = buildExtendEvent({
  parentEventId: 'abc123...',
  parentPubkey: 'def456...',
  diffSvg: '<svg>...only new strokes...</svg>',
  message: 'Added some details',
  allowExtend: true,
});
```

### Merge Diff Chain

```typescript
import { mergeDiffChain, getFullSvg } from '@nostrdraw/core';

// When post.isDiff is true, you need to merge with parent(s)
const fullSvg = await getFullSvg(post, async (eventId) => {
  // Fetch event from relay
  return await fetchEventFromRelay(eventId);
});
```

### Compression

```typescript
import { compressSvg, decompressSvg } from '@nostrdraw/core';

const compressed = compressSvg('<svg>...</svg>');
const original = decompressSvg(compressed);
```

### Validation

```typescript
import { validateNostrDrawEvent, validateSvg } from '@nostrdraw/core';

const result = validateNostrDrawEvent(event);
if (!result.valid) {
  console.error('Errors:', result.errors);
}
if (result.warnings.length > 0) {
  console.warn('Warnings:', result.warnings);
}
```

## Constants

```typescript
import {
  NOSTRDRAW_KIND,      // 31898
  PALETTE_KIND,        // 31899
  POST_TAGS_KIND,      // 30898
  TAG_FOLLOW_KIND,     // 30899
  NOSTRDRAW_VERSION,   // Current version
} from '@nostrdraw/core';
```

## Types

```typescript
import type {
  NostrDrawPost,
  NostrDrawContent,
  BuildEventParams,
  EventTemplate,
  NostrEvent,
  ValidationResult,
  ColorPalette,
} from '@nostrdraw/core';
```

## API Reference

### Parsing

- `parseNostrDrawEvent(event)` - Parse Nostr event to NostrDrawPost
- `parseNostrDrawContent(content)` - Parse event content JSON
- `extractSvg(content)` - Extract and decompress SVG from content
- `parsePaletteEvent(event)` - Parse palette event
- `parsePostTagsEvent(event)` - Parse post tags event

### Building

- `buildNostrDrawEvent(params)` - Build drawing event template
- `buildExtendEvent(params)` - Build extend/collaboration event
- `buildPaletteEvent(params)` - Build palette event
- `buildPostTagsEvent(params)` - Build post tags event
- `buildTagFollowEvent(tags)` - Build tag follow list event

### Compression

- `compressSvg(svg)` - Compress SVG to gzip+base64
- `decompressSvg(compressed)` - Decompress gzip+base64 to SVG
- `isCompressed(content)` - Check if content is compressed
- `getCompressedSize(compressed)` - Get size in bytes

### Validation

- `validateNostrDrawEvent(event)` - Validate event structure
- `validateSvg(svg)` - Validate SVG string
- `isNostrDrawEvent(event)` - Quick check if event is NostrDraw

### Merging

- `mergeSvgs(parent, child)` - Merge two SVGs
- `mergeDiffChain(event, fetchEvent)` - Merge entire diff chain
- `getFullSvg(post, fetchEvent)` - Get full SVG from post
- `getRootEventId(eventId, fetchEvent)` - Get root of chain
- `getEventChain(eventId, fetchEvent)` - Get all events in chain

## License

MIT
