import os
import sys
import math
import tempfile
import subprocess
from unittest import result
import requests
import psycopg2
import whisper
from typing import Optional

DB_CONFIG = {
    "dbname": os.getenv("PGDATABASE", "atomica"),
    "user": os.getenv("PGUSER", "postgres"),
    "password": os.getenv("PGPASSWORD", ""),
    "host": os.getenv("PGHOST", "localhost"),
    "port": os.getenv("PGPORT", "5432"),
}

CHUNK_DURATION_MS = 15 * 1000

def download_to_temp(url: str, suffix: str = ".mp4") -> str:
    print(" Descargando el archivo del servidor...", flush=True)
    with requests.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        fd, tmp_path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(fd, "wb") as f:
            for chunk in r.iter_content(1024 * 1024):
                if chunk:
                    f.write(chunk)
    print(f" Archivo guardado temporalmente en: {tmp_path}", flush=True)
    return tmp_path

def convert_to_wav(input_path: str) -> str:
    base, _ = os.path.splitext(input_path)
    wav_path = base + ".wav"

    print(" Convirtiendo a WAV...", flush=True)

    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            input_path,
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            wav_path,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    if result.returncode != 0:
        print(
            "❌ FFmpeg falló al convertir el video", 
            flush=True
        )
        print(
            "FFMPEG STDERR:", 
            result.stderr, 
            flush=True
        )

        raise RuntimeError(
            f"FFmpeg falló con código {result.returncode}"
        )
    
    print(
        f" Archivo WAV listo: {wav_path}", 
        flush=True
    )
    
    return wav_path

def get_duration(file_path: str) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file_path],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return float(result.stdout.strip() or 0)

def main(video_id: str, video_url: str):
    print(f" Iniciando proceso de subtítulos para video_id={video_id}", flush=True)
    print(" Conectando a la base de datos...", flush=True)
    print(f"  -> {DB_CONFIG['dbname']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}", flush=True)

    conn = None
    cur = None
    video_path = None
    wav_path = None

    model_name = os.getenv("WHISPER_MODEL", "small")
    model_download_root = os.getenv(
        "WHISPER_DOWNLOAD_ROOT",
        "/opt/whisper-models"
    )

    try:
        print(
            f" Cargando modelo Whisper: {model_name} desde {model_download_root}",
            flush=True
        )

        model = whisper.load_model(
            model_name,
            download_root=model_download_root
        )

        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()

        # Evitar duplicados si lo llamas 2 veces
        cur.execute("SELECT 1 FROM video_subtitulos WHERE video_id = %s LIMIT 1", (video_id,))
        if cur.fetchone():
            print(" Ya existen subtítulos. Saliendo.", flush=True)
            return 0

        # Descargar
        ext = ".mp4"
        video_path = download_to_temp(video_url, suffix=ext)

        # Convertir a wav
        wav_path = convert_to_wav(video_path)

        # Duración
        print(" Obteniendo duración del audio...", flush=True)
        duration_sec = get_duration(wav_path)
        if duration_sec <= 0:
            print(" ❌ Duración del audio inválida", flush=True)
            return 1

        total_chunks = math.ceil((duration_sec * 1000) / CHUNK_DURATION_MS)
        print(f" Duración: {duration_sec:.2f} seg. Total fragmentos: {total_chunks}", flush=True)

        insert_sql = """
            INSERT INTO video_subtitulos (video_id, time_start, time_end, text)
            VALUES (%s, %s, %s, %s)
        """
        total_inserted = 0

        for i in range(total_chunks):
            start_sec = (i * CHUNK_DURATION_MS) / 1000.0
            duration = CHUNK_DURATION_MS / 1000.0
            base, _ = os.path.splitext(wav_path)
            chunk_path = f"{base}_chunk{i}.wav"

            print(f" Fragmento {i+1}/{total_chunks} (inicio: {start_sec:.1f}s)", flush=True)

            subprocess.run(
                ["ffmpeg", "-y", "-i", wav_path, "-ss", str(start_sec), "-t", str(duration), "-acodec", "copy", chunk_path],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

            print("  Transcribiendo...", flush=True)
            result = model.transcribe(chunk_path,fp16=False,task="transcribe",language="es",)

            for seg in result.get("segments", []):
                abs_start = float(seg["start"]) + start_sec
                abs_end = float(seg["end"]) + start_sec
                text = (seg.get("text") or "").strip()
                if text:
                    cur.execute(insert_sql, (video_id, abs_start, abs_end, text))
                    total_inserted += 1

            try:
                os.remove(chunk_path)
            except OSError:
                pass

        conn.commit()
        print(f" ✅ Proceso completado. Total subtítulos guardados: {total_inserted}", flush=True)
        return 0

    except Exception as e:
        print("❌ ERROR GENERAL:", e, flush=True)
        return 1

    finally:
        print(" Limpiando temporales...", flush=True)
        if cur:
            try: cur.close()
            except: pass
        if conn:
            try: conn.close()
            except: pass
        for p in (video_path, wav_path):
            if p and os.path.exists(p):
                try: os.remove(p)
                except: pass

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(" Uso: python procesar_subtitulos.py <video_id> <video_url>", flush=True)
        sys.exit(1)

    vid = sys.argv[1]
    url = sys.argv[2]
    sys.exit(main(vid, url))
