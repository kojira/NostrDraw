# NIP-xxx: NostrDraw - Vector Drawing Events

`draft` `optional`

This NIP defines events for storing and sharing vector-based drawings on Nostr.

## Abstract

NostrDraw enables users to create, share, and collaborate on SVG-based drawings through Nostr. Drawings are stored as compressed SVG data in parameterized replaceable events, supporting features like collaborative "extend" (drawing on top of others' work) and category tagging.

## Event Kinds

| Kind | Description |
|------|-------------|
| 31898 | NostrDraw Post (main drawing event) |
| 31899 | Color Palette |
| 30898 | Post Tags (separate tag management) |
| 30899 | Tag Follow List |

## NostrDraw Post (kind 31898)

A parameterized replaceable event (NIP-33) containing vector drawing data.

### Tags

| Tag | Description | Required |
|-----|-------------|----------|
| `d` | Unique identifier (e.g., `public-20260125-143052`) | Yes |
| `client` | Client identifier (e.g., `nostrdraw`) | Yes |
| `p` | Recipient pubkey (for private/directed posts) | No |
| `e` | Parent event reference with marker (`root`, `reply`) for extends | No |
| `parent_p` | Parent author's pubkey | No |
| `t` | Category hashtag (NIP-12) | No |

### Content

JSON object with the following fields:

```json
{
  "svgCompressed": "<base64-encoded-gzip-compressed-svg>",
  "compression": "gzip+base64",
  "message": "Optional text message",
  "layoutId": "vertical",
  "version": "20260116",
  "isPublic": true,
  "allowExtend": true,
  "parentEventId": null,
  "isDiff": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `svgCompressed` | string | Base64-encoded gzip-compressed SVG data |
| `compression` | string | Compression method (`gzip+base64`) |
| `svg` | string | Raw SVG (fallback if compression fails) |
| `message` | string | Optional text message |
| `layoutId` | string | Layout type: `vertical`, `horizontal`, `fullscreen`, `classic` |
| `version` | string | Format version (YYYYMMDD) |
| `isPublic` | boolean | Whether the post is public |
| `allowExtend` | boolean | Whether others can extend (draw on top) |
| `parentEventId` | string? | Parent event ID for extends |
| `isDiff` | boolean | Whether SVG contains only the diff (requires merging with parent) |

### Example Event

```json
{
  "kind": 31898,
  "pubkey": "<author-pubkey>",
  "created_at": 1737816652,
  "tags": [
    ["d", "public-20260125-143052"],
    ["client", "nostrdraw"],
    ["t", "pixel-art"],
    ["t", "character"]
  ],
  "content": "{\"svgCompressed\":\"H4sIAAAAAAAA...\",\"compression\":\"gzip+base64\",\"message\":\"\",\"layoutId\":\"vertical\",\"version\":\"20260116\",\"isPublic\":true,\"allowExtend\":true}",
  "id": "<event-id>",
  "sig": "<signature>"
}
```

### Extend (Collaboration) Event

When extending another user's drawing:

```json
{
  "kind": 31898,
  "tags": [
    ["d", "public-20260125-150000"],
    ["client", "nostrdraw"],
    ["e", "<root-event-id>", "", "root"],
    ["e", "<parent-event-id>", "", "reply"],
    ["parent_p", "<parent-author-pubkey>"]
  ],
  "content": "{\"svgCompressed\":\"...\",\"compression\":\"gzip+base64\",\"parentEventId\":\"<parent-event-id>\",\"isDiff\":true,\"allowExtend\":true}"
}
```

When `isDiff` is `true`, the SVG contains only the additions. Clients must fetch the parent chain and merge SVGs for display.

## Color Palette (kind 31899)

Stores user-created color palettes.

```json
{
  "kind": 31899,
  "tags": [
    ["d", "palette-<id>"],
    ["client", "nostrdraw"]
  ],
  "content": "{\"name\":\"My Palette\",\"colors\":[\"#ff0000\",\"#00ff00\",\"#0000ff\"],\"version\":\"1\"}"
}
```

## Post Tags (kind 30898)

Separate event for managing tags without modifying the original post (preserves reactions).

```json
{
  "kind": 30898,
  "tags": [
    ["d", "tags-<original-event-id>"],
    ["e", "<original-event-id>"],
    ["client", "nostrdraw"],
    ["t", "pixel-art"],
    ["t", "cute"]
  ],
  "content": ""
}
```

## Tag Follow List (kind 30899)

User's followed tags list.

```json
{
  "kind": 30899,
  "tags": [
    ["d", "nostrdraw-tag-follows"],
    ["t", "pixel-art"],
    ["t", "character"]
  ],
  "content": ""
}
```

## SVG Format

### Compression

1. Raw SVG string
2. Gzip compress
3. Base64 encode
4. Store in `svgCompressed` field

### Decompression

```javascript
import pako from 'pako';

function decompressSvg(compressed: string): string {
  const binary = atob(compressed);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const decompressed = pako.inflate(bytes);
  return new TextDecoder().decode(decompressed);
}
```

### SVG Structure

NostrDraw SVGs use a standard structure:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
  <!-- Background -->
  <rect width="100%" height="100%" fill="#ffffff"/>
  
  <!-- Layers (bottom to top) -->
  <g class="layer" data-layer-id="0">
    <!-- Strokes as paths -->
    <path d="M100,100 L200,200" stroke="#000" stroke-width="2" fill="none"/>
  </g>
  
  <!-- Text elements -->
  <text x="400" y="300" font-family="Noto Sans JP" font-size="24">Hello</text>
  
  <!-- Stamps/Images -->
  <image href="data:image/png;base64,..." x="50" y="50" width="100" height="100"/>
</svg>
```

## Diff Merging

When `isDiff: true`, merge parent and child SVGs:

1. Fetch parent SVG (recursively if parent also has `isDiff: true`)
2. Parse both SVGs
3. Combine layers (child layers appear on top)
4. Return merged SVG

## Client Behavior

### Displaying Posts

1. Fetch event by ID or filter
2. Parse content JSON
3. If `svgCompressed` exists, decompress; otherwise use `svg`
4. If `isDiff` is true, fetch parent chain and merge
5. Render SVG

### Creating Posts

1. Generate SVG from canvas
2. Compress SVG (gzip + base64)
3. Build event with appropriate tags
4. Sign and publish

### Extending Posts

1. Check `allowExtend` flag on parent
2. Generate diff SVG (only new strokes/elements)
3. Set `parentEventId`, `isDiff: true`
4. Add `e` tags with `root` and `reply` markers
5. Sign and publish

## Compatibility

- Uses NIP-33 (Parameterized Replaceable Events)
- Uses NIP-10 (Event References) for extend chains
- Uses NIP-12 (Hashtags) for category tags
- Optionally publishes kind 1 note with image URL for visibility in other clients

## Reference Implementation

- [NostrDraw](https://github.com/kojira/NostrDraw) - React/TypeScript implementation

## Future Considerations

- Layer-level authorship tracking for collaborative editing
- Real-time collaborative drawing via ephemeral events
- Animation/timelapse playback from stroke history
- Standardized brush/tool definitions
