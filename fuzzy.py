"""模糊采集 NLP 和文件解析"""
import re
import io
import zipfile
import datetime
from pathlib import Path
from xml.etree import ElementTree

# Excel 序列日期基准（1900 日期系统，因为 1900 不是闰年的历史 bug 实际起点是 1899-12-30）
_EXCEL_EPOCH = datetime.datetime(1899, 12, 30)
_DATE_FORMATS = ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%m/%d/%Y", "%Y.%m.%d", "%Y年%m月%d日")


def _normalize_date(val):
    """把 Excel 序列号、各种常见日期文本归一化为 YYYY-MM-DD；不可识别就原样返回。"""
    if val is None:
        return ""
    if not isinstance(val, str):
        try:
            val = str(val)
        except Exception:
            return ""
    s = val.strip()
    if not s:
        return ""
    # 1) Excel 序列日期（纯数字或单点小数）
    digits_only = s.replace(".", "", 1)
    if digits_only.isdigit():
        try:
            d = _EXCEL_EPOCH + datetime.timedelta(days=float(s))
            return d.strftime("%Y-%m-%d")
        except (ValueError, OverflowError):
            pass
    # 2) 常见日期格式
    for fmt in _DATE_FORMATS:
        try:
            return datetime.datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return s  # 完全无法识别就原样返回


def split_fuzzy_sections(text):
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    parts = re.split(r"\n\s*\n+|(?=\n?乐颜～[:：]?)", cleaned)
    sections = [part.replace("乐颜～:", "").replace("乐颜～：", "").strip() for part in parts if part.strip()]
    return sections or ([cleaned] if cleaned else [])


def find_first(patterns, text, default=""):
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            return match.group(1).strip()
    return default


def infer_company(section):
    lines = [line.strip() for line in section.splitlines() if line.strip()]
    for line in lines[:4]:
        if any(word in line for word in ["厂", "公司", "物流", "新能源", "车标"]):
            return re.sub(r"招聘|大量|急招|涨工资了|周结|长白班|可周结", "", line).strip(" ：:，,")
    return lines[0][:30] if lines else "待确认企业"


def infer_role(section):
    role = find_first(
        [r"岗位[:：]\s*([^\n]+)", r"招聘岗位[:：]\s*([^\n]+)", r"急招[！!]*\s*([^\n，,。；;]+)", r"(\S*工(?:/[^，。\n]+)*)"],
        section, "普工",
    )
    return role[:60]


def infer_type(section):
    if "日结" in section:
        return "日结工"
    if "暑假" in section or "寒假" in section or "旺季" in section:
        return "季节工"
    if "短期" in section or "周结" in section:
        return "短期工"
    return "长期工"


def infer_salary(section):
    salary = find_first(
        [r"薪资待遇[:：]?\s*([^\n]+)", r"工价[:：]?\s*([^\n]+)", r"(\d{2}(?:\+\d+)?\s*元?\s*/?\s*(?:小时|时|h|H))", r"(综合工资\s*\d+\s*[-到—]\s*\d+)", r"(\d+\s*\*\s*12\s*=\s*\d+\s*/?天?)"],
        section, "",
    )
    return salary[:100]


def infer_age(section):
    return find_first([r"年龄[:：]?\s*(\d{2}\s*[-~到—]\s*\d{2}\s*岁?)", r"(\d{2}\s*[-~到—]\s*\d{2}\s*周?岁?)"], section, "")


def infer_location(section, company):
    for place in ["柳东官塘", "柳东花岭", "柳东花玲", "柳州市鱼峰区车园", "柳东", "官塘", "花岭", "花玲"]:
        if place in section or place in company:
            return place
    return "待确认地点"


def infer_headcount(section):
    count = find_first([r"需求\s*(\d+)\s*人", r"招聘\s*(\d+)\s*人", r"(\d+)\s*名"], section, "")
    return int(count) if count.isdigit() else 20


