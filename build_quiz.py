# -*- coding: utf-8 -*-
"""
运动生理学刷题应用 · 数据构建脚本
解析 4 个数据源 → 合并去重 → 生成 data.js(window.QUIZ_DATA)

数据源(相对资料库根目录):
  1. _素材与过程\\_notes\\ydsl\\ydsl_modules.json      王瑞元·第六版 454 考点
  2. _素材与过程\\段锐第四版\\_notes\\dr4\\dr4_modules.json  段锐·第四版 350 考点
  3. 运动生理学_新手速学_分题型版.md                   名解180 / 简答77 / 论述25 / 分析例7 / 模板4
  4. 运动生理学_真题学习版.md                          2014-2026 真题(名解表 + 简答/论述/分析)

可重复运行;资料更新后重跑即可。
"""
import hashlib
import json
import re
import shutil
import sys
import unicodedata
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = Path(r"D:\public\运动生理学")
OUT = Path(__file__).resolve().parent

SRC_YDSL = BASE / "_素材与过程" / "_notes" / "ydsl" / "ydsl_modules.json"
SRC_DR4 = BASE / "_素材与过程" / "段锐第四版" / "_notes" / "dr4" / "dr4_modules.json"
SRC_FEN = BASE / "运动生理学_新手速学_分题型版.md"
SRC_ZT = BASE / "运动生理学_真题学习版.md"
FIGS_SRC = BASE / "_build_速学" / "figs"
FIGS_DST = OUT / "figs"

FREQ_RANK = {"高频": 3, "中频": 2, "低频": 1, "未提及": 0}
FREQ_NAME = {3: "高频", 2: "中频", 1: "低频", 0: None}
SRC_ORDER = {"分题型手册": 0, "真题": 1, "王瑞元·第六版": 2, "段锐·第四版": 3}


# ---------------------------------------------------------------- utilities
def norm_key(s):
    """术语/题干归一化:去括注、全角转半角、去空白与标点、小写。用于合并去重。"""
    s = unicodedata.normalize("NFKC", s or "")
    s = re.sub(r"[（(【\[][^）)】\]]*[）)】\]]", "", s)  # 去括注
    s = re.sub(r"[\s,，.。;；:：、·\-*#「」『』""''\"']+", "", s)
    return s.lower()


def parse_years(s):
    """'14&15、2016、2020' → [2014, 2015, 2016, 2020]"""
    years = []
    for tok in re.split(r"[、,，&+\s/]+", s or ""):
        tok = tok.strip()
        if not tok:
            continue
        m = re.fullmatch(r"(\d{2})&(\d{2})", tok)
        if m:
            years += [2000 + int(m.group(1)), 2000 + int(m.group(2))]
            continue
        m = re.fullmatch(r"(\d{4})", tok)
        if m:
            years.append(int(m.group(1)))
            continue
        m = re.fullmatch(r"(\d{2})", tok)
        if m:
            years.append(2000 + int(m.group(1)))
    return sorted(set(y for y in years if 2000 <= y <= 2030))


def card_id(kind, key):
    return kind[0] + hashlib.md5((kind + "|" + key).encode("utf-8")).hexdigest()[:9]


def clean_teacher(t):
    return re.sub(r"\s+", " ", t or "").strip()


# ---- 课程转写噪声清洗 -------------------------------------------------
# 勘误夹注:(原文"×"，按语境应为"×") / ("驱体"，按语境应为"躯体") 等
RE_ERRATUM = re.compile(r"[（(][^（）()]*?(?:原文|按语境|应为|口误|谐音|听写为|实为|该片段|此片段|本片段|完整体现)[^（）()]*[)）]")
# 时间戳:(B 段 708.0-917.0 s) / (461.2～465.7 s) 等
RE_TS = re.compile(r"[（(][^（）()]*?\d{1,4}(?:\.\d+)?\s*[-~—至]\s*\d{1,4}(?:\.\d+)?\s*s(?:\d+)?[)）]|"
                   r"[（(]\s*B\s*段[^（）()]*[)）]")
