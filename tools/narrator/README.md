# Approved AI museum docent

`portrait.png` is the owner-approved fictional narrator (`cand_06`, formerly
`best.png`), 768×960. No reference photograph or real person's name was used.
Keep the site's synthetic-media disclosure when integrating these outputs.

## CPU setup (Ubuntu, no CUDA or HF token needed)

```sh
tools/narrator/setup.sh
tools/narrator/render.sh intro --enhancer gfpgan
# Or omit the enhancer for a faster, softer face:
tools/narrator/render.sh outro
```

Provision about **31GB RAM**, 12GB available disk, and an internet connection.
State, downloaded models, the venv and raw renders live outside git in
`~/narrator_work/runtime`; override with `NARRATOR_HOME=/absolute/path` for both
setup and rendering. Setup uses system Python **3.10** if available, otherwise
downloads pinned `uv` 0.9.11 and its managed Python 3.10; system Python is not
replaced. Missing git/curl/ffmpeg and OpenCV system libraries (libGL/GLib) are installed through apt only when already
root or passwordless sudo is available; otherwise setup prints the prerequisite
command and exits without prompting for a password. Ubuntu x86_64 is the tested
target; the bootstrap also recognizes aarch64, whose CPU wheels are unverified.

Setup pins SadTalker to `cd4c0465ae0b54a6f85af57f5c65fec9fe23e7f8`,
PyTorch 2.5.1 / torchvision 0.20.1 CPU wheels, and direct inference dependencies.
It downloads the official 256px v0.0.2-rc model, full-frame mapping checkpoint,
GFPGAN v1.4 and face detector/alignment/parser weights, then verifies SHA-256s.
BasicSR 1.4.2's obsolete `functional_tensor` import is updated **inside the venv**
to `torchvision.transforms.functional`; no upstream source files are patched.
Only official, trusted checkpoints are loaded (PyTorch 2.5 uses pickle loading
for the upstream `.pth` files). Setup is repeatable; dependency installs are
cached using a setup/requirements fingerprint.

## Browser regression check

The player uses the MP4's audio and the existing SRT clock; missing/invalid MP4s
use MP3 plus the idle portrait. Browsers may log an expected HTTP 404 for a clip
that has not arrived; this is handled, not an uncaught application error.
`tools/build_offline.py` precaches MP4s when the total remains below 30MiB,
otherwise caching complete clips on first play. The worker serves MP3/MP4 byte
ranges offline. Regenerate it after asset changes as in `docs/accessibility.md`.

The integration player is at `web/narrator/index.html?clip=<point-id>`. Its
native-dialog adapter restores portal/point focus and leaves the original SVG
audio guide intact. With Python Playwright / Chromium and FFmpeg installed:

```sh
python3 tools/check_narrator.py
python3 tools/check_integration.py
```

The tests start temporary local servers without changing the persistent preview.
They cover both viewports, real video/AAC playback after a gesture, captions,
controls, completion/stamps, invalid video, rejected play and missing captions.
The integration check includes Pages-subpath offline video and byte ranges.
Screenshots go to `~/contest/shots/integrate-*`. The legacy Node command
`node tools/narrator/test_player.cjs` delegates to the Python player check.

## Rendering and progress

`render.sh <clip-id> [--enhancer gfpgan]` reads `web/audio/<clip-id>.mp3`,
decodes mono 16kHz WAV, and invokes SadTalker with seed **42**, CPU, eight
threads, `--size 256 --batch_size 2 --preprocess full --still`. The original
portrait is composited behind the animated face. GFPGAN restores/upscales the
face; this is **not** native high-resolution face animation.

Outputs are atomically published after encoding and duration checks:

- `web/video/narrator/<clip-id>.mp4`: 480×600, 25fps, H.264 CRF 24,
  yuv420p, AAC 64k, square pixels, `+faststart`.
- `web/video/narrator/<clip-id>.jpg`: first encoded frame, FFmpeg JPEG q=3
  (approximately quality 80–90; the scales are not directly equivalent).

The web encode remuxes/re-encodes the **original** narration, rather than the
intermediate WAV, and checks duration within 150ms. Inference/encode failures
do not publish a partial MP4. Raw output, WAV and `metrics.json` (wall time,
seconds per output second, output size) stay under `$NARRATOR_HOME/renders/<id>`.
Rendering is serialized by a lock to avoid exhausting RAM.

The site's ten clips are 22–59 seconds. They are processed **whole**, with a
60-second input limit, avoiding artificial chunk joins, repeated blinks or pose
resets. `--still` is not a guarantee that independently generated chunks match;
there is no naive split-and-concat fallback. On smaller-memory hosts or for
longer inputs, use a separately validated streaming/overlap pipeline instead.
Long full-clip peak memory and throughput should be monitored on the first run.

