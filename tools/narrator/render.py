import argparse
import fcntl
import json
import math
import os
from pathlib import Path
import re
import subprocess
import time


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
SEED = 42


def clip_audio(clip_id):
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', clip_id):
        raise ValueError('clip-id must contain lowercase letters, digits and hyphens only')
    audio = REPO / 'web/audio' / f'{clip_id}.mp3'
    if not audio.is_file() or not audio.stat().st_size:
        raise ValueError(f'Missing or empty narration: {audio}')
    return audio


def duration(path):
    value = float(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', str(path),
    ], text=True).strip())
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f'Invalid media duration: {path}')
    return value


def encode_web(source, audio, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.part.mp4')
    poster = destination.with_suffix('.jpg')
    temporary_poster = destination.with_suffix('.part.jpg')
    try:
        subprocess.run([
            'ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(source), '-i', str(audio),
            '-map', '0:v:0', '-map', '1:a:0', '-vf', 'scale=480:600:flags=lanczos,setsar=1',
            '-r', '25', '-c:v', 'libx264', '-preset', 'medium', '-crf', '24',
            '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-ar', '44100',
            '-movflags', '+faststart', '-shortest', str(temporary),
        ], check=True)
        subprocess.run([
            'ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(temporary),
            '-frames:v', '1', '-q:v', '3', str(temporary_poster),
        ], check=True)
        actual, expected = duration(temporary), duration(audio)
        if abs(actual - expected) > 0.15:
            raise ValueError(f'Video/audio duration mismatch: {actual:.3f}s vs {expected:.3f}s')
        temporary_poster.replace(poster)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
        temporary_poster.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description='Render an approved AI docent on CPU')
    parser.add_argument('clip_id')
    parser.add_argument('--enhancer', choices=['gfpgan'])
    args = parser.parse_args()
    try:
        audio = clip_audio(args.clip_id)
    except ValueError as error:
        parser.error(str(error))
    seconds = duration(audio)
    if seconds > 60:
        parser.error('This full-clip CPU pipeline supports clips up to 60s on a 31GB host')
    home = Path(os.environ.get('NARRATOR_HOME', Path.home() / 'narrator_work/runtime')).expanduser().resolve()
    work = home / 'renders' / args.clip_id
    work.mkdir(parents=True, exist_ok=True)
    with (home / 'render.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        start = time.monotonic()
        result_dir = work / time.strftime('%Y%m%d-%H%M%S')
        wav = work / 'audio.wav'
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(audio),
                        '-ac', '1', '-ar', '16000', str(wav)], check=True)
        env = os.environ.copy()
        env.update(OMP_NUM_THREADS='8', MKL_NUM_THREADS='8', PYTHONUNBUFFERED='1')
        runner = (
            'import random,runpy,sys,numpy as np,torch;'
            f'random.seed({SEED});np.random.seed({SEED});torch.manual_seed({SEED});'
            "sys.argv=['inference.py']+sys.argv[1:];runpy.run_path('inference.py',run_name='__main__')"
        )
        command = [str(home / 'venv/bin/python'), '-c', runner, '--cpu',
                   '--source_image', str(HERE / 'portrait.png'), '--driven_audio', str(wav),
                   '--result_dir', str(result_dir), '--size', '256', '--batch_size', '2',
                   '--preprocess', 'full', '--still']
        if args.enhancer:
            command += ['--enhancer', args.enhancer]
        print(f'START {args.clip_id} audio_seconds={seconds:.3f} enhancer={args.enhancer}', flush=True)
        subprocess.run(command, cwd=home / 'SadTalker', env=env, check=True)
        outputs = list(result_dir.glob('*.mp4'))
        if len(outputs) != 1:
            raise RuntimeError(f'Expected one SadTalker output in {result_dir}, found {len(outputs)}')
        destination = REPO / 'web/video/narrator' / f'{args.clip_id}.mp4'
        encode_web(outputs[0], audio, destination)
        elapsed = time.monotonic() - start
        metrics = {'clip': args.clip_id, 'audio_seconds': seconds, 'wall_seconds': round(elapsed, 2),
                   'seconds_per_output_second': round(elapsed / seconds, 2),
                   'bytes': destination.stat().st_size, 'enhancer': args.enhancer, 'seed': SEED,
                   'output': str(destination)}
        (work / 'metrics.json').write_text(json.dumps(metrics, indent=2) + '\n')
        print('DONE ' + json.dumps(metrics), flush=True)


if __name__ == '__main__':
    main()
