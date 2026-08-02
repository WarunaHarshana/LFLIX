# Streaming performance: what the big services do, and what applies here

Research into how Netflix, Apple and Prime Video deliver video, checked against
what LFLIX actually does today. Every recommendation below is ranked by measured
or expected impact **for a LAN media server** — which is a different problem from
a global CDN, so a good deal of what those services do does not transfer.

Measurements were taken on the development machine against a real library file:
`2160p HEVC Main 10, 3836x2072, EAC3 Atmos, 21.7 GB, 26 Mbps`.

---

## The headline finding

LFLIX currently re-encodes video for **any** file in a "bad container" — which
includes every `.mkv` — even when the video stream inside is already something a
browser can play. Measured cost of one 6-second segment of the 4K file above:

| Path | Time for 6s of video | vs realtime |
|------|---------------------|-------------|
| Re-encode video (`libx264 veryfast`) — what we do today | **8656 ms** | 1.44× **slower than playback** |
| Copy video, transcode audio only | **480 ms** | 12.5× faster than playback |

**18× difference.** And note the first row is slower than realtime: for this
file, transcoding cannot keep up with watching it. Playback will stall
indefinitely no matter how large the buffer is.

This is the single most valuable thing to fix.

---

## Recommendations, highest value first

### 1. Add a remux tier — "Direct Stream" (biggest win)

Plex and Jellyfin both classify playback into three tiers, and the whole game is
getting as far up this list as possible:

| Tier | What happens | Server cost |
|------|--------------|-------------|
| **Direct Play** | File sent as-is | ~zero |
| **Direct Stream** | Container rewrapped, codecs copied | very low |
| **Transcode** | Video re-encoded | very high |

LFLIX has tier 1 (`/api/stream` serves the raw file) and tier 3
(`/api/transcode`). **Tier 2 is missing entirely**, so an MKV containing
perfectly playable H.264 + AAC — extremely common — takes the most expensive
path available.

The check to change is in `app/components/VideoPlayer.tsx`: `isBadContainer`
alone forces a transcode, regardless of what is inside the container.

