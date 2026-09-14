"""图片元数据读取器 —— 读取 EXIF、尺寸等基础信息，无需 LLM"""

import os
from fractions import Fraction
from typing import Any, Optional

from PIL import Image

# piexif 可选依赖，用于增强 EXIF 解析
try:
    import piexif
    HAS_PIEXIF = True
except ImportError:
    HAS_PIEXIF = False

# 常见长宽比映射
_ASPECT_RATIOS = {
    (1, 1): "1:1",
    (5, 4): "5:4",
    (4, 3): "4:3",
    (3, 2): "3:2",
    (16, 10): "16:10",
    (16, 9): "16:9",
    (21, 9): "21:9",
}

# EXIF 标签参考
_EXIF_TAG_NAMES = {
    0x010F: "camera_make",       # Make
    0x0110: "camera_model",      # Model
    0x0112: "orientation",       # Orientation
    0x0132: "capture_time",      # DateTime
    0x9003: "capture_time_orig", # DateTimeOriginal
    0x920A: "focal_length",      # FocalLength
    0x829D: "aperture",          # FNumber
    0x8827: "iso",               # ISOSpeedRatings
    0x829A: "shutter_speed",     # ExposureTime
}

_GPS_TAG_NAMES = {
    0x0001: "gps_latitude_ref",
    0x0002: "gps_latitude",
    0x0003: "gps_longitude_ref",
    0x0004: "gps_longitude",
    0x0006: "gps_altitude",
}


def _gcd(a: int, b: int) -> int:
    """最大公约数"""
    while b:
        a, b = b, a % b
    return a


def _get_aspect_ratio(w: int, h: int) -> str:
    """计算长宽比"""
    if h == 0:
        return "unknown"
    g = _gcd(w, h)
    wr, hr = w // g, h // g
    key = (wr, hr)
    if key in _ASPECT_RATIOS:
        return _ASPECT_RATIOS[key]
    return f"{wr}:{hr}"


def _rational_to_float(v) -> Optional[float]:
    """解析 EXIF 有理数，兼容 IFDRational、Fraction、tuple"""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if hasattr(v, "numerator") and hasattr(v, "denominator"):
        if v.denominator == 0:
            return None
        return float(v.numerator) / float(v.denominator)
    if isinstance(v, (tuple, list)) and len(v) == 2:
        if v[1] == 0:
            return None
        return float(v[0]) / float(v[1])
    if isinstance(v, Fraction):
        return float(v)
    return None


