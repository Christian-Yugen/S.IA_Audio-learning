"""Local Whisper bridge. No audio is uploaded to a remote recognition service."""
import argparse
import hmac
import json
import math
import os
import re
import secrets
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VIDEO_ID = re.compile(r'^[A-Za-z0-9_-]{11}$')
WINDOW = 30
MAX_BODY = 4096


def validate_request(body):
    video = body.get('videoId', '')
    start = body.get('start', 0)
    if not isinstance(video, str) or not VIDEO_ID.fullmatch(video):
        raise ValueError('videoId inválido')
    if isinstance(start, bool) or not isinstance(start, (int, float)) or not math.isfinite(start) or not 0 <= start <= 604800:
        raise ValueError('tempo inválido')
    return video, float(start)


class Engine:
    def __init__(self, model_name='base'):
        self.model_name = model_name
        self.model = None
        self.lock = threading.Lock()
        self.cache = {}

    def transcribe(self, video, start):
        key = (video, start)
        if not self.lock.acquire(blocking=False):
            raise RuntimeError('O Whisper está ocupado; tente novamente.')
        try:
            if key in self.cache:
                return self.cache[key]
            if self.model is None:
                import whisper
                self.model = whisper.load_model(self.model_name)
            # A fixed YouTube URL is constructed here; arbitrary URLs are never accepted.
            info = subprocess.run(
                [os.sys.executable, '-m', 'yt_dlp', '--no-playlist', '--no-warnings', '--compat-options', 'no-certifi', '-f', 'bestaudio/best', '-j',
                 'https://www.youtube.com/watch?v=' + video],
                check=True, capture_output=True, text=True, timeout=60)
            metadata = json.loads(info.stdout)
            if metadata.get('is_live'):
                raise ValueError('Esta versão atende vídeos gravados, não transmissões ao vivo.')
            duration = float(metadata.get('duration') or 0)
            if duration and start >= duration:
                return {'cues': [], 'language': '', 'start': start, 'end': duration, 'done': True}
            url = metadata.get('url')
            if not isinstance(url, str) or not url.startswith('https://'):
                raise ValueError('Não foi possível obter o áudio do vídeo.')
            with tempfile.TemporaryDirectory(prefix='sia-whisper-') as folder:
                audio = str(Path(folder) / 'window.wav')
                subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-ss', str(start), '-i', url,
                                '-t', str(WINDOW), '-vn', '-ac', '1', '-ar', '16000', audio],
                               check=True, capture_output=True, timeout=120)
                result = self.model.transcribe(audio, task='transcribe', fp16=False, condition_on_previous_text=False)
            end = min(start + WINDOW, duration) if duration else start + WINDOW
            cues = []
            for item in result.get('segments', []):
                a, b = start + float(item['start']), min(end, start + float(item['end']))
                text = str(item.get('text', '')).strip()
                if text and math.isfinite(a) and math.isfinite(b) and start <= a < b <= end and float(item.get('no_speech_prob', 0)) < 0.6:
                    cues.append({'text': text, 'startTime': a, 'endTime': b})
            payload = {'cues': cues, 'language': result.get('language', ''), 'start': start, 'end': end,
                       'done': bool(duration and end >= duration)}
            if len(self.cache) >= 24:
                self.cache.pop(next(iter(self.cache)))
            self.cache[key] = payload
            return payload
        finally:
            self.lock.release()


def handler_for(engine, token):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # Do not log tokens, media URLs or course text.

        def reply(self, status, data):
            data = json.dumps(data, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self):
            if self.headers.get('Host') != '127.0.0.1:' + str(self.server.server_port):
                return self.reply(403, {'error': 'Host inválido'})
            if not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token):
                return self.reply(401, {'error': 'Chave local inválida'})
            if self.path != '/transcribe':
                return self.reply(404, {'error': 'Rota inválida'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= MAX_BODY:
                    raise ValueError('Pedido inválido')
                video, start = validate_request(json.loads(self.rfile.read(size)))
                self.reply(200, engine.transcribe(video, start))
            except (ValueError, TypeError, AttributeError, json.JSONDecodeError):
                self.reply(400, {'error': 'Pedido inválido ou vídeo não suportado'})
            except Exception:
                self.reply(503, {'error': 'Não foi possível preparar o áudio. Confira Whisper, FFmpeg e acesso ao vídeo no computador.'})
    return Handler


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', default='base', choices=['tiny', 'base', 'small', 'medium', 'turbo'])
    args = parser.parse_args()
    token = secrets.token_urlsafe(32)
    print('S·IA Whisper local — chave desta sessão: ' + token, flush=True)
    print('Mantenha esta janela aberta. O modelo será baixado na primeira utilização.', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8765), handler_for(Engine(args.model), token)).serve_forever()