The approved portrait's earlier five-second CPU tests took 678.14s without
enhancement and 1400.69s with GFPGAN (about **136 / 280 wall seconds per output
second**). Those used the same inference settings but PyTorch 2.14.1, not this
reproducible 2.5.1 runtime. Shared CPU load varies substantially. At that speed,
intro may take **3.7 hours**, and all ten clips approximately **40 hours**.
These are extrapolations, not full-clip measurements.

A fresh venv/checkpoint setup on the current Ubuntu host was also smoke-tested
with the pinned 2.5.1 runtime: one second of real narration, full/still/GFPGAN,
**253.36s** inference wall time. Its web encode was verified as 480×600,
H.264/yuv420p, 25fps, AAC, one second, 45,969 bytes. This short test includes
startup overhead and is not a completed full narration clip.

Start the local sequential batch (intro, monument, outro). Other clips are
rendered separately; pass explicit clip IDs to `batch.sh` to override its list:

```sh
mkdir -p "$HOME/narrator_work"
nohup tools/narrator/batch.sh > "$HOME/narrator_work/batch.log" 2>&1 < /dev/null &
echo $! > "$HOME/narrator_work/batch.pid"
tail -f "$HOME/narrator_work/batch.log"
rg 'START|DONE' "$HOME/narrator_work/batch.log"
cat "$HOME/narrator_work/runtime/renders/intro/metrics.json"
```

The batch stops on the first failure rather than silently skipping missing
videos. Restarting re-renders clips; it does not assume existing files are valid
or were made with the same portrait/settings. Generated web videos/posters are
not included in the initial tooling commit; stage them explicitly only when
approved for publication (`*.mp4` is ignored by the repository).

## Portrait provenance / reproduction

Model: [`SG161222/RealVisXL_V4.0_Lightning`](https://huggingface.co/SG161222/RealVisXL_V4.0_Lightning),
revision `39b41eff57c9d10c62119590901d6771863b426d`.
Native **768×960**, float32 CPU; DPM++ SDE Karras scheduler
(`DPMSolverMultistepScheduler`, `algorithm_type=sde-dpmsolver++`,
`use_karras_sigmas=True`), **6 steps**, **CFG 1.5**, seed **67086**.
These values and the following prompts are copied from the candidate run's
`generation.json`; generating the portrait is not required for setup/rendering.

Positive prompt:

> RAW photograph, fictional Chinese woman age 31, dignified calm expression, mouth closed, hair neatly tied back, frontal head and shoulders, eyes to camera, plain dark navy charcoal formal stand collar museum jacket, warm upper left key light, near black reddish brown background, natural skin texture, 85mm lens, cinematic

Negative prompt:

> painting, illustration, cartoon, anime, CGI, plastic skin, elderly, child, smile, teeth, open mouth, heavy makeup, military insignia, badges, medals, epaulettes, text, logo, jewelry, profile, turned head, cropped head, blurry, deformed eyes, asymmetric face

## Models and licenses

- **Portrait model / SDXL derivative:** CreativeML **Open RAIL++-M**, per the
  RealVisXL model card (`openrail++`). Commercial use is permitted subject to
  use restrictions; this is not unrestricted MIT/Apache. Retain applicable
  model notices if redistributing weights. [Base license](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md).
- **SadTalker:** [Apache-2.0](https://github.com/OpenTalker/SadTalker/blob/cd4c0465ae0b54a6f85af57f5c65fec9fe23e7f8/LICENSE),
  with third-party components retaining their own licenses. Upstream removed
  its former blanket noncommercial restriction; that does not relicense every
  dependency or training asset.
- **GFPGAN v1.4:** [Apache-2.0 with third-party exceptions](https://github.com/TencentARC/GFPGAN/blob/master/LICENSE).
- **facexlib / BasicSR:** Apache-2.0; downloaded detector,
  alignment and parser assets retain their upstream terms. Do not interpret
  this summary as a complete commercial-clearance audit of pretrained assets.
- Narration comes from the site's existing Edge TTS `zh-CN-XiaoxiaoNeural`
  recordings; this tool does not change their source or terms.

## Checks

```sh
bash -n tools/narrator/{setup,render,batch}.sh
python3 -m unittest discover -s tools/narrator -p 'test_*.py' -v
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,pix_fmt,r_frame_rate -of json web/video/narrator/intro.mp4
```

The unit tests use FFmpeg-generated short fixtures, not model inference. Review
an actual rendered video before production; still contact sheets alone do not
verify temporal artifacts or Chinese phoneme alignment.
