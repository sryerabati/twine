from __future__ import annotations

import json
import re
import subprocess
import wave
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from app.core.config import Settings


class MediaInspectionError(RuntimeError):
    """Raised when ffmpeg/ffprobe media inspection fails."""


@dataclass
class VideoMetadata:
    duration_sec: float
    width: int
    height: int
    size_bytes: int
    fps: float


@dataclass
class MediaFeatures:
    audio_energy: list[float]
    motion_scores: list[float]
    transcript_density: list[float]
    scene_changes: list[bool]
    silence_overlap: list[bool]
    silence_ranges: list[tuple[float, float]]
    scene_change_count: int


class MediaService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def inspect_video(self, path: Path) -> VideoMetadata:
        cmd = [
            self.settings.ffprobe_bin,
            "-v",
            "error",
            "-show_entries",
            "format=duration,size",
            "-show_entries",
            "stream=width,height,r_frame_rate",
            "-of",
            "json",
            str(path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            raise MediaInspectionError(result.stderr.strip() or "ffprobe failed")
        payload = json.loads(result.stdout)
        streams = payload.get("streams", [])
        video_stream = next((stream for stream in streams if stream.get("width")), None)
        if not video_stream:
            raise MediaInspectionError("No video stream detected")
        fps_text = video_stream.get("r_frame_rate", "0/1")
        numerator, denominator = fps_text.split("/")
        fps = float(numerator) / float(denominator or 1)
        return VideoMetadata(
            duration_sec=float(payload["format"]["duration"]),
            width=int(video_stream["width"]),
            height=int(video_stream["height"]),
            size_bytes=int(payload["format"]["size"]),
            fps=fps,
        )

    def generate_thumbnail(self, source_path: Path, output_path: Path) -> None:
        cmd = [
            self.settings.ffmpeg_bin,
            "-y",
            "-i",
            str(source_path),
            "-vf",
            "thumbnail,scale=960:-1",
            "-frames:v",
            "1",
            str(output_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            raise MediaInspectionError(result.stderr.strip() or "ffmpeg thumbnail failed")

    def trim_deadspace(
        self,
        source_path: Path,
        output_path: Path,
        cuts: list[tuple[float, float]],
        total_duration_sec: float,
    ) -> float:
        """Remove the given cut ranges from the source MP4.

        Returns the new duration in seconds. If no cuts apply, the source is copied.
        All ffmpeg invocations use argument lists, never shell strings, so user-controlled
        values cannot inject shell commands. Numeric inputs are coerced to float before
        reaching ffmpeg.
        """
        if total_duration_sec <= 0:
            raise MediaInspectionError("Source duration must be positive.")

        keep_ranges = self._invert_cuts(cuts, total_duration_sec)
        if not keep_ranges:
            raise MediaInspectionError(
                "The requested cuts would remove the entire clip. Nothing to export."
            )

        output_path.parent.mkdir(parents=True, exist_ok=True)

        # If nothing to cut, still produce a clean output by copying streams.
        if len(keep_ranges) == 1 and abs(keep_ranges[0][0]) < 1e-3 and abs(keep_ranges[0][1] - total_duration_sec) < 1e-3:
            cmd = [
                self.settings.ffmpeg_bin,
                "-y",
                "-i",
                str(source_path),
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, check=False)
            if result.returncode != 0:
                raise MediaInspectionError(
                    result.stderr.strip() or "ffmpeg passthrough copy failed"
                )
            return float(total_duration_sec)

        # Build a filter_complex that trims each keep range and concats them.
        filter_parts: list[str] = []
        concat_labels: list[str] = []
        for index, (start, end) in enumerate(keep_ranges):
            start_f = float(start)
            end_f = float(end)
            # atrim uses PTS-relative timestamps; the setpts/asetpts reset PTS so concat works.
            filter_parts.append(
                f"[0:v]trim=start={start_f:.3f}:end={end_f:.3f},setpts=PTS-STARTPTS[v{index}]"
            )
            filter_parts.append(
                f"[0:a]atrim=start={start_f:.3f}:end={end_f:.3f},asetpts=PTS-STARTPTS[a{index}]"
            )
            concat_labels.append(f"[v{index}][a{index}]")

        concat_filter = (
            "".join(concat_labels)
            + f"concat=n={len(keep_ranges)}:v=1:a=1[outv][outa]"
        )
        filter_complex = ";".join(filter_parts + [concat_filter])

        cmd = [
            self.settings.ffmpeg_bin,
            "-y",
            "-i",
            str(source_path),
            "-filter_complex",
            filter_complex,
            "-map",
            "[outv]",
            "-map",
            "[outa]",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "22",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            # Don't leak full ffmpeg stderr to the API response; keep it in logs only.
            raise MediaInspectionError(
                "ffmpeg trim failed. Check backend logs for the full ffmpeg output."
            )

        new_duration = sum(end - start for start, end in keep_ranges)
        return float(new_duration)

    @staticmethod
    def _invert_cuts(
        cuts: list[tuple[float, float]],
        total_duration_sec: float,
    ) -> list[tuple[float, float]]:
        """Convert a list of cut ranges into keep ranges, clamped and merged.

        Guarantees:
        - every returned range is strictly inside [0, total_duration_sec]
        - returned ranges are non-overlapping and in ascending order
        - ranges shorter than 50ms are dropped to avoid ffmpeg artifacts
        """
        if total_duration_sec <= 0:
            return []

        # Clamp and sanitize cuts
        clamped: list[tuple[float, float]] = []
        for start, end in cuts:
            start_f = max(0.0, min(float(start), total_duration_sec))
            end_f = max(0.0, min(float(end), total_duration_sec))
            if end_f - start_f <= 0.05:
                continue
            clamped.append((start_f, end_f))

        if not clamped:
            return [(0.0, total_duration_sec)]

        # Merge overlapping cuts
        clamped.sort(key=lambda item: item[0])
        merged: list[tuple[float, float]] = [clamped[0]]
        for start, end in clamped[1:]:
            last_start, last_end = merged[-1]
            if start <= last_end:
                merged[-1] = (last_start, max(last_end, end))
            else:
                merged.append((start, end))

        # Invert: keep ranges = gaps between cuts + any leading/trailing portion
        keep: list[tuple[float, float]] = []
        cursor = 0.0
        for cut_start, cut_end in merged:
            if cut_start - cursor > 0.05:
                keep.append((cursor, cut_start))
            cursor = cut_end
        if total_duration_sec - cursor > 0.05:
            keep.append((cursor, total_duration_sec))
        return keep

    def analyze_media(
        self,
        source_path: Path,
        windows: list[tuple[float, float]],
        transcript_density: list[float],
    ) -> MediaFeatures:
        audio_energy, silence_ranges = self._audio_features(source_path, windows)
        motion_scores, scene_changes = self._motion_features(source_path, windows)
        silence_overlap = [
            any(self._overlaps(window, silence_range) for silence_range in silence_ranges)
            for window in windows
        ]
        return MediaFeatures(
            audio_energy=audio_energy,
            motion_scores=motion_scores,
            transcript_density=transcript_density,
            scene_changes=scene_changes,
            silence_overlap=silence_overlap,
            silence_ranges=silence_ranges,
            scene_change_count=sum(1 for changed in scene_changes if changed),
        )

    def _audio_features(
        self,
        source_path: Path,
        windows: list[tuple[float, float]],
    ) -> tuple[list[float], list[tuple[float, float]]]:
        wav_path = source_path.with_suffix(".analysis.wav")
        extract_cmd = [
            self.settings.ffmpeg_bin,
            "-y",
            "-i",
            str(source_path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-sample_fmt",
            "s16",
            str(wav_path),
        ]
        extract = subprocess.run(
            extract_cmd, capture_output=True, text=True, check=False
        )
        if extract.returncode != 0:
            raise MediaInspectionError(extract.stderr.strip() or "ffmpeg audio extraction failed")

        silence_cmd = [
            self.settings.ffmpeg_bin,
            "-i",
            str(source_path),
            "-af",
            "silencedetect=noise=-35dB:d=0.4",
            "-f",
            "null",
            "-",
        ]
        silence = subprocess.run(
            silence_cmd, capture_output=True, text=True, check=False
        )
        silence_ranges = self._parse_silence(silence.stderr)

        with wave.open(str(wav_path), "rb") as wav_file:
            frames = wav_file.readframes(wav_file.getnframes())
            sample_rate = wav_file.getframerate()
        samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32)
        if samples.size == 0:
            return [0.0 for _ in windows], silence_ranges
        samples /= 32768.0
        energy = []
        for start, end in windows:
            start_idx = max(int(start * sample_rate), 0)
            end_idx = min(int(end * sample_rate), samples.size)
            window_samples = samples[start_idx:end_idx]
            if window_samples.size == 0:
                energy.append(0.0)
                continue
            energy.append(float(np.sqrt(np.mean(np.square(window_samples)))))
        wav_path.unlink(missing_ok=True)
        return self._robust_normalize(energy), silence_ranges

    def _motion_features(
        self,
        source_path: Path,
        windows: list[tuple[float, float]],
    ) -> tuple[list[float], list[bool]]:
        capture = cv2.VideoCapture(str(source_path))
        frames: list[np.ndarray | None] = []
        for start, end in windows:
            midpoint = (start + end) / 2
            capture.set(cv2.CAP_PROP_POS_MSEC, midpoint * 1000)
            ok, frame = capture.read()
            if not ok:
                frames.append(None)
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            frames.append(gray)
        capture.release()

        diffs = [0.0]
        for previous, current in zip(frames, frames[1:]):
            if previous is None or current is None:
                diffs.append(0.0)
                continue
            resized_prev = cv2.resize(previous, (160, 90))
            resized_current = cv2.resize(current, (160, 90))
            diffs.append(float(np.mean(cv2.absdiff(resized_prev, resized_current)) / 255.0))
        normalized = self._robust_normalize(diffs)
        threshold = float(np.percentile(normalized, 80)) if normalized else 1.0
        return normalized, [value >= threshold and value > 0.35 for value in normalized]

    @staticmethod
    def _parse_silence(stderr: str) -> list[tuple[float, float]]:
        starts = [float(match) for match in re.findall(r"silence_start: ([0-9.]+)", stderr)]
        ends = [float(match) for match in re.findall(r"silence_end: ([0-9.]+)", stderr)]
        ranges = []
        for start, end in zip(starts, ends):
            ranges.append((start, end))
        return ranges

    @staticmethod
    def _overlaps(
        window: tuple[float, float],
        other: tuple[float, float],
    ) -> bool:
        return window[0] < other[1] and other[0] < window[1]

    @staticmethod
    def _robust_normalize(values: list[float]) -> list[float]:
        if not values:
            return []
        array = np.asarray(values, dtype=np.float32)
        low = float(np.percentile(array, 5))
        high = float(np.percentile(array, 95))
        if np.isclose(high, low):
            return [0.0 for _ in values]
        normalized = np.clip((array - low) / (high - low), 0.0, 1.0)
        return normalized.astype(float).tolist()
