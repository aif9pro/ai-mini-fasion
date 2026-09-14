"""fasion-studio Flask 应用 —— 可视化展示 fasion-task 数据"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from flask import Flask, jsonify, render_template, request, send_file, send_from_directory

app = Flask(__name__)

# 工作空间根目录
_PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
_WORKSPACE = _PROJECT_ROOT / "workspace"


def _get_task_dir(task_name: str) -> Path:
    """获取任务目录路径"""
    return _WORKSPACE / task_name


def _read_yaml(path: Path) -> dict:
    """读取 YAML 文件，兼容含非法字节/null字节的文件"""
    import yaml
    if not path.exists():
        return {}
    raw = path.read_bytes()
    # 清除 null 字节，尝试 UTF-8 解码
    raw = raw.replace(b"\x00", b"")
    for enc in ("utf-8", "utf-8-sig", "gbk"):
        try:
            text = raw.decode(enc)
            return yaml.safe_load(text) or {}
        except (UnicodeDecodeError, yaml.YAMLError):
            continue
    # 最后兜底：替换非法字节
    text = raw.decode("utf-8", errors="replace")
    try:
        return yaml.safe_load(text) or {}
    except yaml.YAMLError:
        return {}


def _sync_task_config(task_name: str, task_dir: Path) -> dict:
    """同步 task_config.yaml，不存在则从任务配置或素材数据创建默认配置"""
    config_path = task_dir / "task_config.yaml"
    config = _read_yaml(config_path)
    if not config:
        task_data = _read_yaml(task_dir / "task.yaml")
        media_data = _read_yaml(task_dir / "media.yaml")
        config = {
            "task_name": task_data.get("task_name", task_name),
            "created_at": task_data.get("created_at", media_data.get("created_at", "")),
            "mode": "local",
        }
        import yaml
        with open(config_path, "w", encoding="utf-8") as f:
            yaml.safe_dump(config, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
    return config


# mood 四份文档（需求/规划/设计/检查）文件名映射
_MOOD_DOC_FILES = {
    "intent": "intent.md",
    "plan": "plan.md",
    "design": "design.md",
    "validation": "validation.md",
}


def _find_mood_docs_dir(task_dir: Path) -> Optional[Path]:
    """在任务目录下查找包含 intent.md 的 mood 文档子目录（优先 *-mood）。"""
    if not task_dir.exists():
        return None
    candidates = []
    for d in task_dir.iterdir():
        if d.is_dir() and (d / "intent.md").exists():
            candidates.append(d)
    for d in candidates:
        if "mood" in d.name.lower():
            return d
    return candidates[0] if candidates else None


# ---- UI ----

@app.route("/")
def index():
    return render_template("index.html")


# ---- API ----

@app.route("/api/task/<task_name>/creative-data")
def api_creative_data(task_name: str):
    """读取任务 output 下的角色设定和分镜列表。"""
    task_dir = _get_task_dir(task_name)
    if not (task_dir / "task.yaml").exists() and not task_dir.is_dir():
        return jsonify({"error": "task not found"}), 404

    output_dir = task_dir / "output"
    result = {"role": None, "board": None}
    errors = {}
    for key in ("role", "board"):
        path = output_dir / f"{key}.json"
        if not path.exists():
            errors[key] = "文件不存在"
            continue
        try:
            result[key] = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            errors[key] = f"读取失败: {exc}"
    if errors:
        result["errors"] = errors
    return jsonify(result)

@app.route("/api/tasks")
def api_tasks():
    """获取任务列表"""
    tasks = []
    if _WORKSPACE.exists():
        for name in sorted(os.listdir(_WORKSPACE)):
            task_dir = _WORKSPACE / name
            if not task_dir.is_dir():
                continue
            task_path = task_dir / "task.yaml"
            media_path = task_dir / "media.yaml"
            mood_path = task_dir / "mood.yaml"
            if not task_path.exists() and not media_path.exists() and not mood_path.exists():
                continue
            if media_path.exists():
                media = _read_yaml(media_path)
                total = media.get("total", 0)
                created_at = media.get("created_at", "")
            elif mood_path.exists():
                mood = _read_yaml(mood_path)
                total = len(mood.get("moods", []))
                created_at = mood.get("created_at", "")
            else:
                task_data = _read_yaml(task_path)
                total = 0
                created_at = task_data.get("created_at", "")
            config = _sync_task_config(name, task_dir)
            tasks.append({
                "name": name,
                "total": total,
                "created_at": created_at,
                "mode": config.get("mode", "local"),
            })
    return jsonify(tasks)


@app.route("/api/task/<task_name>")
def api_task_detail(task_name: str):
    """获取任务详情"""
    task_dir = _get_task_dir(task_name)
    task_path = task_dir / "task.yaml"
    media_path = task_dir / "media.yaml"
    mood_path = task_dir / "mood.yaml"
    if not task_path.exists() and not media_path.exists() and not mood_path.exists():
        return jsonify({"error": "task not found"}), 404

    config = _sync_task_config(task_name, task_dir)

    if media_path.exists():
        media = _read_yaml(media_path)
        for item in media.get("items", []):
            src = item.get("source_path", "")
            if src:
                fname = Path(src).name
                item["_preview"] = f"/api/image/{task_name}/{fname}"
        return jsonify({"config": config, "media": media})
    else:
        mood = _read_yaml(mood_path)
        return jsonify({"config": config, "mood": mood})


@app.route("/api/task/<task_name>/mood-docs")
def api_mood_docs(task_name: str):
    """读取任务 mood 目录下的四份文档（需求/规划/设计/检查）原始 Markdown 文本。"""
    task_dir = _get_task_dir(task_name)
    docs_dir = _find_mood_docs_dir(task_dir)
    if docs_dir is None:
        return jsonify({"error": "no mood docs found"}), 404

    docs = {}
    for key, fname in _MOOD_DOC_FILES.items():
        p = docs_dir / fname
        docs[key] = p.read_text(encoding="utf-8", errors="replace") if p.exists() else ""

    rel = str(docs_dir.relative_to(_PROJECT_ROOT))
    return jsonify({"dir": rel, "docs": docs})


@app.route("/api/image/<task_name>/<filename>")
def api_image(task_name: str, filename: str):
    """提供任务预览图片。

    统一优先读取 compressed/ 目录；若不存在则 fallback 到 source/。
    同时兼容 source/1.JPG 与 compressed/1.jpg 这种后缀大小写/格式不一致的情况。
    """
    task_dir = _get_task_dir(task_name)
    source_dir = task_dir / "source"
    compressed_dir = task_dir / "compressed"
    stem = Path(filename).stem

    candidates = [
        filename,
        f"{stem}.jpg",
        f"{stem}.JPG",
        f"{stem}.jpeg",
        f"{stem}.JPEG",
    ]
    for candidate in candidates:
        if (compressed_dir / candidate).exists():
            return send_from_directory(str(compressed_dir), candidate)

    return send_from_directory(str(source_dir), filename)


@app.route("/api/task/<task_name>/exports")
def api_task_exports(task_name: str):
    """读取导出分组总表 exports.yaml，并补充每个分组 export.yaml 里的 ids。"""
    task_dir = _get_task_dir(task_name)
    export_root = task_dir / "export"
    exports_path = export_root / "exports.yaml"
    data = _read_yaml(exports_path)
    if isinstance(data, dict) and isinstance(data.get("exports"), list):
        data = data["exports"]
    if not isinstance(data, list):
        data = []

    exports = []
    for record in data:
        if not isinstance(record, dict):
            continue
        item = dict(record)
        group_name = item.get("name", "")
        group_yaml = export_root / group_name / "export.yaml"
        group_data = _read_yaml(group_yaml)
        ids = group_data.get("ids", []) if isinstance(group_data, dict) else []
        item["ids"] = ids
        if item.get("cover_id") is None and ids:
            item["cover_id"] = ids[0]
        if not item.get("count"):
            item["count"] = len(ids)
        exports.append(item)

    return jsonify({"task_name": task_name, "exports": exports})


@app.route("/api/task/<task_name>/status", methods=["POST"])
def api_set_status(task_name: str):
    """批量写入 item 状态到 media.yaml
    Body: { "ids": ["id1", "id2"], "status": "成片|好片|待定|废片" }
    """
    import yaml
    from datetime import datetime

    body = request.get_json(silent=True) or {}
    ids = body.get("ids", [])
    status = body.get("status", "")
    VALID = {"成片", "好片", "待定", "废片"}
    if not ids or status not in VALID:
        return jsonify({"error": "invalid params"}), 400

    task_dir = _get_task_dir(task_name)
    media_path = task_dir / "media.yaml"
    if not media_path.exists():
        return jsonify({"error": "task not found"}), 404

    media = _read_yaml(media_path)
    if not media or not media.get("items"):
        return jsonify({"error": "media data is empty or corrupted"}), 500

    id_set = set(str(i) for i in ids)
    updated = 0
    for item in media.get("items", []):
        item_id = str(item.get("id", ""))
        if item_id in id_set:
            item["status"] = status
            updated += 1

    media["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(media_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(media, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    return jsonify({"ok": True, "updated": updated})


@app.route("/api/task/<task_name>/export-next")
def api_export_next(task_name: str):
    """返回建议的下一个导出文件夹名，自增"""
    import re
    task_dir = _get_task_dir(task_name)
    export_dir = task_dir / "export"
    max_seq = 0
    if export_dir.exists():
        for d in export_dir.iterdir():
            if not d.is_dir():
                continue
            m = re.match(rf"^{re.escape(task_name)}_(\d+)", d.name)
            if m:
                seq = int(m.group(1))
                if seq > max_seq:
                    max_seq = seq
    return jsonify({"next": f"{task_name}_{max_seq + 1:02d}"})


@app.route("/api/task/<task_name>/export", methods=["POST"])
def api_export(task_name: str):
    """
    Body: { "ids": ["1", "3", "5"], "folder": "61_01" }
    将选中图片的原始文件和压缩文件分别复制到:
      export/{folder}/source/       ← 原始文件 (source_path)
      export/{folder}/compressed/   ← 压缩文件 (compressed_path)
    同时写入 export.yaml 记录导出信息
    """
    import shutil
    import yaml

    body = request.get_json(silent=True) or {}
    ids = body.get("ids", [])
    folder = body.get("folder", "").strip()
    if not ids or not folder:
        return jsonify({"error": "invalid params"}), 400

    task_dir = _get_task_dir(task_name)
    src_dir = task_dir / "export" / folder / "source"
    cmp_dir = task_dir / "export" / folder / "compressed"
    src_dir.mkdir(parents=True, exist_ok=True)
    cmp_dir.mkdir(parents=True, exist_ok=True)

    media = _read_yaml(task_dir / "media.yaml")
    id_set = set(str(i) for i in ids)
    copied = 0
    for item in media.get("items", []):
        item_id = str(item.get("id", ""))
        if item_id not in id_set:
            continue
        # 原始文件 → source/
        source_path = item.get("source_path", "")
        if source_path:
            sp = Path(source_path)
            if not sp.is_absolute():
                sp = _PROJECT_ROOT / sp
            if sp.exists():
                _copy_overwrite(sp, src_dir)

        # 压缩文件 → compressed/
        cp = _resolve_compressed_path(task_dir, item)
        if cp and cp.exists():
            _copy_overwrite(cp, cmp_dir)

        item["exported"] = True
        copied += 1

    # 回写 media.yaml 更新 exported 状态 & 时间戳
    media["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    media_path = task_dir / "media.yaml"
    with open(media_path, "w", encoding="utf-8") as f:
        yaml.dump(media, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    # 写入/追加 export.yaml 记录导出信息
    export_yaml = task_dir / "export" / folder / "export.yaml"
    existing_export = _read_yaml(export_yaml)
    existing_ids = set(existing_export.get("ids", [])) if existing_export else set()

    new_ids = [int(i) for i in ids if int(i) not in existing_ids]
    merged_ids = sorted(set(existing_ids) | set(new_ids))
    update_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    folder_dir = task_dir / "export" / folder
    cover_id = merged_ids[0] if merged_ids else None
    export_data = {
        "task_name": task_name,
        "folder": folder,
        "exported_at": update_time,
        "count": len(merged_ids),
        "cover_id": cover_id,
        "ids": merged_ids,
    }
    with open(export_yaml, "w", encoding="utf-8") as f:
        yaml.safe_dump(export_data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    _upsert_exports_index(
        export_root=task_dir / "export",
        name=folder,
        count=len(merged_ids),
        folder_dir=folder_dir,
        update_time=update_time,
        cover_id=cover_id,
    )

    return jsonify({"ok": True, "copied": len(new_ids), "total": len(merged_ids),
                    "dir": str(folder_dir)})


def _resolve_compressed_path(task_dir: Path, item: dict) -> Optional[Path]:
    """根据 item 解析对应的 compressed 图片路径。"""
    compressed_path = item.get("compressed_path", "")
    if compressed_path:
        cp = Path(compressed_path)
        if not cp.is_absolute():
            cp = _PROJECT_ROOT / cp
        if cp.exists():
            return cp

    source_path = item.get("source_path", "")
    if not source_path:
        return None

    stem = Path(source_path).stem
    compressed_dir = task_dir / "compressed"
    for name in (f"{stem}.jpg", f"{stem}.JPG", f"{stem}.jpeg", f"{stem}.JPEG"):
        cp = compressed_dir / name
        if cp.exists():
            return cp
    return None


def _copy_overwrite(src: Path, dest_dir: Path) -> Path:
    """复制文件到目标目录；同名则覆盖，确保重复导出时文件保持最新。"""
    import shutil
    dest = dest_dir / src.name
    shutil.copy2(str(src), str(dest))
    return dest


def _upsert_exports_index(
    export_root: Path,
    name: str,
    count: int,
    folder_dir: Path,
    update_time: str,
    cover_id: Optional[int] = None,
):
    """维护 export/exports.yaml，总是列表结构，重复 name 只更新记录。"""
    import yaml

    export_root.mkdir(parents=True, exist_ok=True)
    index_path = export_root / "exports.yaml"
    data = _read_yaml(index_path)
    if isinstance(data, list):
        exports = data
    elif isinstance(data, dict) and isinstance(data.get("exports"), list):
        exports = data["exports"]
    else:
        exports = []

    record = {
        "name": name,
        "count": count,
        "cover_id": cover_id,
        "path": str(folder_dir),
        "update_time": update_time,
    }

    updated = False
    for idx, item in enumerate(exports):
        if isinstance(item, dict) and item.get("name") == name:
            exports[idx] = {**item, **record}
            updated = True
            break
    if not updated:
        exports.append(record)

    with open(index_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(exports, f, allow_unicode=True, default_flow_style=False, sort_keys=False)


def _copy_safe(src: Path, dest_dir: Path):
    """复制文件到目标目录，同名冲突加 _dup 后缀"""
    import shutil
    dest = dest_dir / src.name
    if dest.exists():
        dest = dest_dir / f"{src.stem}_dup{src.suffix}"
    shutil.copy2(str(src), str(dest))


# ---- Plan / Mood ----

@app.route("/api/plan-mood")
def api_plan_mood():
    """加载 mood.yaml 策划文件，支持路径参数"""
    import urllib.parse
    raw_path = request.args.get("path", "")
    if raw_path:
        # 允许 URL 编码的路径，也支持直接传相对路径
        try:
            mood_path = Path(urllib.parse.unquote(raw_path))
        except Exception:
            mood_path = Path(raw_path)
    else:
        # 默认：扫描 workspace/ 目录，列出包含 mood.yaml 的任务
        dirs = []
        if _WORKSPACE.exists():
            for d in sorted(_WORKSPACE.iterdir()):
                if d.is_dir() and (d / "mood.yaml").exists():
                    rel = str(d.relative_to(_PROJECT_ROOT))
                    dirs.append({"name": d.name, "path": rel + "/mood.yaml"})
        return jsonify({"dirs": dirs})

    if not mood_path.is_absolute():
        mood_path = _PROJECT_ROOT / mood_path
    if not mood_path.exists():
        return jsonify({"error": f"文件不存在: {mood_path}"}), 404

    mood_data = _read_yaml(mood_path)
    if not mood_data:
        return jsonify({"error": "文件为空或解析失败"}), 500

    return jsonify(mood_data)


def _append_mood_material(mood_path: Path, mood_id: str, material_id: str) -> bool:
    """向 mood.yaml 中指定 mood_id 的 m_list 追加 material_id（去重）。"""
    import yaml
    mood_data = _read_yaml(mood_path)
    moods = mood_data.get("moods", [])
    if not isinstance(moods, list):
        return False
    for m in moods:
        if isinstance(m, dict) and m.get("mood_id") == mood_id:
            m_list = m.get("m_list") or []
            if not isinstance(m_list, list):
                m_list = []
            if material_id not in m_list:
                m_list.append(material_id)
            m["m_list"] = m_list
            with open(mood_path, "w", encoding="utf-8") as f:
                yaml.safe_dump(mood_data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
            return True
    return False


@app.route("/api/plan/generate", methods=["POST"])
def api_plan_generate():
    """策划页「生成」按钮：调用 runninghub_mj_t2i 生成图片，并把 material_id 写入 mood.yaml 的 m_list。"""
    import urllib.parse
    import traceback

    body = request.get_json(silent=True) or {}
    raw_path = body.get("path", "")
    mood_id = body.get("mood_id", "")
    prompt = (body.get("prompt", "") or "").strip()

    if not raw_path or not mood_id or not prompt:
        return jsonify({"ok": False, "error": "缺少参数 path/mood_id/prompt"}), 400

    try:
        mood_path = Path(urllib.parse.unquote(raw_path))
    except Exception:
        mood_path = Path(raw_path)
    if not mood_path.is_absolute():
        mood_path = _PROJECT_ROOT / mood_path
    if not mood_path.exists():
        return jsonify({"ok": False, "error": f"mood.yaml 不存在: {mood_path}"}), 404

    factory_id = "runninghub_mj_t2i"
    try:
        sys.path.insert(0, str(_PROJECT_ROOT / "skills" / "media-factory" / "scripts"))
        from material import material_task
        res = material_task.run_create(factory_id, {"prompt": prompt}, ak=None, sk=None)
        local_id = res.get("local_id", "")
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500

    if not local_id:
        return jsonify({"ok": False, "error": "生成任务创建失败"}), 500

    written = _append_mood_material(mood_path, mood_id, local_id)

    return jsonify({"ok": True, "material_id": local_id,
                    "status": res.get("status", "pending"), "written": written})


@app.route("/api/plan/materials")
def api_plan_materials():
    """查询指定 mood_id 的 m_list 中各 material 的状态与 urls。"""
    import urllib.parse

    raw_path = request.args.get("path", "")
    mood_id = request.args.get("mood_id", "")
    if not raw_path or not mood_id:
        return jsonify({"error": "缺少参数 path/mood_id"}), 400

    try:
        mood_path = Path(urllib.parse.unquote(raw_path))
    except Exception:
        mood_path = Path(raw_path)
    if not mood_path.is_absolute():
        mood_path = _PROJECT_ROOT / mood_path
    if not mood_path.exists():
        return jsonify({"error": f"mood.yaml 不存在: {mood_path}"}), 404

    mood_data = _read_yaml(mood_path)
    m_list = []
    for m in mood_data.get("moods", []):
        if isinstance(m, dict) and m.get("mood_id") == mood_id:
            ml = m.get("m_list") or []
            m_list = ml if isinstance(ml, list) else []
            break

    mat_path = _PROJECT_ROOT / "material_lib" / "app" / "materials.yaml"
    mat_data = _read_yaml(mat_path) or {}
    mat_items = mat_data.get("materials", []) if isinstance(mat_data, dict) else mat_data
    if not isinstance(mat_items, list):
        mat_items = []

    by_id = {}
    for item in mat_items:
        if isinstance(item, dict):
            by_id[str(item.get("material_id", ""))] = item

    result = []
    for mid in m_list:
        item = by_id.get(str(mid))
        if item is None:
            result.append({"material_id": str(mid), "status": "pending",
                           "urls": [], "type": "image", "error": ""})
            continue
        urls = item.get("urls") or []
        if not urls and item.get("url"):
            urls = [item.get("url")]
        result.append({
            "material_id": str(mid),
            "status": item.get("status", "pending"),
            "urls": [str(u) for u in urls if u],
            "type": item.get("type", "image"),
            "error": item.get("error", ""),
            "created_at": item.get("created_at", ""),
        })

    return jsonify({"m_list": result})


@app.route("/api/plan/image")
def api_plan_image():
    """代理加载生成图片：本地磁盘缓存 + 服务端下载，规避外链 SSL/网络不稳定导致的裂图。"""
    import urllib.parse
    import hashlib
    import requests as _requests

    url = request.args.get("url", "")
    if not url:
        return jsonify({"error": "缺少 url"}), 400
    url = urllib.parse.unquote(url)
    if not url.startswith(("http://", "https://")):
        return jsonify({"error": "非法 url"}), 400

    cache_dir = _PROJECT_ROOT / "material_lib" / "cache" / "plan_img"
    cache_dir.mkdir(parents=True, exist_ok=True)

    path_part = urllib.parse.urlparse(url).path
    ext = os.path.splitext(path_part)[1] or ".png"
    if ext.lower() not in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        ext = ".png"

    key = hashlib.md5(url.encode("utf-8")).hexdigest()
    cache_file = cache_dir / f"{key}{ext}"

    if not cache_file.exists():
        try:
            resp = _requests.get(url, timeout=60, stream=True)
            if resp.status_code != 200:
                return jsonify({"error": f"下载失败: {resp.status_code}"}), 502
            with open(cache_file, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)
        except Exception as e:
            return jsonify({"error": str(e)}), 502

    mimetype = {
        "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "webp": "image/webp", "gif": "image/gif",
    }.get(ext.lstrip(".").lower(), "image/png")
    return send_file(str(cache_file), mimetype=mimetype)


# ---- Generate Tab ----

@app.route("/api/generate/config")
def api_generate_config():
    """返回 media-factory 能力树（级联选择器数据源）"""
    config_path = _PROJECT_ROOT / "skills" / "media-factory" / "scripts" / "config.yaml"
    caps = _read_yaml(config_path).get("capabilities", {})

    result = {"image": [], "video": [], "audio": []}

    for src_name, src_data in caps.items():
        source = src_data.get("source", src_name)
        description = src_data.get("description", "")
        models = src_data.get("models", {})

        for model_name, model_data in models.items():
            model = model_data.get("model", model_name)
            model_desc = model_data.get("description", "")
            functions = model_data.get("functions", [])

            available_fns = []
            for fn in functions:
                fn_type = fn.get("type", "")
                if fn_type not in ("image", "video", "audio"):
                    continue
                if fn.get("status") != "available":
                    continue
                available_fns.append({
                    "factory_id": fn["factory_id"],
                    "name": fn.get("name", ""),
                    "description": fn.get("description", ""),
                    "type": fn_type,
                    "params": fn.get("params", {}),
                })

            if not available_fns:
                continue

            for t in ("image", "video", "audio"):
                t_fns = [f for f in available_fns if f["type"] == t]
                if not t_fns:
                    continue
                entry = {
                    "source": source,
                    "description": description,
                    "models": [{
                        "model": model,
                        "description": model_desc,
                        "functions": t_fns,
                    }]
                }
                result[t].append(entry)

    return jsonify(result)


@app.route("/api/upload", methods=["POST"])
def api_upload():
    """上传文件到云存储，返回 URL"""
    import subprocess
    import tempfile

    file = request.files.get("file")
    if not file:
        return jsonify({"ok": False, "error": "未提供文件"}), 400

    tmp_dir = Path(tempfile.gettempdir()) / "fasion_studio_uploads"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = tmp_dir / (os.path.basename(file.filename or "upload"))
    file.save(str(tmp_path))

    upload_script = _PROJECT_ROOT / "skills" / "media-cloud" / "scripts" / "upload_to_cloud.py"
    env = os.environ.copy()
    # Load COS credentials from init-skill
    cos_setup = _PROJECT_ROOT / "skills" / "init-skill" / "scripts" / "setup_cos.sh"
    if cos_setup.exists():
        with open(cos_setup) as f:
            for line in f:
                line = line.strip()
                if line.startswith("export "):
                    parts = line[7:].split("=", 1)
                    if len(parts) == 2:
                        env[parts[0]] = parts[1].strip("'\"")
    try:
        result = subprocess.run(
            [sys.executable, str(upload_script), "-f", str(tmp_path)],
            capture_output=True, text=True, timeout=120, cwd=str(_PROJECT_ROOT), env=env
        )
        if result.returncode != 0:
            return jsonify({"ok": False, "error": result.stderr.strip() or "上传失败"}), 500
        import re
        output = result.stdout
        url_match = re.search(r'URL:\s*(https?://\S+)', output)
        cos_match = re.search(r'FileID.*?:\s*(\S+)', output)
        url = url_match.group(1) if url_match else ""
        file_id = cos_match.group(1) if cos_match else ""
        return jsonify({"ok": True, "url": url, "path": str(tmp_path), "file_id": file_id})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/generate", methods=["POST"])
def api_generate():
    """调用 media-factory 异步生成素材"""
    import threading

    body = request.get_json(silent=True) or {}
    factory_id = body.get("factory_id", "")
    kwargs = body.get("kwargs", {})
    count = body.get("count", 1)

    if not factory_id:
        return jsonify({"ok": False, "error": "缺少 factory_id"}), 400

    try:
        sys.path.insert(0, str(_PROJECT_ROOT / "skills" / "media-factory" / "scripts"))
        from material import material_task

        results = []
        for _ in range(count):
            res = material_task.run_create(factory_id, kwargs, ak=None, sk=None)
            if res.get("status") == "pending":
                results.append({"local_id": res["local_id"], "status": "pending"})
            else:
                results.append({"local_id": res.get("local_id", ""), "status": res.get("status", "fail"), "error": str(res)})

        return jsonify({"ok": True, "results": results, "status": "pending"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[generate] error: {e}", flush=True)
        return jsonify({"ok": False, "error": str(e)}), 500


def _normalize_result_items(item, fallback_local_id=""):
    results = []
    raw_results = item.get("results", []) if isinstance(item, dict) else []
    raw_urls = item.get("urls", []) if isinstance(item, dict) else []
    if isinstance(raw_results, list):
        for raw in raw_results:
            if not isinstance(raw, dict):
                continue
            results.append({
                "local_id": str(raw.get("local_id", fallback_local_id or item.get("id", ""))),
                "url": raw.get("url", "") or raw.get("cloud_url", ""),
                "path": raw.get("path", ""),
                "type": raw.get("type", item.get("type", "image") if isinstance(item, dict) else "image") or "image",
            })
    if not results and isinstance(raw_urls, list):
        for raw_url in raw_urls:
            if not raw_url:
                continue
            results.append({
                "local_id": fallback_local_id or str(item.get("id", "")),
                "url": str(raw_url).strip(),
                "path": item.get("path", ""),
                "type": item.get("type", "image") or "image",
            })
    if not results:
        results.append({
            "local_id": fallback_local_id or str(item.get("id", "")),
            "url": item.get("url", "") or item.get("cloud_url", ""),
            "path": item.get("path", ""),
            "type": item.get("type", "image") or "image",
        })
    return results


@app.route("/api/generate/status")
def api_generate_status():
    """查询生成任务状态"""
    local_id = request.args.get("local_id", "")
    if not local_id:
        return jsonify({"ok": False, "error": "缺少 local_id"}), 400

    mat_path = _PROJECT_ROOT / "material_lib" / "app" / "materials.yaml"
    if not mat_path.exists():
        return jsonify({"status": "pending"})

    data = _read_yaml(mat_path) or {}
    items = data.get("items", []) if isinstance(data, dict) else data
    for item in items:
        if str(item.get("id", "")) == local_id:
            status = item.get("status", "pending")
            result = {"status": status}
            if status == "succeed":
                normalized = _normalize_result_items(item, local_id)
                first = normalized[0] if normalized else {"url": "", "path": "", "type": "image"}
                if not first.get("type"):
                    rsp = _read_yaml(_PROJECT_ROOT / "material_lib" / "output" / local_id / "rsp_api_params.json") or {}
                    first["type"] = rsp.get("type", "image")
                    first["url"] = first.get("url", "") or rsp.get("url", "")
                    first["path"] = first.get("path", "") or rsp.get("path", "")
                result["url"] = first.get("url", "")
                result["path"] = first.get("path", "")
                result["type"] = first.get("type", "image")
                result["results"] = normalized
            elif status == "fail":
                result["error"] = item.get("error", "生成失败")
            return jsonify(result)

    rsp_path = _PROJECT_ROOT / "material_lib" / "output" / local_id / "rsp_api_params.json"
    if rsp_path.exists():
        rsp = _read_yaml(rsp_path) or {}
        normalized = [{
            "local_id": local_id,
            "url": rsp.get("url", ""),
            "path": rsp.get("path", ""),
            "type": rsp.get("type", "image") or "image",
        }]
        return jsonify({"status": "succeed", "url": rsp.get("url", ""), "path": rsp.get("path", ""), "type": rsp.get("type", "image"), "results": normalized})
    return jsonify({"status": "pending"})


@app.route("/api/materials/succeed")
def api_materials_succeed():
    """读取 material_lib/app/materials.yaml，返回 status=succeed 的素材及其所有图片 url。"""
    mat_path = _PROJECT_ROOT / "material_lib" / "app" / "materials.yaml"
    if not mat_path.exists():
        return jsonify({"items": [], "total": 0})

    data = _read_yaml(mat_path) or {}
    raw_items = data.get("materials", []) if isinstance(data, dict) else data
    if not isinstance(raw_items, list):
        raw_items = []

    items = []
    for it in raw_items:
        if not isinstance(it, dict):
            continue
        if it.get("status") != "succeed":
            continue
        urls = it.get("urls") or []
        if not isinstance(urls, list):
            urls = []
        if not urls and it.get("url"):
            urls = [it.get("url")]
        urls = [str(u).strip() for u in urls if u and str(u).strip()]
        if not urls:
            continue
        review = it.get("review", 0)
        try:
            review = int(review)
        except (TypeError, ValueError):
            review = 0
        items.append({
            "material_id": str(it.get("material_id", "")),
            "factory_id": it.get("factory_id", ""),
            "type": it.get("type", "image"),
            "prompt": it.get("prompt", ""),
            "created_at": it.get("created_at", ""),
            "review": review,
            "urls": urls,
        })

    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return jsonify({"items": items, "total": len(items)})


@app.route("/api/materials/review", methods=["POST"])
def api_materials_review():
    """更新 materials.yaml 中指定 material 的 review 状态。

    Body: { "material_id": "...", "review": -1|0|1|2 }
    映射：-1=废片, 0=待定, 1=好片, 2=成片
    """
    import yaml

    body = request.get_json(silent=True) or {}
    material_id = str(body.get("material_id", "")).strip()
    review = body.get("review")
    try:
        review = int(review)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid review"}), 400

    VALID = {-1, 0, 1, 2}
    if not material_id or review not in VALID:
        return jsonify({"error": "invalid params"}), 400

    mat_path = _PROJECT_ROOT / "material_lib" / "app" / "materials.yaml"
    if not mat_path.exists():
        return jsonify({"error": "materials.yaml not found"}), 404

    data = _read_yaml(mat_path) or {}
    items = data.get("materials", []) if isinstance(data, dict) else data
    if not isinstance(items, list):
        return jsonify({"error": "materials data is corrupted"}), 500

    updated = 0
    for it in items:
        if isinstance(it, dict) and str(it.get("material_id", "")) == material_id:
            it["review"] = review
            updated += 1

    if updated == 0:
        return jsonify({"error": "material not found"}), 404

    data["materials"] = items
    with open(mat_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    return jsonify({"ok": True, "updated": updated, "material_id": material_id, "review": review})


@app.route("/api/materials/export", methods=["POST"])
def api_materials_export():
    """导出 materials.yaml 中选中的素材图片（下载 url 到本地 export 目录）。

    Body: { "task_name": "...", "material_ids": ["..."], "folder": "..." }
    """
    import yaml
    import requests as _requests
    from urllib.parse import urlparse

    body = request.get_json(silent=True) or {}
    task_name = body.get("task_name", "")
    material_ids = body.get("material_ids", [])
    folder = body.get("folder", "").strip()
    if not task_name or not material_ids or not folder:
        return jsonify({"error": "invalid params"}), 400

    task_dir = _get_task_dir(task_name)
    dest_dir = task_dir / "export" / folder / "source"
    dest_dir.mkdir(parents=True, exist_ok=True)

    mat_path = _PROJECT_ROOT / "material_lib" / "app" / "materials.yaml"
    data = _read_yaml(mat_path) or {}
    items = data.get("materials", []) if isinstance(data, dict) else data
    if not isinstance(items, list):
        items = []

    id_set = set(str(i) for i in material_ids)
    downloaded = 0
    exported_mids = []
    for it in items:
        if not isinstance(it, dict):
            continue
        mid = str(it.get("material_id", ""))
        if mid not in id_set:
            continue
        urls = it.get("urls") or []
        if not isinstance(urls, list):
            urls = []
        if not urls and it.get("url"):
            urls = [it.get("url")]
        saved_any = False
        for idx, url in enumerate(urls):
            url = str(url).strip()
            if not url.startswith(("http://", "https://")):
                continue
            try:
                resp = _requests.get(url, timeout=60, stream=True)
                if resp.status_code != 200:
                    continue
                path_part = urlparse(url).path
                ext = os.path.splitext(path_part)[1] or ".png"
                if ext.lower() not in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
                    ext = ".png"
                fname = (f"{mid}_{idx + 1}{ext}") if len(urls) > 1 else (f"{mid}{ext}")
                with open(dest_dir / fname, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        f.write(chunk)
                downloaded += 1
                saved_any = True
            except Exception as e:
                print(f"[materials/export] 下载失败 {url}: {e}", flush=True)
        if saved_any:
            exported_mids.append(mid)

    export_yaml = task_dir / "export" / folder / "export.yaml"
    existing = _read_yaml(export_yaml)
    existing_ids = set(existing.get("ids", [])) if isinstance(existing, dict) else set()
    merged_ids = sorted(existing_ids | set(exported_mids))
    update_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    export_data = {
        "task_name": task_name,
        "folder": folder,
        "exported_at": update_time,
        "count": len(merged_ids),
        "cover_id": merged_ids[0] if merged_ids else None,
        "ids": merged_ids,
    }
    with open(export_yaml, "w", encoding="utf-8") as f:
        yaml.safe_dump(export_data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    _upsert_exports_index(
        export_root=task_dir / "export",
        name=folder,
        count=len(merged_ids),
        folder_dir=task_dir / "export" / folder,
        update_time=update_time,
        cover_id=merged_ids[0] if merged_ids else None,
    )

    return jsonify({"ok": True, "copied": downloaded, "total": len(merged_ids),
                    "dir": str(task_dir / "export" / folder)})


@app.route("/api/history")
def api_history():
    """分页查询素材历史"""
    page = request.args.get("page", 1, type=int)
    size = request.args.get("size", 20, type=int)
    type_filter = request.args.get("type", "")
    status_filter = request.args.get("status", "")

    mat_path = _PROJECT_ROOT / "material_lib" / "app" / "materials.yaml"
    if not mat_path.exists():
        return jsonify({"items": [], "page": page, "pages": 1})

    data = _read_yaml(mat_path) or {}
    all_items = data.get("items", []) if isinstance(data, dict) else data

    if type_filter:
        all_items = [i for i in all_items if i.get("type", "") == type_filter]
    if status_filter:
        all_items = [i for i in all_items if i.get("status", "") == status_filter]

    all_items = sorted(all_items, key=lambda x: x.get("created_at", ""), reverse=True)
    total = len(all_items)
    pages = max(1, -(-total // size))
    start = (page - 1) * size
    items = all_items[start:start + size]

    result = []
    for item in items:
        normalized = _normalize_result_items(item)
        result.append({
            "id": str(item.get("id", "")),
            "factory_id": item.get("factory_id", ""),
            "type": item.get("type", ""),
            "status": item.get("status", "pending"),
            "url": normalized[0].get("url", "") if normalized else item.get("url", ""),
            "results": normalized,
            "time": item.get("created_at", ""),
        })
    return jsonify({"items": result, "page": page, "pages": pages})


@app.route("/api/history/detail")
def api_history_detail():
    """获取单条历史记录详情"""
    item_id = request.args.get("id", "")
    if not item_id:
        return jsonify({"error": "缺少 id"}), 400

    mat_path = _PROJECT_ROOT / "material_lib" / "app" / "materials.yaml"
    if not mat_path.exists():
        return jsonify({"error": "素材库不存在"}), 404

    data = _read_yaml(mat_path) or {}
    items = data.get("items", []) if isinstance(data, dict) else data
    for item in items:
        if str(item.get("id", "")) == item_id:
            normalized = _normalize_result_items(item)
            return jsonify({
                "id": str(item.get("id", "")),
                "factory_id": item.get("factory_id", ""),
                "type": item.get("type", ""),
                "status": item.get("status", "pending"),
                "url": normalized[0].get("url", "") if normalized else item.get("url", ""),
                "results": normalized,
                "time": item.get("created_at", ""),
            })
    return jsonify({"error": "未找到"}), 404


if __name__ == "__main__":
    app.run(debug=True, port=5100)