class ImageMetaReader:
    """图片元数据读取器"""

    def read(self, image_path: str) -> dict:
        """
        读取单张图片的元数据。

        Returns:
            包含完整元数据的字典
        """
        file_name = os.path.basename(image_path)
        file_size_kb = round(os.path.getsize(image_path) / 1024, 2)

        info = {
            "file_name": file_name,
            "file_size_kb": file_size_kb,
            "format": "",
            "width": 0,
            "height": 0,
            "megapixels": 0.0,
            "aspect_ratio": "unknown",
            "color_mode": "",
            "dpi": [72, 72],
            "has_exif": False,
            "capture_time": None,
            "gps_latitude": None,
            "gps_longitude": None,
            "gps_altitude": None,
            "camera_make": None,
            "camera_model": None,
            "focal_length": None,
            "aperture": None,
            "iso": None,
            "shutter_speed": None,
            "orientation": None,
        }

        try:
            with Image.open(image_path) as img:
                info["format"] = img.format or ""
                info["width"], info["height"] = img.size
                if info["height"] > 0:
                    info["megapixels"] = round((info["width"] * info["height"]) / 1_000_000, 2)
                info["aspect_ratio"] = _get_aspect_ratio(info["width"], info["height"])
                info["color_mode"] = img.mode or ""

                # DPI
                dpi = img.info.get("dpi")
                if dpi and len(dpi) >= 2:
                    info["dpi"] = [int(round(dpi[0], 0)), int(round(dpi[1], 0))]

                # EXIF
                exif_data = self._get_exif_raw(img)
                if exif_data:
                    info["has_exif"] = True
                    self._parse_exif(exif_data, info)

        except Exception as e:
            info["_error"] = str(e)

        return info

    def _get_exif_raw(self, img: Image.Image) -> Optional[dict]:
        """获取原始 EXIF 数据"""
        # 优先使用 piexif
        if HAS_PIEXIF:
            try:
                exif_bytes = img.info.get("exif")
                if exif_bytes:
                    return piexif.load(exif_bytes)
            except Exception:
                pass

        # 降级使用 Pillow 内置方法
        try:
            exif = img.getexif()
            if exif:
                return dict(exif)
        except Exception:
            pass

        # 尝试 _getexif (旧版 PIL)
        try:
            exif = img._getexif()
            if exif:
                return dict(exif)
        except Exception:
            pass

        return None

    def _parse_exif(self, exif_data: dict, info: dict) -> None:
        """解析 EXIF 数据"""
        # 如果 exif_data 是 piexif 格式 (dict of dicts)
        if isinstance(exif_data, dict):
            # piexif 结构: {"0th": {...}, "Exif": {...}, "GPS": {...}}
            if "0th" in exif_data:
                self._parse_piexif(exif_data, info)
                return
            # piexif 结构: {"Exif": {...}, "GPS": {...}}
            if "Exif" in exif_data:
                self._parse_piexif(exif_data, info)
                return

        # Pillow getexif() 格式：扁平化的 tag_id -> value
        self._parse_flat_exif(exif_data, info)

    def _parse_piexif(self, piexif_data: dict, info: dict) -> None:
        """解析 piexif 格式的 EXIF 数据"""
        ifd0 = piexif_data.get("0th", {})
        exif_ifd = piexif_data.get("Exif", {})
        gps = piexif_data.get("GPS", {})

        # Make / Model
        info["camera_make"] = self._decode_bytes(ifd0.get(0x010F))
        info["camera_model"] = self._decode_bytes(ifd0.get(0x0110))
        info["orientation"] = ifd0.get(0x0112)

        # DateTime
        capture_time = exif_ifd.get(0x9003) or ifd0.get(0x0132)
        info["capture_time"] = self._decode_bytes(capture_time)
        if info["capture_time"]:
            info["capture_time"] = info["capture_time"].replace(":", "-", 2)

        # FocalLength (piexif 返回 Rational 分数)
        focal = exif_ifd.get(0x920A)
        if focal is not None:
            fl = _rational_to_float(focal)
            if fl:
                info["focal_length"] = f"{fl:.0f}mm"

        # Aperture
        aperture = exif_ifd.get(0x829D)
        if aperture is not None:
            ap = _rational_to_float(aperture)
            if ap:
                info["aperture"] = f"f/{ap:.1f}"

        # ISO
        iso = exif_ifd.get(0x8827)
        if iso is not None:
            info["iso"] = int(iso)

        # ShutterSpeed
        shutter = exif_ifd.get(0x829A)
        if shutter is not None:
            ss = _rational_to_float(shutter)
            if ss:
                if ss < 1:
                    denom = round(1 / ss)
                    info["shutter_speed"] = f"1/{denom}"
                else:
                    info["shutter_speed"] = f"{ss:.1f}s"

        # GPS
        self._parse_gps_piexif(gps, info)

    def _parse_flat_exif(self, exif_data: dict, info: dict) -> None:
        """解析 Pillow getexif() 扁平格式的 EXIF"""
        for tag_id, tag_name in _EXIF_TAG_NAMES.items():
            value = exif_data.get(tag_id)
            if value is None:
                continue
            if tag_name == "capture_time":
                info["capture_time"] = self._decode_bytes(value)
                if info["capture_time"]:
                    info["capture_time"] = info["capture_time"].replace(":", "-", 2)
            elif tag_name == "camera_make":
                info["camera_make"] = self._decode_bytes(value)
            elif tag_name == "camera_model":
                info["camera_model"] = self._decode_bytes(value)
            elif tag_name == "orientation":
                info["orientation"] = int(value)
            elif tag_name == "focal_length":
                fl = _rational_to_float(value)
                if fl:
                    info["focal_length"] = f"{fl:.0f}mm"
            elif tag_name == "aperture":
                ap = _rational_to_float(value)
                if ap:
                    info["aperture"] = f"f/{ap:.1f}"
            elif tag_name == "iso":
                info["iso"] = int(value)
            elif tag_name == "shutter_speed":
                ss = _rational_to_float(value)
                if ss:
                    if ss < 1:
                        info["shutter_speed"] = f"1/{round(1/ss)}"
                    else:
                        info["shutter_speed"] = f"{ss:.1f}s"

        # GPS (Pillow getexif 返回 GPSInfo dict)
        gps = exif_data.get(0x8825)  # GPSInfo IFD
        if gps and isinstance(gps, dict):
            self._parse_gps_flat(gps, info)

    def _parse_gps_piexif(self, gps: dict, info: dict) -> None:
        """解析 piexif GPS 数据"""
        lat = gps.get(0x0002)
        lon = gps.get(0x0004)
        lat_ref = self._decode_bytes(gps.get(0x0001))
        lon_ref = self._decode_bytes(gps.get(0x0003))
        alt_val = gps.get(0x0006)

        if lat:
            deg = self._gps_to_decimal(lat, lat_ref)
            if deg is not None:
                info["gps_latitude"] = round(deg, 6)

        if lon:
            deg = self._gps_to_decimal(lon, lon_ref)
            if deg is not None:
                info["gps_longitude"] = round(deg, 6)

        if alt_val is not None:
            alt = _rational_to_float(alt_val)
            if alt is not None:
                info["gps_altitude"] = round(alt, 1)

    def _parse_gps_flat(self, gps: dict, info: dict) -> None:
        """解析 Pillow getexif() GPS 数据"""
        lat = gps.get(2)  # latitude
        lon = gps.get(4)  # longitude
        lat_ref = gps.get(1, "N")
        lon_ref = gps.get(3, "E")
        alt_val = gps.get(6)

        if lat:
            deg = self._gps_to_decimal(lat, lat_ref)
            if deg is not None:
                info["gps_latitude"] = round(deg, 6)

        if lon:
            deg = self._gps_to_decimal(lon, lon_ref)
            if deg is not None:
                info["gps_longitude"] = round(deg, 6)

        if alt_val is not None:
            alt = _rational_to_float(alt_val)
            if alt is not None:
                info["gps_altitude"] = round(alt, 1)

    def _gps_to_decimal(self, value, ref: str) -> Optional[float]:
        """将 GPS 坐标转为十进制度数"""
        if not isinstance(value, (tuple, list)) or len(value) < 3:
            return None

        degrees = _rational_to_float(value[0])
        minutes = _rational_to_float(value[1])
        seconds = _rational_to_float(value[2])

        if degrees is None or minutes is None or seconds is None:
            return None

        decimal = degrees + minutes / 60.0 + seconds / 3600.0

        ref = str(ref).upper() if ref else ""
        if ref in ("S", "W"):
            decimal = -decimal

        return decimal

    @staticmethod
    def _decode_bytes(value) -> Optional[str]:
        """解码字节字符串"""
        if value is None:
            return None
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="replace").strip("\x00")
        if isinstance(value, str):
            return value.strip("\x00")
        return str(value)
