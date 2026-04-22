from __future__ import annotations

from datetime import UTC, datetime
import json
import re
import subprocess
import tempfile
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
    recorded_at: datetime | None = None
    file_modified_at: datetime | None = None


@dataclass
class MediaFeatures:
    audio_energy: list[float]
    motion_scores: list[float]
    transcript_density: list[float]
    scene_changes: list[bool]
    silence_overlap: list[bool]
    silence_ranges: list[tuple[float, float]]
    scene_change_count: int


@dataclass
class SequenceClipPlan:
    clip_id: str
    source_path: Path
    cuts: list[tuple[float, float]]
    total_duration_sec: float


@dataclass
class SequenceClipTiming:
    clip_id: str
    trimmed_duration_sec: float
    removed_seconds: float
    output_start_sec: float
    output_end_sec: float


@dataclass
class SequenceRenderValidation:
    video_duration_sec: float
    audio_duration_sec: float
    container_duration_sec: float


@dataclass
class SequenceSourceMetadata:
    width: int
    height: int
    fps: float
    container_duration_sec: float
    video_start_sec: float
    video_duration_sec: float
    audio_start_sec: float
    audio_duration_sec: float
    audio_sample_rate: int
    audio_channel_layout: str

    @property
    def video_end_sec(self) -> float:
        return self.video_start_sec + self.video_duration_sec

    @property
    def audio_end_sec(self) -> float:
        return self.audio_start_sec + self.audio_duration_sec


