# fasion-studio Skill

可视化展示 fasion-task 任务数据，基于 Flask + HTML + JavaScript。

## 功能

- 左侧侧边栏：任务列表，可展开/收起
- 主页 Tab：内容预留
- 素材列表 Tab：表格展示 media.yaml 数据
  - ID、图片预览、基本信息、质量评估、艺术评估

## 启动

```bash
cd skills/fasion-studio/scripts
source ~/.zshrc && conda activate looper_ai
pip install flask pyyaml
python app.py
```

访问 http://localhost:5100

## 依赖

- Flask
- PyYAML