# 强标记:含这些字样的整行直接丢弃(课程转写痕迹)
NOISE_LINE = re.compile(r"讲师|老师|口译|划书|划到|划句子|逐句|录屏|弹幕|B ?站|片段\s*\d|课程|的同学|咱们|打星|五角星|考频依")


def clean_text(s):
    """去除勘误夹注与时间戳。"""
    s = RE_TS.sub("", s or "")
    s = RE_ERRATUM.sub("", s)
    s = re.sub(r"\s{2,}", " ", s)
    return s.strip()


def clean_body(s):
    """逐行清洗:先去夹注/时间戳,再丢弃含课程转写痕迹的整行。"""
    out = []
    for line in (s or "").splitlines():
        line = clean_text(line)
        if not line:
            continue
        if NOISE_LINE.search(line):
            continue
        out.append(line)
    return "\n".join(out)


def audit_text(cards):
    """最终审计:任何含噪声字样的字符串都不允许写出。返回 [(cardId, field, hit)]"""
    BAD = re.compile(r"讲师|老师|课程|录屏|口译|划书|划到|片段|B ?段|B ?站|弹幕|按语境|原文|五角星|逐句|咱们|up主|UP ?主", re.I)
    hits = []
    def walk(obj, cid, path):
        if isinstance(obj, str):
            m = BAD.search(obj)
            if m:
                hits.append((cid, path, m.group(0), obj[max(0, m.start() - 15):m.end() + 25]))
        elif isinstance(obj, list):
            for i, x in enumerate(obj):
                walk(x, cid, path + "[%d]" % i)
        elif isinstance(obj, dict):
            for k, v in obj.items():
                walk(v, cid, path + "." + str(k))
    for c in cards:
        walk(c, c["id"], "")
    return hits


# ---------------------------------------------------------------- 1. JSON 考点
def load_json(path, book):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    items = []
    for ch in data:
        for kp in ch.get("kps", []):
            qtype = kp.get("qtype") or ""
            freq = kp.get("freq") if kp.get("freq") in FREQ_RANK else "未提及"
            tags = [t for t in ("名词解释", "简答", "论述") if t in qtype]
            base = {
                "src": book,
                "body": clean_body(kp.get("textbook") or ""),
                "ch": (ch.get("title") or "").strip(),
                "freq": freq,
                "qtypes": tags,
            }
            items.append({
                "name": (kp.get("name") or "").strip(),
                "is_term": "名词解释" in qtype,
                "short": "简答" in qtype and "名词解释" not in qtype,
                "essay": "论述" in qtype and "名词解释" not in qtype,
                "base": base,
            })
    return items


SUBJ_PREFIX = ("简述", "论述", "试述", "分析", "说明", "什么是", "何为", "如何", "为什么", "请", "举例", "试论", "简答")


def json_subject_title(name, kind):
    n = name.strip()
    if n.startswith(SUBJ_PREFIX):
        return n
    return ("简述" if kind == "short" else "论述") + n


# ---------------------------------------------------------------- 2. 分题型版
RE_TERM = re.compile(r"^\*\*(.+?)\*\*\s*(★{1,3})\s*$")
CIRCLED = r"[①-⑳㉑-㉟]"
RE_GROUP = re.compile(r"^###\s+(\d+\.\d+)\s+(.+?)(?:（(\d+)\s*条）)?\s*$")
RE_QD = re.compile(r"^####\s+(Q|D)(\d+)\s+(.+?)\s*$")
RE_EX = re.compile(r"^####\s+例\s*(\d+)\s*（(\d{4})）\s*(.+?)\s*$")
RE_IMG = re.compile(r"!\[[^\]]*\]\((figs/[^)]+)\)")