def parse_fuzzy_demands(text):
    results = []
    for section in split_fuzzy_sections(text):
        company = infer_company(section)
        results.append({
            "company": company,
            "product": find_first([r"产品[:：]?\s*([^\n，,。；;]+)", r"主营[:：]?\s*([^\n，,。；;]+)"], section, ""),
            "role": infer_role(section),
            "type": infer_type(section),
            "location": infer_location(section, company),
            "start": find_first([r"开始(?:日期|时间)?[:：]\s*(\d{4}-\d{2}-\d{2})"], section, "2026-05-13"),
            "end": find_first([r"结束(?:日期|时间)?[:：]\s*(\d{4}-\d{2}-\d{2})"], section, ""),
            "headcount": infer_headcount(section),
            "signed": 0,
            "salary": infer_salary(section),
            "age": infer_age(section),
            "genderRequired": "男" if "男" in section[:200] else ("女" if "女" in section[:200] else ""),
            "needId": find_first([r"证件[:：]?\s*(\S+)", r"(需身份证|带身份证|证件照)"], section, ""),
            "needExperience": find_first([r"(?:是否|需要|要求)\s*(\S*经验)", r"经验\s*(\S*要求)"], section, ""),
            "hasShifts": find_first([r"是否\s*(\S*倒班)", r"(两班倒|三班倒)", r"(倒班)"], section, ""),
            "hasMeal": find_first([r"(\S*包吃|\S*工作餐|\S*有食堂|\S*免费餐)"], section, ""),
            "hasDorm": find_first([r"(\S*包住|\S*提供住宿|\S*有宿舍)", r"(\S*住宿费)"], section, ""),
            "notes": section[:1800],
            "confidence": 72,
            "sourceText": section,
        })
    return results


def parse_fuzzy_workers(text):
    items = []
    for section in split_fuzzy_sections(text):
        lines = [line.strip() for line in section.splitlines() if line.strip()]
        first = lines[0] if lines else ""
        name = find_first([r"姓名[:：]\s*([^\s，,。；;\n]+)", r"我叫\s*([^\s，,。；;\n]+)"], section, first[:12] or "待确认姓名")
        phone = find_first([r"(1[3-9]\d{9})"], section, "")
        age = find_first([r"年龄[:：]?\s*(\d{2})", r"(\d{2})\s*岁"], section, "")
        gender = "女" if "女" in section else ("男" if "男" in section else "")
        location = infer_location(section, "")
        role = find_first([r"想做[:：]?\s*([^\n，,。；;]+)", r"期望岗位[:：]\s*([^\n]+)", r"找\s*([^\n，,。；;]+)"], section, "")
        period = "长期稳定" if "长期" in section else ("7-15天" if "短期" in section or "周结" in section else "1-3个月")
        tags = []
        for keyword in ["接受夜班", "不接受夜班", "需要住宿", "不需要住宿", "坐班", "周结", "注塑", "质检", "普工", "物流", "汽配"]:
            if keyword in section:
                tags.append(keyword)
        items.append({
            "name": name, "phone": phone, "gender": gender, "age": age,
            "location": location, "available": find_first([r"可到岗[:：]?\s*([^\n，,。；;]+)", r"(今天|明天|下周|现在)可?到岗"], section, "待确认"),
            "period": period, "expectedRole": role,
            "salary": find_first([r"期望薪资[:：]?\s*([^\n]+)", r"(\d{4,5}以上)"], section, ""),
            "score": 75, "tags": tags, "note": section[:1200], "source": "模糊采集", "confidence": 68,
            "registrationDate": find_first([r"报名日期[:：]\s*(\d{4}-\d{2}-\d{2})", r"报名[:：]\s*(\d{4}-\d{2}-\d{2})"], section, ""),
            "interviewDate": find_first([r"面试日期[:：]\s*(\d{4}-\d{2}-\d{2})", r"面试[:：]\s*(\d{4}-\d{2}-\d{2})"], section, ""),
            "desiredStartDate": find_first([r"希望到岗[:：]\s*(\d{4}-\d{2}-\d{2})", r"到岗日期[:：]\s*([^\n]+)"], section, ""),
            "previousJob": find_first([r"上份工作[:：]?\s*([^\n，,。；;]+)", r"以前做[:：]?\s*([^\n，,。；;]+)"], section, ""),
            "education": find_first([r"学历[:：]?\s*([^\n，,。；;]+)"], section, ""),
            "hasInterviewed": "", "hasEmployed": "", "employDate": "",
            "desiredCompany": find_first([r"希望单位[:：]?\s*([^\n，,。；;]+)", r"想去[:：]?\s*([^\n，,。；;]+)"], section, ""),
            "desiredRole": role,
            "acceptShifts": "是" if "接受倒班" in section or "能倒班" in section else ("否" if "不接受夜班" in section or "不能倒班" in section else ""),
            "acceptDorm": "是" if "需要住宿" in section or "要住宿" in section else ("否" if "不需要住宿" in section or "不住宿" in section else ""),
            "acceptSocialInsurance": find_first([r"社保[:：]?\s*([^\n，,。；;]+)", r"[是否]*接受社保"], section, ""),
            "desiredArea": find_first([r"希望区域[:：]?\s*([^\n，,。；;]+)", r"想去[^\n的]+(?:柳东|鹿寨|阳和|新兴|河西|柳北)"], section, ""),
            "otherWishes": find_first([r"其他[:：]?\s*([^\n]+)"], section, ""),
        })
    return items


