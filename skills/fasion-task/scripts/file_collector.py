"""文件归集器 —— 复制本地文件、下载 URL 文件到 source/"""

import os
import shutil
import urllib.parse

import requests

# 支持的图片扩展名
_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".tiff", ".tif", ".bmp", ".gif"}


def resolve_input(input_item: str) -> dict:
    """
    判断输入类型。

    Returns:
        {
            "type": "local" | "url",
            "file_name": str,
            "exists": bool,       # 本地文件是否存在
        }
    """
    if input_item.startswith(("http://", "https://")):
        parsed = urllib.parse.urlparse(input_item)
        file_name = os.path.basename(parsed.path) or "download"
        return {"type": "url", "file_name": file_name, "exists": True}

    file_name = os.path.basename(input_item)
    exists = os.path.isfile(input_item)
    return {"type": "local", "file_name": file_name, "exists": exists}


def _is_image(file_name: str) -> bool:
    """判断是否为支持的图片格式"""
    ext = os.path.splitext(file_name)[1].lower()
    return ext in _IMAGE_EXTENSIONS


def _file_exists_with_same_size(source_dir: str, file_name: str, file_size: int) -> bool:
    """检查 source_dir 中是否已存在同名同大小的文件"""
    target = os.path.join(source_dir, file_name)
    return os.path.exists(target) and os.path.getsize(target) == file_size


def collect_files(inputs: list[str], source_dir: str, start_id: int = 1) -> list[dict]:
    """
    归集文件到 source_dir。

    Args:
        inputs: 本地路径或 URL 列表
        source_dir: 目标 source 目录
        start_id: 起始 ID

    Returns:
        [{id, source_path, original_path, original_url, file_name}]
    """
    os.makedirs(source_dir, exist_ok=True)
    results = []
    current_id = start_id

    for input_item in inputs:
        if not input_item or not input_item.strip():
            continue

        input_item = input_item.strip()
        resolved = resolve_input(input_item)

        if resolved["type"] == "local" and not resolved["exists"]:
            results.append({
                "id": None,
                "source_path": "",
                "original_path": input_item,
                "original_url": "",
                "file_name": resolved["file_name"],
                "error": f"File not found: {input_item}",
            })
            continue

        try:
            if resolved["type"] == "local":
                result = _collect_local(input_item, resolved, source_dir, current_id)
            else:
                result = _collect_url(input_item, resolved, source_dir, current_id)

            if result.get("skipped"):
                # 文件已存在，跳过但继续（id 不递增）
                results.append(result)
                continue

            if not result.get("error"):
                current_id += 1
            results.append(result)

        except Exception as e:
            results.append({
                "id": current_id,
                "source_path": "",
                "original_path": input_item if resolved["type"] == "local" else "",
                "original_url": input_item if resolved["type"] == "url" else "",
                "file_name": resolved["file_name"],
                "error": str(e),
            })
            current_id += 1

    return results


def _collect_local(src_path: str, resolved: dict, source_dir: str, item_id: int) -> dict:
    """复制本地文件到 source_dir"""
    file_name = resolved["file_name"]
    src_size = os.path.getsize(src_path)

    # 检查去重
    if _file_exists_with_same_size(source_dir, file_name, src_size):
        existing_path = os.path.join(source_dir, file_name)
        return {
            "id": None,
            "source_path": existing_path,
            "original_path": src_path,
            "original_url": "",
            "file_name": file_name,
            "skipped": True,
            "reason": "duplicate file (same name and size)",
        }

    ext = os.path.splitext(file_name)[1]
    new_name = f"{item_id}{ext}"
    dest = os.path.join(source_dir, new_name)
    shutil.copy2(src_path, dest)

    return {
        "id": item_id,
        "source_path": dest,
        "original_path": src_path,
        "original_url": "",
        "file_name": new_name,
    }


def _collect_url(url: str, resolved: dict, source_dir: str, item_id: int) -> dict:
    """下载 URL 文件到 source_dir"""
    file_name = resolved["file_name"]

    response = requests.get(url, stream=True, timeout=60)
    response.raise_for_status()

    # 尝试从 Content-Disposition 获取文件名
    cd = response.headers.get("Content-Disposition", "")
    if "filename=" in cd:
        _, _, value = cd.partition("filename=")
        file_name = value.strip('" \t')
        # 判断是否为图片格式
        if not _is_image(file_name):
            # 保留原始 URL 文件名作为备选
            file_name = resolved["file_name"]

    content_length = response.headers.get("Content-Length")
    file_size = int(content_length) if content_length else 0

    ext = os.path.splitext(file_name)[1]
    new_name = f"{item_id}{ext}"
    dest = os.path.join(source_dir, new_name)

    # 如果已存在同名同大小文件，跳过
    if os.path.exists(dest):
        existing_size = os.path.getsize(dest)
        if file_size and existing_size == file_size:
            return {
                "id": None,
                "source_path": dest,
                "original_path": "",
                "original_url": url,
                "file_name": file_name,
                "skipped": True,
                "reason": "duplicate file (same name and size)",
            }

    with open(dest, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)

    return {
        "id": item_id,
        "source_path": dest,
        "original_path": "",
        "original_url": url,
        "file_name": new_name,
    }
