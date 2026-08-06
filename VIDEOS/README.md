# Videos

Drop short clips here, then run:

```bash
node generate.js
```

You can add a loose video file directly in this folder, or make one folder per clip:

```text
VIDEOS/
  My Clip/
    clip.mp4
    metadata.json
```

Optional `metadata.json`:

```json
{
  "title": "My Clip",
  "description": "A short moment from a game night.",
  "tags": ["Game Clip", "Moment"],
  "video": "clip.mp4"
}
```