*Design note:* per-segment `-c:v copy` is **not** safe with the current
architecture. Segments are cut with `-ss`/`-t`, and copying cannot cut at
arbitrary timestamps — ffmpeg would silently shift to the nearest keyframe and
break HLS timing. The remux tier needs either keyframe-aligned segment
boundaries or, better, a single long-running ffmpeg with its own HLS muxer
(Jellyfin's model), with session tracking and cleanup. That is a real piece of
work and deserves its own change, which is why it is documented here rather
than rushed.

### 2. Decide from the file, not from the database row

The transcode decision reads `videoCodec` / `audioCodec` off the library row.
Those are populated by ffprobe *with a filename-guess fallback*, and they drift:
the test file above is stored as `audioCodec: "AAC"` when it is actually EAC3
Atmos. A wrong guess means either a needless transcode or a playback failure.

Probe the real streams when starting playback, and treat the DB values as a
display hint only.

### 3. Hardware encoding — *implemented in this release*

Netflix, Apple and every serious server offload encoding to a GPU. Software
`libx264` pegs a CPU core per stream; NVENC/QSV/AMF typically run 5–10× faster
and leave the CPU free.

`lib/ffmpeg.ts` now picks an encoder by **actually initialising it** on a tiny
synthetic clip, caching the result, and falling back to `libx264`. Listing
`ffmpeg -encoders` is not sufficient — this machine's build advertises
`h264_nvenc`, `h264_qsv` *and* `h264_amf`, and **none of the three work**:

```
h264_nvenc: Driver does not support the required nvenc API version
h264_qsv:   Error creating a MFX session
h264_amf:   DLL amfrt64.dll failed to open
```

So on *this* machine the change is currently a no-op — the 8656 ms above is what
you get until a working GPU driver is installed. Fixing that driver is likely
the single biggest practical speedup available for 4K playback today.

Set `LFLIX_FORCE_SOFTWARE_ENCODER=1` to skip the probe.

### 4. Player buffering tuned for LAN — *implemented in this release*

hls.js was constructed with `{ enableWorker: true }` and nothing else, leaving
every buffer default at values chosen for public CDNs where bandwidth costs
money. On a LAN the scarce resource is *encoder throughput*, not bandwidth, so
buffering much further ahead is strictly better: it gives ffmpeg a runway and
absorbs a slow segment without stalling.

Now buffers ~2 minutes ahead (capped by size so 4K cannot balloon memory on a
TV), keeps 60 s behind for instant short seeks, and retries slow segments
patiently rather than failing fast — a slow segment means ffmpeg is still
working, not that the network died.

### 5. Prefetch the next episode

Netflix begins buffering the next episode before the current one ends, and
prefetches optimistically while you browse. LFLIX already computes "Up Next"
(`/api/episodes/next`), so the data is there; nothing warms it.

Because segments here are produced on demand, the equivalent win is bigger than
Netflix's: transcoding the first few segments of the next episode during the
credits turns a multi-second wait into an instant start. It also needs the
throttling discipline Netflix describes — cancel the prefetch the moment the
user does something else, or it competes with the stream actually playing.

### 6. Segment duration — already correct, leave it alone

Apple's HLS authoring spec recommends **6-second segments** with keyframes every
2 seconds. `SEGMENT_DURATION = 6` already matches. Worth recording as validated
so nobody "optimises" it later.

---

## What deliberately does *not* transfer

Worth stating plainly, because these are the most famous techniques and copying
them here would be wasted effort:

- **Per-title / per-shot encoding and convex-hull bitrate ladders.** Netflix's
  dynamic optimizer cuts titles into shots and searches for the optimal
  bitrate/resolution per shot, saving 10–20% bandwidth. That economics only
  makes sense when paying CDN egress for millions of streams. LFLIX serves a
  handful of viewers over gigabit LAN, where bandwidth is effectively free — and
  the analysis itself costs far more CPU than it saves.
- **Multi-rendition ABR ladders.** Encoding 5+ renditions of every title is how
  you serve unknown, varying networks. On a LAN the bottleneck is the encoder,
  so producing several renditions makes the actual problem worse. A single
  well-chosen rendition is correct here.
- **Open Connect / edge caching.** Netflix ships appliances into ISPs to shorten
  the path to the viewer. The path here is already one hop.
- **DRM (Widevine / FairPlay / PlayReady).** Netflix's download system exists to
  enforce licensing — expiry windows, device limits, a 1080p cap on offline
  playback. LFLIX serves files its user already owns; DRM would add cost and
  remove capability.

The transferable ideas are the *cheap* ones: skip work you do not need to do
(remux), offload the work you do need (GPU), buffer for the bottleneck you
actually have (encoder, not bandwidth), and start work before it is asked for
(prefetch).

---

## Sources

- [Per-Title Encode Optimization — Netflix TechBlog](https://netflixtechblog.com/per-title-encode-optimization-7e99442b62a2)
- [Dynamic Optimizer: a perceptual video encoding optimization framework — Netflix TechBlog](https://netflixtechblog.com/dynamic-optimizer-a-perceptual-video-encoding-optimization-framework-e19f1e3a277f)
- [HLS authoring specification for Apple devices](https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices)
- [Apple makes sweeping changes to HLS encoding recommendations](https://streaminglearningcenter.com/articles/apple-makes-sweeping-changes-to-hls-encoding-recommendations.html)
- [Jellyfin — Transcoding](https://jellyfin.org/docs/general/post-install/transcoding/)
- [Jellyfin — Hardware acceleration](https://jellyfin.org/docs/general/post-install/transcoding/hardware-acceleration/)
- [Plex — Using hardware-accelerated streaming](https://support.plex.tv/articles/115002178853-using-hardware-accelerated-streaming/)
- [hls.js API documentation](https://github.com/video-dev/hls.js/blob/master/docs/API.md)
- [How Netflix uses prefetching to deliver seamless streaming](https://medium.com/@nvineet02/how-netflix-uses-prefetching-to-deliver-seamless-streaming-behind-the-scenes-of-buffer-free-f8bb85b52e78)
- [Netflix DRM: how and why of encrypted video security](https://www.vdocipher.com/blog/2022/05/netflix-drm/)