def decode_text_bytes(raw):
    for encoding in ("utf-8-sig", "utf-8", "gb18030", "gbk"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="ignore")


def strip_xml_text(xml_bytes):
    root = ElementTree.fromstring(xml_bytes)
    return "".join(root.itertext())


def io_bytes(raw):
    return io.BytesIO(raw)


def extract_docx_text(raw):
    with zipfile.ZipFile(io_bytes(raw)) as archive:
        names = [name for name in archive.namelist() if name.startswith("word/") and name.endswith(".xml")]
        texts = []
        for name in names:
            if name in ("word/document.xml",) or name.startswith("word/header") or name.startswith("word/footer"):
                texts.append(strip_xml_text(archive.read(name)))
        return "\n".join(texts)


def extract_xlsx_text(raw):
    with zipfile.ZipFile(io_bytes(raw)) as archive:
        shared_strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            for si in root.findall("x:si", ns):
                shared_strings.append("".join(si.itertext()))
        sheet_names = sorted(name for name in archive.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", name))
        rows = []
        ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        for sheet in sheet_names:
            root = ElementTree.fromstring(archive.read(sheet))
            for row in root.findall(".//x:row", ns):
                cells = []
                for cell in row.findall("x:c", ns):
                    value_node = cell.find("x:v", ns)
                    inline_node = cell.find("x:is", ns)
                    value = ""
                    if inline_node is not None:
                        value = "".join(inline_node.itertext())
                    elif value_node is not None:
                        value = value_node.text or ""
                        if cell.attrib.get("t") == "s" and value.isdigit():
                            idx = int(value)
                            value = shared_strings[idx] if idx < len(shared_strings) else value
                    cells.append(value.strip())
                if any(cells):
                    rows.append(cells)
        return rows


def extract_uploaded_text(filename, raw):
    suffix = Path(filename or "").suffix.lower()
    if suffix in {".txt", ".md", ".csv", ".json"}:
        return decode_text_bytes(raw)
    if suffix == ".docx":
        return extract_docx_text(raw)
    if suffix == ".xlsx":
        rows = extract_xlsx_text(raw)
        return "\n".join(" | ".join(cells) for cells in rows)
    if suffix == ".xls":
        raise ValueError("暂不支持旧版 .xls，请先另存为 .xlsx 后上传。")
    raise ValueError("暂不支持该文件格式，请上传 .xlsx、.docx、.csv、.txt、.md 或 .json。")


def parse_xlsx_demands(rows):
    if not rows:
        return []
    headers = [str(h).strip() for h in rows[0]]
    header_map = {
        "企业名称": "company", "企业产品": "product", "岗位名称": "role",
        "需求人数": "headcount", "证件需要与否": "needId", "工作地点": "location",
        "月薪": "salary", "年龄要求": "age", "性别要求": "genderRequired",
        "是否需要岗位经验": "needExperience", "是否倒班": "hasShifts",
        "有无吃": "hasMeal", "有无住": "hasDorm", "其他用工要求": "notes",
        "用工类型": "type", "开始日期": "start", "结束日期": "end", "已报名": "signed",
    }
    col_map = {}
    for i, h in enumerate(headers):
        if h in header_map:
            col_map[header_map[h]] = i
    if "company" not in col_map or "role" not in col_map:
        return None

    def _cell(col_map, key, cells, default=""):
        idx = col_map.get(key, -1)
        if 0 <= idx < len(cells):
            v = cells[idx]
            if v is None:
                return default
            try:
                return str(v).strip()
            except Exception:
                return default
        return default

    results = []
    MAX_XLSX_ITEMS = 200
    for cells in rows[1:]:
        if len(results) >= MAX_XLSX_ITEMS:
            break
        if not any((c or "").strip() for c in cells):
            continue
        headcount_val = _cell(col_map, "headcount", cells, "20")
        results.append({
            "company": _cell(col_map, "company", cells, ""),
            "product": _cell(col_map, "product", cells, ""),
            "role": _cell(col_map, "role", cells, ""),
            "type": _cell(col_map, "type", cells, "长期工"),
            "location": _cell(col_map, "location", cells, ""),
            "start": _normalize_date(_cell(col_map, "start", cells, "")) or "2026-05-13",
            "end": _normalize_date(_cell(col_map, "end", cells, "")),
            "headcount": int(headcount_val) if headcount_val.isdigit() else 20,
            "signed": 0,
            "salary": _cell(col_map, "salary", cells, ""),
            "age": _cell(col_map, "age", cells, ""),
            "genderRequired": _cell(col_map, "genderRequired", cells, ""),
            "needId": _cell(col_map, "needId", cells, ""),
            "needExperience": _cell(col_map, "needExperience", cells, ""),
            "hasShifts": _cell(col_map, "hasShifts", cells, ""),
            "hasMeal": _cell(col_map, "hasMeal", cells, ""),
            "hasDorm": _cell(col_map, "hasDorm", cells, ""),
            "notes": _cell(col_map, "notes", cells, ""),
            "confidence": 90, "sourceText": "",
        })
    return results


def parse_xlsx_workers(rows):
    if not rows:
        return []
    headers = [str(h).strip() for h in rows[0]]
    header_map = {
        "报名日期": "registrationDate", "面试日期": "interviewDate",
        "希望到岗日期": "desiredStartDate", "上份工作岗位": "previousJob",
        "姓名": "name", "联系方式": "phone", "性别": "gender", "年龄": "age",
        "学历": "education", "已到面": "hasInterviewed", "已入职": "hasEmployed",
        "入职日期": "employDate", "希望月薪": "salary",
        "希望工作单位": "desiredCompany", "希望工作岗位": "expectedRole",
        "是否接受倒班": "acceptShifts", "是否接受住宿": "acceptDorm",
        "是否接受社保": "acceptSocialInsurance",
        "希望工作区域": "desiredArea", "其他个人希望": "otherWishes",
        "所在地区": "location", "可到岗时间": "available", "期望周期": "period",
    }
    col_map = {}
    for i, h in enumerate(headers):
        if h in header_map:
            col_map[header_map[h]] = i
    if "name" not in col_map:
        return None

    def _cell(col_map, key, cells, default=""):
        idx = col_map.get(key, -1)
        if 0 <= idx < len(cells):
            v = cells[idx]
            if v is None:
                return default
            try:
                return str(v).strip()
            except Exception:
                return default
        return default

    items = []
    MAX_XLSX_ITEMS = 200
    for cells in rows[1:]:
        if len(items) >= MAX_XLSX_ITEMS:
            break
        if not any((c or "").strip() for c in cells):
            continue
        items.append({
            "name": _cell(col_map, "name", cells, ""), "phone": _cell(col_map, "phone", cells, ""),
            "gender": _cell(col_map, "gender", cells, ""), "age": _cell(col_map, "age", cells, ""),
            "education": _cell(col_map, "education", cells, ""), "location": _cell(col_map, "location", cells, ""),
            "available": _cell(col_map, "available", cells, ""), "period": _cell(col_map, "period", cells, "长期稳定"),
            "expectedRole": _cell(col_map, "expectedRole", cells, ""), "salary": _cell(col_map, "salary", cells, ""),
            "registrationDate": _normalize_date(_cell(col_map, "registrationDate", cells, "")),
            "interviewDate": _normalize_date(_cell(col_map, "interviewDate", cells, "")),
            "desiredStartDate": _normalize_date(_cell(col_map, "desiredStartDate", cells, "")),
            "previousJob": _cell(col_map, "previousJob", cells, ""),
            "hasInterviewed": _cell(col_map, "hasInterviewed", cells, ""),
            "hasEmployed": _cell(col_map, "hasEmployed", cells, ""),
            "employDate": _normalize_date(_cell(col_map, "employDate", cells, "")),
            "desiredCompany": _cell(col_map, "desiredCompany", cells, ""),
            "desiredRole": _cell(col_map, "expectedRole", cells, ""),
            "acceptShifts": _cell(col_map, "acceptShifts", cells, ""),
            "acceptDorm": _cell(col_map, "acceptDorm", cells, ""),
            "acceptSocialInsurance": _cell(col_map, "acceptSocialInsurance", cells, ""),
            "desiredArea": _cell(col_map, "desiredArea", cells, ""),
            "otherWishes": _cell(col_map, "otherWishes", cells, ""),
            "score": 75, "tags": [], "note": "", "source": "模版导入", "confidence": 90,
        })
    return items
terviewed": _cell(col_map, "hasInterviewed", cells, ""),
            "hasEmployed": _cell(col_map, "hasEmployed", cells, ""),
            "employDate": _normalize_date(_cell(col_map, "employDate", cells, "")),
            "desiredCompany": _cell(col_map, "desiredCompany", cells, ""),
            "desiredRole": _cell(col_map, "expectedRole", cells, ""),
            "acceptShifts": _cell(col_map, "acceptShifts", cells, ""),
            "acceptDorm": _cell(col_map, "acceptDorm", cells, ""),
            "acceptSocialInsurance": _cell(col_map, "acceptSocialInsurance", cells, ""),
            "desiredArea": _cell(col_map, "desiredArea", cells, ""),
            "otherWishes": _cell(col_map, "otherWishes", cells, ""),
            "score": 75, "tags": [], "note": "", "source": "模版导入", "confidence": 90,
        })
    return items