class MediaService:
    MIN_CUT_DURATION_SEC = 0.1
    MAX_SEQUENCE_DURATION_DRIFT_SEC = 0.1
    STREAM_TIMING_EPSILON_SEC = 1e-3

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def inspect_video(self, path: Path) -> VideoMetadata:
        cmd = [
            self.settings.ffprobe_bin,
            "-v",
            "error",
            "-show_entries",
            (
                "format=duration,size"
                ":format_tags=creation_time,com.apple.quicktime.creationdate,date"
                ":stream=width,height,r_frame_rate"
                ":stream_tags=creation_time,com.apple.quicktime.creationdate,date"
            ),
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
        file_modified_at = self._timestamp_to_utc_datetime(path.stat().st_mtime)
        return VideoMetadata(
            duration_sec=float(payload["format"]["duration"]),
            width=int(video_stream["width"]),
            height=int(video_stream["height"]),
            size_bytes=int(payload["format"]["size"]),
            fps=fps,
            recorded_at=self._extract_recorded_at(payload),
            file_modified_at=file_modified_at,
        )

    @classmethod
    def _extract_recorded_at(cls, payload: dict[str, object]) -> datetime | None:
        format_payload = payload.get("format")
        if isinstance(format_payload, dict):
            tags = format_payload.get("tags")
            parsed = cls._parse_tags_datetime(tags)
            if parsed is not None:
                return parsed

        streams = payload.get("streams")
        if not isinstance(streams, list):
            return None

        for stream in streams:
            if not isinstance(stream, dict):
                continue
            parsed = cls._parse_tags_datetime(stream.get("tags"))
            if parsed is not None:
                return parsed
        return None

    @classmethod
    def _parse_tags_datetime(cls, raw_tags: object) -> datetime | None:
        if not isinstance(raw_tags, dict):
            return None
        for key in ("creation_time", "com.apple.quicktime.creationdate", "date"):
            parsed = cls._parse_media_datetime(raw_tags.get(key))
            if parsed is not None:
                return parsed
        return None

    @staticmethod
    def _parse_media_datetime(value: object) -> datetime | None:
        if value is None:
            return None

        normalized = str(value).strip()
        if not normalized:
            return None

        normalized = normalized.replace("Z", "+00:00").replace(" UTC", "+00:00")
        normalized = re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", normalized)
        candidates = [normalized]
        if " " in normalized and "T" not in normalized:
            candidates.append(normalized.replace(" ", "T", 1))

        for candidate in candidates:
            try:
                parsed = datetime.fromisoformat(candidate)
            except ValueError:
                continue
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=UTC)
            return parsed.astimezone(UTC)
        return None

    @staticmethod
    def _timestamp_to_utc_datetime(timestamp: float | None) -> datetime | None:
        if timestamp is None:
            return None
        return datetime.fromtimestamp(timestamp, tz=UTC)

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

    def assemble_sequence(
        self,
        *,
        output_path: Path,
        clips: list[SequenceClipPlan],
    ) -> tuple[float, list[SequenceClipTiming]]:
        if not clips:
            raise MediaInspectionError("At least one clip is required to assemble a draft.")

        output_path.parent.mkdir(parents=True, exist_ok=True)
        timings: list[SequenceClipTiming] = []
        cursor = 0.0
        inspected = [
            self._inspect_sequence_source_metadata(clip.source_path) for clip in clips
        ]
        expected_duration = 0.0

        for clip in clips:
            keep_ranges = self._invert_cuts(clip.cuts, clip.total_duration_sec)
            if not keep_ranges:
                raise MediaInspectionError(
                    f"Clip {clip.clip_id} would be fully removed by the selected cuts."
                )
            trimmed_duration_raw = sum(end - start for start, end in keep_ranges)
            removed_seconds = round(max(0.0, clip.total_duration_sec - trimmed_duration_raw), 2)
            timings.append(
                SequenceClipTiming(
                    clip_id=clip.clip_id,
                    trimmed_duration_sec=round(trimmed_duration_raw, 2),
                    removed_seconds=removed_seconds,
                    output_start_sec=round(cursor, 2),
                    output_end_sec=round(cursor + trimmed_duration_raw, 2),
                )
            )
            cursor += trimmed_duration_raw
            expected_duration += trimmed_duration_raw

        target_metadata = inspected[0]
        target_audio_sample_rate = target_metadata.audio_sample_rate
        target_audio_layout = target_metadata.audio_channel_layout
        normalize_video = any(
            metadata.width != target_metadata.width
            or metadata.height != target_metadata.height
            or not self._fps_matches(metadata.fps, target_metadata.fps)
            for metadata in inspected[1:]
        )

        filter_complex = self._build_sequence_filter_graph(
            clips=clips,
            source_metadata=inspected,
            target_width=target_metadata.width,
            target_height=target_metadata.height,
            target_fps=target_metadata.fps,
            target_audio_sample_rate=target_audio_sample_rate,
            target_audio_layout=target_audio_layout,
            normalize_video=normalize_video,
        )
        cmd = [self.settings.ffmpeg_bin, "-y"]
        for clip in clips:
            cmd.extend(["-i", str(clip.source_path)])
        cmd.extend(
            [
                "-filter_complex",
                filter_complex,
                "-map",
                "[outv]",
                "-map",
                "[outa]",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "18",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
        )
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            raise MediaInspectionError(
                "ffmpeg rough cut render failed. Check backend logs for the full ffmpeg output."
            )

        self._validate_sequence_output(output_path=output_path, expected_duration_sec=expected_duration)
        return round(expected_duration, 2), timings

    def _build_sequence_filter_graph(
        self,
        *,
        clips: list[SequenceClipPlan],
        source_metadata: list[SequenceSourceMetadata],
        target_width: int,
        target_height: int,
        target_fps: float,
        target_audio_sample_rate: int,
        target_audio_layout: str,
        normalize_video: bool,
    ) -> str:
        filter_parts: list[str] = []
        concat_labels: list[str] = []
        target_fps_text = self._format_fps(target_fps)

        for clip_index, (clip, metadata) in enumerate(zip(clips, source_metadata, strict=True)):
            keep_ranges = self._invert_cuts(clip.cuts, clip.total_duration_sec)
            video_labels: list[str] = []
            audio_labels: list[str] = []
            video_source = f"[{clip_index}:v]"
            if normalize_video:
                video_source = f"[vsrc{clip_index}]"
                filter_parts.append(
                    (
                        f"[{clip_index}:v]"
                        f"scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,"
                        f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2:color=black,"
                        f"fps={target_fps_text},format=yuv420p,setsar=1"
                        f"{video_source}"
                    )
                )

            for segment_index, (start, end) in enumerate(keep_ranges):
                if len(keep_ranges) == 1:
                    video_label = f"[vc{clip_index}]"
                    audio_label = f"[ac{clip_index}]"
                else:
                    video_label = f"[v{clip_index}_{segment_index}]"
                    audio_label = f"[a{clip_index}_{segment_index}]"
                segment_duration_sec = end - start
                filter_parts.append(
                    self._build_sequence_video_segment_filter(
                        source_label=video_source,
                        output_label=video_label,
                        segment_start_sec=start,
                        segment_end_sec=end,
                        segment_duration_sec=segment_duration_sec,
                        stream_start_sec=metadata.video_start_sec,
                        stream_end_sec=metadata.video_end_sec,
                        fallback_width=target_width,
                        fallback_height=target_height,
                        fallback_fps=target_fps_text,
                    )
                )
                filter_parts.append(
                    self._build_sequence_audio_segment_filter(
                        source_label=f"[{clip_index}:a]",
                        output_label=audio_label,
                        segment_start_sec=start,
                        segment_end_sec=end,
                        segment_duration_sec=segment_duration_sec,
                        stream_start_sec=metadata.audio_start_sec,
                        stream_end_sec=metadata.audio_end_sec,
                        source_sample_rate=metadata.audio_sample_rate,
                        target_sample_rate=target_audio_sample_rate,
                        target_channel_layout=target_audio_layout,
                    )
                )
                video_labels.append(video_label)
                audio_labels.append(audio_label)

            if len(keep_ranges) == 1:
                final_video_label = video_labels[0]
                final_audio_label = audio_labels[0]
            else:
                final_video_label = f"[vc{clip_index}]"
                final_audio_label = f"[ac{clip_index}]"
                filter_parts.append(
                    (
                        "".join(
                            f"{video_label}{audio_label}"
                            for video_label, audio_label in zip(video_labels, audio_labels, strict=True)
                        )
                        + f"concat=n={len(keep_ranges)}:v=1:a=1{final_video_label}{final_audio_label}"
                    )
                )

            concat_labels.append(final_video_label)
            concat_labels.append(final_audio_label)

        filter_parts.append(
            "".join(concat_labels) + f"concat=n={len(clips)}:v=1:a=1[outv][outa]"
        )
        return ";".join(filter_parts)

    def _build_sequence_video_segment_filter(
        self,
        *,
        source_label: str,
        output_label: str,
        segment_start_sec: float,
        segment_end_sec: float,
        segment_duration_sec: float,
        stream_start_sec: float,
        stream_end_sec: float,
        fallback_width: int,
        fallback_height: int,
        fallback_fps: str,
    ) -> str:
        overlap_start_sec = max(segment_start_sec, stream_start_sec)
        overlap_end_sec = min(segment_end_sec, stream_end_sec)
        overlap_duration_sec = max(0.0, overlap_end_sec - overlap_start_sec)
        pad_start_sec = max(0.0, stream_start_sec - segment_start_sec)
        pad_end_sec = max(0.0, segment_end_sec - stream_end_sec)

        if overlap_duration_sec < self.STREAM_TIMING_EPSILON_SEC:
            return (
                f"color=c=black:s={fallback_width}x{fallback_height}:r={fallback_fps}:d={segment_duration_sec:.6f},"
                f"format=yuv420p,setsar=1{output_label}"
            )

        chain = (
            f"{source_label}"
            f"trim=start={overlap_start_sec:.6f}:end={overlap_end_sec:.6f},"
            "setpts=PTS-STARTPTS"
        )
        if (
            pad_start_sec >= self.STREAM_TIMING_EPSILON_SEC
            or pad_end_sec >= self.STREAM_TIMING_EPSILON_SEC
        ):
            chain += (
                f",tpad=start_duration={pad_start_sec:.6f}:start_mode=clone:"
                f"stop_duration={pad_end_sec:.6f}:stop_mode=clone"
            )
        chain += (
            f",trim=duration={segment_duration_sec:.6f},setpts=PTS-STARTPTS{output_label}"
        )
        return chain

    def _build_sequence_audio_segment_filter(
        self,
        *,
        source_label: str,
        output_label: str,
        segment_start_sec: float,
        segment_end_sec: float,
        segment_duration_sec: float,
        stream_start_sec: float,
        stream_end_sec: float,
        source_sample_rate: int,
        target_sample_rate: int,
        target_channel_layout: str,
    ) -> str:
        overlap_start_sec = max(segment_start_sec, stream_start_sec)
        overlap_end_sec = min(segment_end_sec, stream_end_sec)
        overlap_duration_sec = max(0.0, overlap_end_sec - overlap_start_sec)
        pad_start_sec = max(0.0, stream_start_sec - segment_start_sec)
        pad_end_sec = max(0.0, segment_end_sec - stream_end_sec)
        target_audio_format = (
            f"aresample={target_sample_rate},aformat=sample_rates={target_sample_rate}:"
            f"channel_layouts={target_channel_layout}"
        )

        if overlap_duration_sec < self.STREAM_TIMING_EPSILON_SEC:
            return (
                f"anullsrc=channel_layout={target_channel_layout}:sample_rate={target_sample_rate}:"
                f"d={segment_duration_sec:.6f},{target_audio_format},"
                f"atrim=end={segment_duration_sec:.6f},asetpts=PTS-STARTPTS{output_label}"
            )

        chain = (
            f"{source_label}"
            f"atrim=start={overlap_start_sec:.6f}:end={overlap_end_sec:.6f},"
            "asetpts=PTS-STARTPTS"
        )
        if pad_start_sec >= self.STREAM_TIMING_EPSILON_SEC:
            chain += (
                f",adelay={self._format_audio_delay(pad_start_sec, source_sample_rate)}:all=1"
            )
        if (
            pad_start_sec >= self.STREAM_TIMING_EPSILON_SEC
            or pad_end_sec >= self.STREAM_TIMING_EPSILON_SEC
        ):
            chain += f",apad=whole_dur={segment_duration_sec:.6f}"
        chain += (
            f",{target_audio_format},atrim=end={segment_duration_sec:.6f},"
            f"asetpts=PTS-STARTPTS{output_label}"
        )
        return chain

    def _validate_sequence_output(
        self,
        *,
        output_path: Path,
        expected_duration_sec: float,
    ) -> SequenceRenderValidation:
        cmd = [
            self.settings.ffprobe_bin,
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type,duration:format=duration",
            "-of",
            "json",
            str(output_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            raise MediaInspectionError(result.stderr.strip() or "ffprobe validation failed")
        payload = json.loads(result.stdout)
        streams = payload.get("streams", [])
        if not isinstance(streams, list):
            raise MediaInspectionError("Rendered rough cut validation returned malformed stream data.")

        video_duration = self._find_stream_duration(streams, "video")
        audio_duration = self._find_stream_duration(streams, "audio")
        format_payload = payload.get("format", {})
        if not isinstance(format_payload, dict) or "duration" not in format_payload:
            raise MediaInspectionError("Rendered rough cut validation returned no container duration.")
        container_duration = float(format_payload["duration"])

        if abs(video_duration - audio_duration) > self.MAX_SEQUENCE_DURATION_DRIFT_SEC:
            raise MediaInspectionError(
                (
                    "Rendered rough cut failed validation: video and audio drifted after export "
                    f"({video_duration:.3f}s video vs {audio_duration:.3f}s audio)."
                )
            )
        if abs(video_duration - expected_duration_sec) > self.MAX_SEQUENCE_DURATION_DRIFT_SEC:
            raise MediaInspectionError(
                (
                    "Rendered rough cut failed validation: video duration does not match the expected timeline "
                    f"({video_duration:.3f}s vs {expected_duration_sec:.3f}s)."
                )
            )
        if abs(audio_duration - expected_duration_sec) > self.MAX_SEQUENCE_DURATION_DRIFT_SEC:
            raise MediaInspectionError(
                (
                    "Rendered rough cut failed validation: audio duration does not match the expected timeline "
                    f"({audio_duration:.3f}s vs {expected_duration_sec:.3f}s)."
                )
            )
        if abs(container_duration - expected_duration_sec) > self.MAX_SEQUENCE_DURATION_DRIFT_SEC:
            raise MediaInspectionError(
                (
                    "Rendered rough cut failed validation: container duration does not match the expected timeline "
                    f"({container_duration:.3f}s vs {expected_duration_sec:.3f}s)."
                )
            )

        return SequenceRenderValidation(
            video_duration_sec=video_duration,
            audio_duration_sec=audio_duration,
            container_duration_sec=container_duration,
        )

    @staticmethod
    def _find_stream_duration(streams: list[object], codec_type: str) -> float:
        for stream in streams:
            if not isinstance(stream, dict):
                continue
            if stream.get("codec_type") != codec_type:
                continue
            if "duration" not in stream:
                break
            return float(stream["duration"])
        raise MediaInspectionError(f"Rendered rough cut is missing a {codec_type} stream duration.")

    @staticmethod
    def _fps_matches(left: float, right: float) -> bool:
        return abs(left - right) <= 0.01

    @staticmethod
    def _format_fps(value: float) -> str:
        return f"{value:.6f}".rstrip("0").rstrip(".")

    @staticmethod
    def _format_audio_delay(delay_sec: float, sample_rate: int) -> str:
        samples = max(int(round(delay_sec * sample_rate)), 0)
        return f"{samples}S"

    def _inspect_sequence_source_metadata(self, path: Path) -> SequenceSourceMetadata:
        cmd = [
            self.settings.ffprobe_bin,
            "-v",
            "error",
            "-show_entries",
            (
                "format=duration"
                ":stream=codec_type,width,height,r_frame_rate,start_time,duration,sample_rate,channels,channel_layout"
            ),
            "-of",
            "json",
            str(path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            raise MediaInspectionError(result.stderr.strip() or "ffprobe sequence inspection failed")
        payload = json.loads(result.stdout)
        streams = payload.get("streams", [])
        if not isinstance(streams, list):
            raise MediaInspectionError("Sequence source inspection returned malformed stream data.")

        video_stream = next(
            (
                stream
                for stream in streams
                if isinstance(stream, dict) and stream.get("codec_type") == "video"
            ),
            None,
        )
        if not isinstance(video_stream, dict):
            raise MediaInspectionError("Sequence clip is missing a video stream.")

        audio_stream = next(
            (
                stream
                for stream in streams
                if isinstance(stream, dict) and stream.get("codec_type") == "audio"
            ),
            None,
        )
        if not isinstance(audio_stream, dict):
            raise MediaInspectionError("Sequence clip is missing an audio stream.")

        fps_text = str(video_stream.get("r_frame_rate", "0/1"))
        numerator, denominator = fps_text.split("/")
        fps = float(numerator) / float(denominator or 1)
        format_payload = payload.get("format", {})
        if not isinstance(format_payload, dict) or "duration" not in format_payload:
            raise MediaInspectionError("Sequence clip is missing a container duration.")

        return SequenceSourceMetadata(
            width=int(video_stream["width"]),
            height=int(video_stream["height"]),
            fps=fps,
            container_duration_sec=float(format_payload["duration"]),
            video_start_sec=float(video_stream.get("start_time", 0.0)),
            video_duration_sec=float(video_stream.get("duration", 0.0)),
            audio_start_sec=float(audio_stream.get("start_time", 0.0)),
            audio_duration_sec=float(audio_stream.get("duration", 0.0)),
            audio_sample_rate=int(audio_stream.get("sample_rate", 44100)),
            audio_channel_layout=self._resolve_audio_channel_layout(audio_stream),
        )

    @staticmethod
    def _resolve_audio_channel_layout(stream: dict[str, object]) -> str:
        layout = stream.get("channel_layout")
        if isinstance(layout, str) and layout:
            return layout
        channels = int(stream.get("channels", 0) or 0)
        if channels == 1:
            return "mono"
        if channels == 2:
            return "stereo"
        return "stereo"

    @classmethod
    def _invert_cuts(
        cls,
        cuts: list[tuple[float, float]],
        total_duration_sec: float,
    ) -> list[tuple[float, float]]:
        """Convert a list of cut ranges into keep ranges, clamped and merged.

        Guarantees:
        - every returned range is strictly inside [0, total_duration_sec]
        - returned ranges are non-overlapping and in ascending order
        - ranges shorter than 100ms are dropped to avoid ffmpeg artifacts
        """
        if total_duration_sec <= 0:
            return []

        # Clamp and sanitize cuts
        clamped: list[tuple[float, float]] = []
        for start, end in cuts:
            start_f = max(0.0, min(float(start), total_duration_sec))
            end_f = max(0.0, min(float(end), total_duration_sec))
            if end_f - start_f < cls.MIN_CUT_DURATION_SEC:
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
            if cut_start - cursor >= cls.MIN_CUT_DURATION_SEC:
                keep.append((cursor, cut_start))
            cursor = cut_end
        if total_duration_sec - cursor >= cls.MIN_CUT_DURATION_SEC:
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
