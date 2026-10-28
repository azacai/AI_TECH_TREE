# -*- coding: utf-8 -*-
"""大智算科技树 v0.3 校验引擎
校验项：完整性 / 无环(DAG) / 深度分层 / 路径最小性 / 胜利可达性(闭包) / 枢纽分析 / V5 约束模式模拟
产物：智算科技树-v0.3-校验报告.md + 智算科技树-graph-v0.3.enriched.json（供 v1.0 可视化）
"""
import json
import io
import os
from collections import defaultdict, deque

# 以脚本自身所在目录定位数据与产物：目录整体克隆/拷贝到任意路径（含跨设备）均可直接运行
BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "智算科技树-graph-v0.3.json")
REPORT = os.path.join(BASE, "智算科技树-v0.3-校验报告.md")
ENRICHED = os.path.join(BASE, "智算科技树-graph-v0.3.enriched.json")

EXPECT_NODES = 198
EXPECT_PATHS = 18


def parents_all(n):
    ps = list(n.get("prereqs", []))
    for grp in n.get("prereqsAny", []):
        ps += grp
    return ps


def main():
    with io.open(SRC, encoding="utf-8") as f:
        data = json.load(f)
    nodes = {n["id"]: n for n in data["nodes"]}
    lines, errors = [], []

    def emit(s=""):
        lines.append(s)

    # ---------- 1 完整性 ----------
    ids = [n["id"] for n in data["nodes"]]
    dup = sorted({x for x in ids if ids.count(x) > 1})
    if dup:
        errors.append("重复节点 ID: %s" % dup)
    for n in data["nodes"]:
        for p in parents_all(n):
            if p not in nodes:
                errors.append("节点 %s 引用不存在的父节点 %s" % (n["id"], p))
            elif p == n["id"]:
                errors.append("节点 %s 自依赖" % n["id"])
    npaths = 0
    for v in data["victories"]:
        for path in v["paths"]:
            npaths += 1
            for x in path["nodes"]:
                if x not in nodes:
                    errors.append("%s 路径 %s 引用不存在节点 %s" % (v["id"], path["id"], x))
            if len(set(path["nodes"])) != len(path["nodes"]):
                errors.append("%s 路径 %s 含重复节点" % (v["id"], path["id"]))
    edges = sum(len(parents_all(n)) for n in data["nodes"])

    # ---------- 2 无环校验（Kahn 拓扑排序） ----------
    indeg = {i: 0 for i in nodes}
    children = defaultdict(list)
    for n in data["nodes"]:
        for p in parents_all(n):
            children[p].append(n["id"])
            indeg[n["id"]] += 1
    q = deque([i for i in nodes if indeg[i] == 0])
    topo = []
    while q:
        x = q.popleft()
        topo.append(x)
        for c in children[x]:
            indeg[c] -= 1
            if indeg[c] == 0:
                q.append(c)
    acyclic = len(topo) == len(nodes)

    # ---------- 3 深度分层（最长路径） ----------
    depth = {}
    for x in topo:
        ps = parents_all(nodes[x])
        depth[x] = 0 if not ps else max(depth[p] for p in ps) + 1

    # ---------- 4 传递祖先 ----------
    def ancestors(nid):
        seen, st = set(), list(parents_all(nodes[nid]))
        while st:
            x = st.pop()
            if x in seen:
                continue
            seen.add(x)
            st += parents_all(nodes[x])
        return seen

    anc = {i: ancestors(i) for i in nodes}

    # ---------- 5 闭包（点亮路径所需的全部节点，含传递前置；多选前置按第一分支解析） ----------
    def closure(seed):
        lit = set(seed)
        changed = True
        while changed:
            changed = False
            for nid in list(lit):
                n = nodes[nid]
                for p in n.get("prereqs", []):
                    if p not in lit:
                        lit.add(p)
                        changed = True
                for grp in n.get("prereqsAny", []):
                    if not any(g in lit for g in grp):
                        lit.add(grp[0])
                        changed = True
        return lit

    # ---------- 6 路径最小性 ----------
    path_issues = []
    for v in data["victories"]:
        for path in v["paths"]:
            for a in path["nodes"]:
                for b in path["nodes"]:
                    if a != b and a in anc[b]:
                        path_issues.append(
                            "%s/%s：%s 是 %s 的传递前置，冗余" % (v["id"], path["id"], a, b))

    # ---------- 7 胜利可达性 ----------
    vstats = []
    for v in data["victories"]:
        closures = [closure(p["nodes"]) for p in v["paths"]]
        v["pathClosureIntersection"] = sorted(set.intersection(*closures)) if closures else []
        for p, cl in zip(v["paths"], closures):
            td = defaultdict(int)
            for x in cl:
                td[nodes[x]["trunk"]] += 1
            vstats.append((v, p, cl, dict(td)))

    # ---------- 8 枢纽分析 ----------
    dep_cnt = {i: len(children[i]) for i in nodes}
    hub_dep = sorted(dep_cnt.items(), key=lambda t: (-t[1], t[0]))[:15]
    vfreq = defaultdict(int)
    for v, p, cl, td in vstats:
        for x in cl:
            vfreq[x] += 1
    hub_path = sorted(vfreq.items(), key=lambda t: (-t[1], t[0]))[:15]

    # ---------- 9 V5 约束模式 ----------
    cm = data["constraintMode"]
    domestic = cm["domesticNodes"]
    constraint_rows = []
    for v in data["victories"]:
        if v["id"] == cm["victoryId"]:
            continue
        for p in v["paths"]:
            cl = closure(p["nodes"])
            extra = [d for d in domestic if d not in cl]
            constraint_rows.append((v["id"], p["id"], len(cl), len(cl) + len(extra), extra))

    # ---------- enriched json（供 v1.0 可视化） ----------
    for n in data["nodes"]:
        n["depth"] = depth[n["id"]]
        n["dependents"] = len(children[n["id"]])
    for v in data["victories"]:
        for p, cl in zip(v["paths"], [closure(p["nodes"]) for p in v["paths"]]):
            p["closureSize"] = len(cl)
            p["closure"] = sorted(cl)
    with io.open(ENRICHED, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    # ---------- 报告 ----------
    emit("# 大智算科技树 v0.3 · 图结构校验报告")
    emit()
    emit("- 数据源：`智算科技树-graph-v0.3.json`（由 v0.2.2 设计文档形式化）")
    emit("- 生成物：本报告 + `智算科技树-graph-v0.3.enriched.json`（含深度/被依赖数/路径闭包，供 v1.0 可视化直接消费）")
    emit()
    emit("## 1. 完整性")
    emit()
    emit("- 节点数：**%d**（预期 %d）" % (len(nodes), EXPECT_NODES))
    emit("- 依赖边数：**%d**（含 1 组多选前置的 2 个候选边）" % edges)
    emit("- 胜利路径数：**%d**（预期 %d）" % (npaths, EXPECT_PATHS))
    emit("- 引用完整性：**%s**%s" % ("通过" if not errors else "失败", "" if not errors else ""))
    for e in errors:
        emit("  - ✗ " + e)
    emit()
    emit("## 2. 无环校验（DAG）")
    emit()
    emit("- 拓扑排序覆盖 %d/%d 节点，**%s**" % (len(topo), len(nodes), "无环，DAG 成立" if acyclic else "存在环！"))
    emit("- 全树最大依赖深度：**%d** 层" % max(depth.values()))
    emit()
    emit("## 3. 深度分层（按主干）")
    emit()
    emit("| 主干 | 类型 | 节点数 | 深度范围 |")
    emit("|---|---|---|---|")
    for t in data["trunks"]:
        ds = [depth[i] for i in nodes if nodes[i]["trunk"] == t["id"]]
        if ds:
            emit("| %s %s | %s | %d | %d ~ %d |" % (t["id"], t["name"], t["type"], len(ds), min(ds), max(ds)))
    emit()
    hdep = [depth[i] for i in nodes if nodes[i]["trunk"] == "H"]
    allmin = [min([depth[i] for i in nodes if nodes[i]["trunk"] == t["id"]]) for t in data["trunks"] if t["id"] != "H"]
    emit("- **后发型主干校验点**：H 通智一体入口深度 = %d，其余主干最小入口深度 = %d —— %s（H 显著靠后 = 符合设计意图）"
         % (min(hdep), min(allmin), "通过" if min(hdep) > min(allmin) else "异常"))
    emit()
    emit("## 4. 路径最小性")
    emit()
    if path_issues:
        for x in path_issues:
            emit("- ✗ " + x)
    else:
        emit("- 全部 **%d** 条胜利路径通过最小性检查：路径内任意节点都不是另一节点的传递前置（被蕴含节点由闭包自动覆盖，v0.2.2 文档语义不变）" % npaths)
    emit()
    emit("## 5. 胜利条件可达性（闭包分析）")
    emit()
    emit("闭包总代价 = 点亮该路径实际需要的全部节点数（最小集 + 传递前置）。")
    emit()
    emit("| 胜利 | 路径 | 最小集 | 闭包总代价 | 当前档位 | 闭包主干分布 |")
    emit("|---|---|---|---|---|---|")
    for v, p, cl, td in vstats:
        tds = " ".join("%s:%d" % (k, td[k]) for k in sorted(td))
        emit("| %s %s | %s %s | %d | **%d** | %s | %s |" % (v["id"], v["name"], p["id"], p["name"], len(p["nodes"]), len(cl), p.get("currentTier", ""), tds))
    emit()
    emit("### 各胜利的公共必经子图（该胜利全部路径闭包之交）")
    emit()
    for v in data["victories"]:
        inter = v["pathClosureIntersection"]
        show = sorted(inter, key=lambda x: (-dep_cnt[x], x))[:12]
        extra = "" if len(inter) <= 12 else " 等 %d 个" % len(inter)
        emit("- **%s %s**（%d 个）：%s%s" % (v["id"], v["name"], len(inter),
             "、".join("%s %s" % (x, nodes[x]["name"]) for x in show), extra))
    emit()
    emit("## 6. 枢纽节点分析")
    emit()
    emit("### 6.1 拓扑枢纽（按被依赖数 Top 15）——点亮一个，解锁一片")
    emit()
    emit("| 节点 | 名称 | 主干 | 深度 | 被依赖数 |")
    emit("|---|---|---|---|---|")
    for x, c in hub_dep:
        emit("| %s | %s | %s | %d | %d |" % (x, nodes[x]["name"], nodes[x]["trunk"], depth[x], c))
    emit()
    emit("### 6.2 战略枢纽（按胜利路径闭包出现频次 Top 15）——多条胜利路线的公共投资")
    emit()
    emit("| 节点 | 名称 | 主干 | 出现于路径闭包 |")
    emit("|---|---|---|---|")
    for x, c in hub_path:
        emit("| %s | %s | %s | %d/%d |" % (x, nodes[x]["name"], nodes[x]["trunk"], c, npaths))
    emit()
    emit("## 7. V5 约束模式模拟")
    emit()
    emit("- 国产化约束集（%d 个）：%s" % (len(domestic), "、".join("%s %s" % (d, nodes[d]["name"]) for d in domestic)))
    emit("- 语义：开启后，V1~V4 的每条路径闭包必须额外包含约束集全部节点")
    emit()
    emit("| 胜利 | 路径 | 原闭包 | 约束后闭包 | 增量 | 需追加节点 |")
    emit("|---|---|---|---|---|---|")
    for vid, pid, a, b, extra in constraint_rows:
        emit("| %s | %s | %d | %d | +%d | %s |" % (vid, pid, a, b, b - a, "、".join(extra) if extra else "—（已满足）"))
    emit()
    emit("## 8. 校验总结论")
    emit()
    ok = (not errors) and acyclic and (not path_issues) and len(nodes) == EXPECT_NODES and npaths == EXPECT_PATHS
    emit("- 完整性：%s；无环：%s；路径最小性：%s" % ("通过" if not errors else "失败",
                                                 "通过" if acyclic else "失败",
                                                 "通过" if not path_issues else "失败"))
    emit("- **总结论：%s**" % ("图结构校验全部通过，可直接驱动 v1.0 交互式可视化。" if ok else "存在问题，请见上文 ✗ 项。"))
    emit("- 备注：① 胜利路径为最小集形式（v0.2.2 文档语义不变，被蕴含节点由闭包覆盖）；② D16 的多选前置（A8/A14）在闭包计算中按 A8 分支解析，可视化时建议渲染为双入边。")

    with io.open(REPORT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print("nodes=%d edges=%d paths=%d acyclic=%s errors=%d path_issues=%d"
          % (len(nodes), edges, npaths, acyclic, len(errors), len(path_issues)))
    for e in errors:
        print("ERR:", e.encode("unicode_escape").decode("ascii"))
    for x in path_issues:
        print("PATH:", x.encode("unicode_escape").decode("ascii"))


if __name__ == "__main__":
    main()
