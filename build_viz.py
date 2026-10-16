# -*- coding: utf-8 -*-
"""构建器：源码（viz/）与数据（graph JSON）解耦。

用法：
  python build_viz.py            # 发布模式：将 viz/ 三源文件 + enriched 数据内联为单文件交付物
                                  #   → 智算科技树-v1.0.html（零依赖，双击即开，文件名固定不随版本变）
  python build_viz.py --dev      # 开发模式：在项目根目录起本地服务，浏览器访问 /viz/ 实时编辑
                                  #   改 viz/*.js|css 或数据 JSON 后刷新即生效，无需重建交付物

源码结构：
  viz/index.html  页面骨架（发布与开发共用同一骨架，构建时做资源内联替换）
  viz/style.css   样式（改视觉只动这里）
  viz/app.js      布局+交互逻辑（含 ?selftest 内置自检）
  viz/config.js   树状图可调配置（布局几何 + 主干配色）
"""
import io
import json
import os
import sys
import time

# 以脚本自身所在目录定位数据与产物：目录整体克隆/拷贝到任意路径（含跨设备）均可直接运行
BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "智算科技树-graph-v0.3.enriched.json")
OUT = os.path.join(BASE, "智算科技树-v1.0.html")
VIZ = os.path.join(BASE, "viz")


def read(p):
    with io.open(p, encoding="utf-8") as f:
        return f.read()


def build_release():
    html = read(os.path.join(VIZ, "index.html"))
    css = read(os.path.join(VIZ, "style.css"))
    cfg = read(os.path.join(VIZ, "config.js"))
    app = read(os.path.join(VIZ, "app.js"))
    with io.open(SRC, encoding="utf-8") as f:
        data = json.load(f)

    stamp = time.strftime("%Y-%m-%d %H:%M")
    assert 'href="style.css"' in html and 'src="config.js"' in html and 'src="app.js"' in html
    html = html.replace(
        '<link rel="stylesheet" href="style.css">',
        "<style>\n" + css + "\n</style>")
    html = html.replace(
        '<script src="config.js"></script>',
        '<script>window.__BUILD__ = "%s";\nwindow.TREE_DATA = %s;</script>\n<script>\n%s\n</script>'
        % (stamp, json.dumps(data, ensure_ascii=False), cfg))
    html = html.replace(
        '<script src="app.js"></script>',
        "<script>\n" + app + "\n</script>")

    with io.open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print("release built:", OUT)
    print("  data version:", data.get("meta", {}).get("version"), "| build:", stamp,
          "| nodes:", data.get("meta", {}).get("nodeCount"))


def build_dev(port=8932):
    import http.server
    import functools
    os.chdir(BASE)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler)
    print("dev server on http://127.0.0.1:%d/viz/  （Ctrl+C 退出；编辑 viz/ 或数据 JSON 后浏览器刷新即生效）" % port)
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    if "--dev" in sys.argv:
        i = sys.argv.index("--dev")
        port = int(sys.argv[i + 1]) if len(sys.argv) > i + 1 and sys.argv[i + 1].isdigit() else 8932
        build_dev(port)
    else:
        build_release()