def parse_fen(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    terms, subj, tpls, analysis = [], [], [], []
    part = None      # 'term' | 'short' | 'essay' | 'tpl' | 'ana'
    chapter = None
    cur = None       # 当前条目 dict

    def flush():
        nonlocal cur
        if not cur:
            return
        p = cur.pop("_part", part)
        if p == "term":
            terms.append(cur)
        elif p in ("short", "essay"):
            subj.append(cur)
        elif p == "ana":
            analysis.append(cur)
        cur = None

    for raw in lines:
        line = raw.rstrip()
        m = re.match(r"^##\s+(第[一二三四五]部分)\s*(.+)$", line)
        if m:
            flush()
            p, title = m.group(1), m.group(2)
            part = {"一": "term", "二": "short", "三": "essay", "四": "ana", "五": None}[p[1]]
            chapter = None
            continue
        if part == "term" and re.match(r"^###\s+名解速查表", line):
            part = None  # 速查表与名解重复,跳过
            continue
        if part == "ana" and re.match(r"^###\s+4\.6", line):
            part = None
            continue
        if part in ("short", "essay", "ana"):
            m = re.match(r"^###\s+4\.([1-4])\s*(.+)$", line)
            if m and part == "ana":
                flush()
                tpls.append({"title": m.group(2).strip().replace("：", "：", 1), "body": [], "tpl_no": int(m.group(1))})
                cur = None
                continue
            if re.match(r"^###\s+", line):
                flush()
                g = RE_GROUP.match(line)
                chapter = g.group(2).strip() if g else re.sub(r"^###\s+", "", line).strip()
                cur = None
                continue
        if part is None:
            continue

        if part == "term":
            m = RE_TERM.match(line)
            if m:
                flush()
                cur = {"term": m.group(1).strip(), "stars": len(m.group(2)), "ch": chapter,
                       "def": "", "supp": [], "src": "分题型手册", "_part": "term"}
                continue
            if cur:
                s = line.strip()
                if s.startswith(">"):
                    supp = re.sub(r"^>\s*(补充：)?", "", s).strip()
                    if supp:
                        cur["supp"].append(supp)
                elif s and not cur["def"] and not s.startswith(("---", "|", "![", "#")):
                    cur["def"] = s
                continue

        # short / essay / ana 条目头
        m = RE_QD.match(line)
        if m and part in ("short", "essay"):
            flush()
            kind = "short" if m.group(1) == "Q" else "essay"
            cur = {"kind": kind, "title": m.group(3).strip(), "ch": chapter, "body": [], "src": "分题型手册", "_part": part}
            continue
        m = RE_EX.match(line)
        if m and part == "ana":
            flush()
            cur = {"kind": "analysis", "title": m.group(3).strip(), "year": int(m.group(2)),
                   "ch": None, "body": [], "src": "分题型手册", "_part": "ana"}
            continue
        if cur is not None and isinstance(cur.get("body"), list):
            if re.match(r"^-{3,}\s*$", line):
                flush()
                continue
            cur["body"].append(raw)
            continue
        if cur is not None and part == "term":
            pass
    flush()

    # 模板体补完(tpls 用 body 累积但上面未走通用路径)
    out_tpls = []
    for t in tpls:
        out_tpls.append({"kind": "tpl", "title": t["title"], "body": "\n".join(t["body"]).strip(),
                         "src": "分题型手册"})
    for t in terms:
        t["supp"] = "\n".join(t["supp"]).strip()
        t["def"] = t["def"].strip()
    for s in subj + analysis:
        s["body"] = "\n".join(s["body"]).strip()
    return terms, subj, analysis, out_tpls


# ---------------------------------------------------------------- 3. 真题学习版
RE_ZT_TERM_ROW = re.compile(r"^\|\s*\*\*(.+?)\*\*\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$")
RE_ZT_ITEM = re.compile(r"^\*\*(%s)\d*\s*(.+?)\*\*\s*（([^）]+)）\s*$" % CIRCLED)


def parse_zt(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    terms, subj = [], []
    part = None
    cur = None

    def flush():
        nonlocal cur
        if cur:
            (terms if cur.get("_t") else subj).append(cur)
            cur = None

    for raw in lines:
        line = raw.rstrip()
        m = re.match(r"^##\s+(\d+)\.\s*(.+)$", line)
        if m:
            flush()
            part = {3: "term", 4: "short", 5: "essay", 6: "ana"}.get(int(m.group(1)))
            continue
        if part is None:
            continue
        if re.match(r"^###\s+6\.2", line):
            flush()
            part = "tpl62"
            continue
        if re.match(r"^##\s+7\.", line):
            flush()
            part = None
            continue
        if re.match(r"^###\s+", line):
            flush()
            continue

        if part == "term":
            m = RE_ZT_TERM_ROW.match(line)
            if m and m.group(1) != "名词":
                terms.append({"term": m.group(1).strip(), "years_raw": m.group(2).strip(),
                              "body": m.group(3).strip(), "src": "真题", "ch": None})
            continue

        m = RE_ZT_ITEM.match(line)
        if m:
            flush()
            kind = {"short": "short", "essay": "essay", "ana": "analysis"}[part if part in ("short", "essay", "ana") else "short"]
            # 一行多题时,年份取整行所有括注(非年份的括注会被 parse_years 过滤)
            all_par = "、".join(re.findall(r"（([^（）]+)）", line))
            title = m.group(2).replace("**", "").strip()
            cur = {"kind": kind if part != "tpl62" else "tpl",
                   "title": title, "years_raw": all_par or m.group(3).strip(),
                   "body": [], "src": "真题", "ch": None}
            continue
        if part == "tpl62":
            # 模板整节作为一张卡:不按条目切,遇到条目头也并入正文
            if cur is None:
                cur = {"kind": "tpl", "title": "研究设计题模板(八步)", "years_raw": "",
                       "body": [], "src": "真题", "ch": None}
            cur["body"].append(raw)
            continue
        if cur is not None:
            if re.match(r"^-{3,}\s*$", line):
                continue
            cur["body"].append(raw)
    flush()

    out_terms = [{"term": t["term"], "years": parse_years(t["years_raw"]), "body": t["body"],
                  "src": "真题", "ch": t["ch"]} for t in terms]
    out_subj = [{"kind": s["kind"], "title": s["title"], "years": parse_years(s["years_raw"]),
                 "body": "\n".join(s["body"]).strip(), "src": "真题", "ch": s["ch"]} for s in subj]
    return out_terms, out_subj


# ---------------------------------------------------------------- 合并
class Merger:
    def __init__(self):
        self.cards = {}   # id -> card
        self.order = []   # id 顺序

    def add(self, kind, key, payload):
        cid = card_id(kind, key)
        if cid not in self.cards:
            self.cards[cid] = {"id": cid, "kind": kind, "answers": [], "years": [],
                               "freq_rank": -1, "books": [], "qtypes": [], "stars": 0}
            self.order.append(cid)
        c = self.cards[cid]
        if payload not in c["answers"]:
            c["answers"].append(payload)
        c["years"] = sorted(set(c["years"]) | set(payload.pop("years_add", [])))
        c["freq_rank"] = max(c["freq_rank"], payload.pop("freq_rank_add", -1))
        for b in payload.pop("books_add", []):
            if b not in c["books"]:
                c["books"].append(b)
        for q in payload.pop("qtypes_add", []):
            if q not in c["qtypes"]:
                c["qtypes"].append(q)
        c["stars"] = max(c["stars"], payload.pop("stars_add", 0))
        return c

    def sorted_cards(self):
        cards = [self.cards[i] for i in self.order]
        prio = {"term": 0, "short": 1, "essay": 2, "analysis": 3, "tpl": 4}
        cards.sort(key=lambda c: (prio[c["kind"]], c["answers"][0].get("ch") or ""))
        for i, c in enumerate(cards):
            c["no"] = i + 1
        return cards


def build():
    merger = Merger()
    stats = {}

    # --- JSON 考点 ---
    for path, book in ((SRC_YDSL, "王瑞元·第六版"), (SRC_DR4, "段锐·第四版")):
        items = load_json(path, book)
        n_term = n_short = n_essay = 0
        for it in items:
            base = dict(it["base"])
            freq_rank = FREQ_RANK.get(base["freq"], 0)
            if it["is_term"] or not (it["short"] or it["essay"]):
                key = norm_key(it["name"])
                if not key:
                    continue
                merger.add("term", key, {"src": book, "body": base["body"],
                                         "ch": base["ch"], "term": it["name"],
                                         "freq_rank_add": freq_rank,
                                         "books_add": [{"b": book, "c": base["ch"]}],
                                         "qtypes_add": base["qtypes"] or ["未提及"]})
                n_term += 1
            else:
                kind = "short" if it["short"] else "essay"
                title = json_subject_title(it["name"], kind)
                key = norm_key(title)
                if not key:
                    continue
                merger.add(kind, key, {"src": book, "body": base["body"],
                                       "ch": base["ch"], "title": title,
                                       "freq_rank_add": freq_rank,
                                       "books_add": [{"b": book, "c": base["ch"]}],
                                       "qtypes_add": base["qtypes"] or [kind]})
                if kind == "short":
                    n_short += 1
                else:
                    n_essay += 1
        stats[book] = {"考点": len(items), "名解卡": n_term, "简答卡": n_short, "论述卡": n_essay}

    # --- 分题型版 ---
    fen_terms, fen_subj, fen_ana, fen_tpls = parse_fen(SRC_FEN)
    stats["分题型手册"] = {"名解": len(fen_terms), "简答": sum(1 for s in fen_subj if s["kind"] == "short"),
                          "论述": sum(1 for s in fen_subj if s["kind"] == "essay"),
                          "分析例": len(fen_ana), "模板": len(fen_tpls)}
    for t in fen_terms:
        key = norm_key(t["term"])
        merger.add("term", key, {"src": "分题型手册", "def": clean_text(t["def"]),
                                 "supp": clean_text(t["supp"]),
                                 "term": clean_text(t["term"]), "ch": t["ch"], "stars": t["stars"],
                                 "stars_add": t["stars"],
                                 "books_add": [{"b": "王瑞元·第六版(分题型手册)", "c": t["ch"]}]})
    for s in fen_subj:
        key = norm_key(s["title"])
        merger.add(s["kind"], key, {"src": "分题型手册", "body": clean_body(s["body"]),
                                    "title": clean_text(s["title"]),
                                    "ch": s["ch"],
                                    "books_add": [{"b": "王瑞元·第六版(分题型手册)", "c": s["ch"]}]})
    for a in fen_ana:
        key = norm_key(a["title"])
        merger.add("analysis", key, {"src": "分题型手册", "body": clean_body(a["body"]),
                                     "title": clean_text(a["title"]),
                                     "ch": "真题拆解", "years_add": [a["year"]],
                                     "books_add": [{"b": "真题", "c": str(a["year"]) + " 分析题"}]})
    for t in fen_tpls:
        key = norm_key(t["title"])
        merger.add("tpl", key, {"src": "分题型手册", "body": t["body"], "title": t["title"],
                                "ch": "分析题模板"})

    # --- 真题学习版 ---
    zt_terms, zt_subj = parse_zt(SRC_ZT)
    stats["真题"] = {"名解": len(zt_terms),
                    "简答": sum(1 for s in zt_subj if s["kind"] == "short"),
                    "论述": sum(1 for s in zt_subj if s["kind"] == "essay"),
                    "分析": sum(1 for s in zt_subj if s["kind"] == "analysis"),
                    "模板": sum(1 for s in zt_subj if s["kind"] == "tpl")}
    for t in zt_terms:
        key = norm_key(t["term"])
        merger.add("term", key, {"src": "真题", "body": clean_text(t["body"]),
                                 "term": clean_text(t["term"]),
                                 "years_add": t["years"], "books_add": [{"b": "真题", "c": "名词解释"}]})
    for s in zt_subj:
        key = norm_key(s["title"])
        merger.add(s["kind"], key, {"src": "真题", "body": clean_body(s["body"]),
                                    "title": clean_text(s["title"]),
                                    "years_add": s["years"],
                                    "books_add": [{"b": "真题", "c": s["kind"] + "真题"}]})

    cards = merger.sorted_cards()

    # --- 课程转写噪声审计:含「讲师/老师/课程/口译」等字样的文本不允许写出 ---
    hits = audit_text(cards)
    if hits:
        print("!!! 审计发现噪声文本 %d 处:" % len(hits))
        for cid, path, hit, ctx in hits[:25]:
            print("   %s %s [%s] …%s…" % (cid, path, hit, ctx))
    else:
        print("审计:全部文本无课程/讲师类噪声 ✓")

    # --- 名词解释卡的 def(用于客观题生成与反序闪卡) ---
    for c in cards:
        if c["kind"] != "term":
            continue
        for a in c["answers"]:
            if a.get("def"):
                c["def"] = a["def"]
                c["defSrc"] = a["src"]
                break
            body = (a.get("body") or "").strip()
            if body and a["src"] in ("王瑞元·第六版", "段锐·第四版"):
                first = re.sub(r"^-\s*", "", body.splitlines()[0]).strip()
                first = first.strip("「」").strip()
                c.setdefault("def", None)
                if first and "def" not in c:
                    pass
        if "def" not in c:
            # 退而求其次:取 JSON 教材要点第一条
            for a in c["answers"]:
                body = (a.get("body") or "").strip()
                if body:
                    first = re.sub(r"^[-*]\s*", "", body.splitlines()[0]).strip().strip("「」").strip()
                    c["def"] = first
                    c["defSrc"] = a["src"]
                    break
        c["term"] = next((a["term"] for a in sorted(c["answers"], key=lambda x: SRC_ORDER.get(x["src"], 9))
                          if a.get("term")), None)
        if not c["term"]:
            # 用答案里出现频率最高的书来源的 ch,反正没有 term 字段就不显示术语
            c["term"] = "(未命名术语)"
    for c in cards:
        c["freq"] = FREQ_NAME.get(c["freq_rank"])
        c.pop("freq_rank", None)
        # 清理答案中仅内部使用的键
        for a in c["answers"]:
            for k in ("term", "years_raw"):
                a.pop(k, None)

    return cards, stats


def copy_figs():
    if FIGS_SRC.is_dir():
        if FIGS_DST.exists():
            shutil.rmtree(FIGS_DST)
        shutil.copytree(FIGS_SRC, FIGS_DST)
        return len(list(FIGS_DST.glob("*.svg")))
    return 0


def main():
    cards, stats = build()
    figs = copy_figs()

    used_figs = set()
    for c in cards:
        for a in c["answers"]:
            for m in RE_IMG.finditer(a.get("body") or ""):
                used_figs.add(m.group(1))
            for k in ("def", "supp"):
                if a.get(k):
                    a[k] = RE_IMG.sub("", a[k]).strip()

    counts = {}
    for c in cards:
        counts[c["kind"]] = counts.get(c["kind"], 0) + 1

    data = {
        "meta": {
            "name": "运动生理学刷题",
            "built": __import__("datetime").date.today().isoformat(),
            "counts": counts,
            "total": len(cards),
            "figs": figs,
            "stats": stats,
        },
        "cards": cards,
    }
    out = OUT / "data.js"
    with open(out, "w", encoding="utf-8") as f:
        f.write("/* 由 build_quiz.py 生成,请勿手改 */\n")
        f.write("window.QUIZ_DATA = ")
        f.write(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
        f.write(";\n")

    print("=== 解析计数核对 ===")
    for src, s in stats.items():
        print(" ", src, s)
    print("=== 合并后卡片 ===")
    kind_name = {"term": "名词解释", "short": "简答", "essay": "论述", "analysis": "分析", "tpl": "模板"}
    for k, n in counts.items():
        print("  %s: %d" % (kind_name[k], n))
    print("  合计:", len(cards))
    multi = sum(1 for c in cards if len(c["answers"]) > 1)
    print("  多来源合并卡:", multi)
    print("  引用插图:", len(used_figs), "张;figs 目录:", figs, "个 svg")
    print("  data.js 大小: %.2f MB" % (out.stat().st_size / 1048576))


if __name__ == "__main__":
    main()
