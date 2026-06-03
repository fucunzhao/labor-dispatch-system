"""种子数据和业务数据加载"""
import json
from db import connect
from auth import scoped_where, require_login
from models import row_to_demand, row_to_worker, row_to_knowledge
from knowledge import sync_knowledge_entries


DEMANDS = [
    {"company": "柳东注塑厂（耀世）", "role": "注塑包装普工", "type": "短期工", "location": "柳东", "start": "2026-05-13", "end": "2026-06-13", "headcount": 30, "signed": 0, "salary": "16+1元/小时，综合5000-5500元", "age": "20-45岁", "notes": "男女不限，初中及以上，身体健康，无近视、色盲，两班倒8:30-20:30/20:30-8:30。主要剪水口、修毛边、打包装，小件产品，部分坐班。白班包工作餐，夜班无餐补贴5元/班，提供住宿。1元需做满一个月。面试穿长裤、运动鞋，女生扎头发，谢绝短裤、背心、拖鞋、凉鞋、披头散发。"},
    {"company": "柳东物流公司（方达）", "role": "物流普工", "type": "长期工", "location": "柳东", "start": "2026-05-13", "end": "", "headcount": 40, "signed": 0, "salary": "17元/小时，204元/天，综合5000-6000元", "age": "18-45岁", "notes": "男女不限，两班倒8:00-20:00/20:00-8:00，吃饭算工时。包吃包住，自助餐食堂，水电平摊。面试时间下午3:30，驻厂欧主管15677228332。"},
    {"company": "柳东官塘内饰厂（精特）", "role": "包覆工", "type": "长期工", "location": "柳东官塘", "start": "2026-05-13", "end": "", "headcount": 25, "signed": 0, "salary": "熟练工20元/小时，新手17元/小时，熟手1个月内转计件，计件可1万+", "age": "20-53岁", "notes": "男性优先，熟手年龄可放宽。每周可预支500元。包工作餐，提供集体宿舍，水电费平摊。面试必须带身份证原件，上午9点面试。"},
    {"company": "柳东花岭注塑厂（飞塑）", "role": "质检/普工/全检", "type": "短期工", "location": "柳东花岭", "start": "2026-05-13", "end": "2026-06-13", "headcount": 45, "signed": 0, "salary": "全检16元/小时，其他岗位面议", "age": "20-40岁", "notes": "坐班，可周结，不用体检，工作轻松，氛围好，智能管理车间。男女不限，能接受倒班。岗位：质检无需经验女工，普工无需经验男女不限，全检需经验16元/小时。包工作餐，住宿150元/月，水电平摊，宿舍安合华庭在厂区对面。上班时间8:30-20:30/20:30-8:30，上午11点面试。"},
    {"company": "柳东汽配厂（龙发）", "role": "上下挂岗位", "type": "长期工", "location": "柳东", "start": "2026-05-13", "end": "", "headcount": 20, "signed": 0, "salary": "17元/小时", "age": "20-45岁", "notes": "长白班，白班8-12小时，只要男性。包工作餐，包住宿，水电费平摊，员工宿舍在厂内。暂时不体检，不用经验，要求服从安排、吃苦耐劳、反应灵敏。吃饭不算工时。上午8:50面试，面试不通过不报销来回路费、油费、餐费等。"},
    {"company": "柳东汽配厂（震法）", "role": "手包管/开机学徒/套管打胶带", "type": "长期工", "location": "柳东", "start": "2026-05-13", "end": "", "headcount": 12, "signed": 0, "salary": "16-17元/小时，部分岗位后期计件", "age": "25-38岁", "notes": "长白班。手包管急招，28-38岁男女不限，16元/小时，适合有手工经验、耐心、手灵活，做满三个月后须计件，上班8:30-17:00，中午吃饭半小时不算工时，不加班，计件后不定时加班。挤出线开机学徒1名，28-38岁，有开机经验优先，17元/小时，吃饭不扣工时，8:30-17:30不定时加班。套管打胶带1名男生，25-35岁，人灵活，8:30-17:00，不定时加班。包吃，提供住宿安合华庭，骑车15分钟。下午2点面试。"},
    {"company": "柳东花岭装配岗位（超力）", "role": "装配工", "type": "短期工", "location": "柳东花岭", "start": "2026-05-13", "end": "2026-06-13", "headcount": 35, "signed": 0, "salary": "17元/小时，每天有效工时10小时", "age": "20-48岁", "notes": "长白班，可周结，男工。包吃，提供住宿，住宿走路5分钟。上班8:00-20:00，公司包吃两餐；上两小时休息10分钟，中午吃饭1小时，下午吃饭40分钟。第一个月自备全黑色劳保鞋，第二个月公司发劳保用品。工期稳定，工价不变。先试岗后体检，一个月内体检报告也可以。生产交换器总成和空调总成。上午11点面试。"},
    {"company": "柳东汽配厂（新纪元）", "role": "注塑操作工/检验员", "type": "长期工", "location": "柳州市鱼峰区车园", "start": "2026-05-13", "end": "", "headcount": 30, "signed": 0, "salary": "17+1元/小时，约216元/天，转正购买五险", "age": "20-45岁", "notes": "注塑操作工20-45岁，倒班，手脚麻利，服从安排。检验员1名，25-40岁女工，倒班，认真负责，有注塑件外观检验经验优先。每天10-12小时，吃饭算工时，两班倒。试工一天后体检，有体检报告也行。下午2点面试。面试穿长裤、运动鞋，女生扎头发，谢绝短裤、裙子、拖鞋、凉鞋、高跟鞋。"},
    {"company": "柳东花岭（星心）", "role": "注塑工", "type": "长期工", "location": "柳东花岭", "start": "2026-05-13", "end": "", "headcount": 35, "signed": 0, "salary": "17元/小时", "age": "18-45岁", "notes": "开注塑机生产产品。男女不限，能适应两班倒，有汽配注塑行业经验优先，有经验可放宽年龄。主要剪水口、修毛边、打包装，工作简单易上手。白班提供两餐，夜宵有牛奶面包等食物。下午3点面试。面试穿长裤、运动鞋，女生扎头发，谢绝短裤、背心、拖鞋、凉鞋、披头散发。"},
    {"company": "柳东花玲车标厂（贝驰）", "role": "车标生产岗位", "type": "短期工", "location": "柳东花玲", "start": "2026-05-13", "end": "2026-06-13", "headcount": 40, "signed": 0, "salary": "17元/小时，夜班补贴15元/晚，综合5000-5500元", "age": "20-45岁", "notes": "周结，空调车间，坐班，两班倒8:30-20:30/20:30-8:30。主要生产汽车小件车标。女工优先，手脚灵活，熟手年龄可放宽。包工作餐，提供住宿，宿舍走路2分钟。上午10点面试。"},
    {"company": "柳东官塘汽配厂（成华）", "role": "抛光工/普工/质检/备料员/河西售后", "type": "短期工", "location": "柳东官塘", "start": "2026-05-13", "end": "2026-06-13", "headcount": 80, "signed": 0, "salary": "普工/质检/备料员/河西售后16元/小时，2个月后加1元；抛光工27元/小时", "age": "17-50岁", "notes": "大量招聘，不用体检，男女不限，不能有纹身，两班倒。主要生产汽车塑料保险杠。提供宿舍安合华庭，包吃。中午吃饭休息半小时，下午半小时，每天有效工时11小时。可以周结，不扣工时。下午2点面试，面试者需要带身份证复印件。"},
    {"company": "柳东花岭新能源（奥德永兴）", "role": "激光焊/打磨工/悬挂焊/普工", "type": "季节工", "location": "柳东花岭", "start": "2026-04-24", "end": "2026-07-31", "headcount": 100, "signed": 0, "salary": "激光焊25+3元/小时，打磨工19+3元/小时，悬挂焊21+3元/小时，普工17+3元/小时", "age": "18-53岁", "notes": "负责新能源汽车电池壳装配生产。入职满一个月+3元/小时，用工单价调整自2026年4月24日至2026年7月31日止，入职不满一个月离职不享受调整后单价。两班倒8对8，工作8-12小时。工厂食堂扣2元/餐，宿舍150元/月，水电费平摊。男工，女工可做普工，18-48岁，不用体检，新手也可以。上午10:30面试，人多下午也可安排。"},
]

WORKERS = [
    {"name": "张伟", "location": "柳东", "available": "现在可到岗", "period": "长期稳定", "salary": "5000以上", "score": 92, "tags": "注塑经验, 接受夜班, 需要住宿, 到岗率高"},
    {"name": "李娜", "location": "柳东花岭", "available": "本周可到岗", "period": "1-3个月", "salary": "17元/小时以上", "score": 86, "tags": "质检, 女工, 坐班, 稳定"},
    {"name": "王强", "location": "柳东官塘", "available": "现在可到岗", "period": "7-15天", "salary": "周结优先", "score": 78, "tags": "汽配厂, 抛光, 可加班, 短期工"},
    {"name": "陈晨", "location": "柳东", "available": "下周可到岗", "period": "长期稳定", "salary": "5500以上", "score": 84, "tags": "物流普工, 接受夜班, 无经验可培训, 需要住宿"},
    {"name": "赵敏", "location": "柳东花玲", "available": "暑假可做", "period": "暑假工", "salary": "17元/小时以上", "score": 81, "tags": "短期工, 包装, 坐班, 接受夜班"},
]

PUBLIC_DEMO_DEMANDS = [
    {"id": -1, "accountId": 0, "companyKey": "demo", "company": "示例电子厂", "role": "包装普工", "type": "短期工", "location": "示例园区A", "start": "2026-06-01", "end": "2026-06-30", "headcount": 30, "signed": 12, "salary": "18元/小时", "age": "18-45岁", "notes": "模拟数据：包工作餐，提供住宿，两班倒，可接受无经验。"},
    {"id": -2, "accountId": 0, "companyKey": "demo", "company": "示例物流中心", "role": "分拣员", "type": "长期工", "location": "示例园区B", "start": "2026-07-01", "end": "", "headcount": 20, "signed": 8, "salary": "5500-6500元/月", "age": "18-50岁", "notes": "模拟数据：包吃住，接受夜班，主要负责分拣、扫码、打包。"},
]

PUBLIC_DEMO_WORKERS = [
    {"id": -1, "accountId": 0, "companyKey": "demo", "name": "示例求职者A", "phone": "13800000000", "gender": "男", "age": "28", "location": "示例园区A", "available": "现在可到岗", "period": "长期稳定", "expectedRole": "普工", "salary": "5000以上", "score": 80, "note": "模拟数据，不代表真实求职者。", "source": "系统演示", "tags": ["接受夜班", "需要住宿", "普工"]},
    {"id": -2, "accountId": 0, "companyKey": "demo", "name": "示例求职者B", "phone": "13900000000", "gender": "女", "age": "24", "location": "示例园区B", "available": "下周可到岗", "period": "1-3个月", "expectedRole": "质检", "salary": "周结优先", "score": 78, "note": "模拟数据，不代表真实求职者。", "source": "系统演示", "tags": ["坐班", "质检", "短期工"]},
]


def mask_phone(phone):
    if not phone or len(phone) < 7:
        return phone or ""
    return phone[:3] + "****" + phone[-4:]


def build_insights(demands, workers):
    total_gap = sum(max(int(item["headcount"]) - int(item.get("signed") or 0), 0) for item in demands)
    high_gap = sorted(demands, key=lambda item: max(int(item["headcount"]) - int(item.get("signed") or 0), 0), reverse=True)[:5]
    weekly = [item for item in demands if "周结" in item["notes"]]
    no_exam = [item for item in demands if "不用体检" in item["notes"] or "不体检" in item["notes"]]
    night = [worker for worker in workers if any("夜班" in tag for tag in worker["tags"])]
    self_registered = [worker for worker in workers if worker.get("source") == "求职者自助登记"]
    return {
        "totalGap": total_gap,
        "highGap": [{"title": f"{item['company']} {item['role']}", "value": max(int(item["headcount"]) - int(item.get("signed") or 0), 0), "note": item["salary"]} for item in high_gap],
        "weeklyJobs": [{"title": f"{item['company']} {item['role']}", "note": item["salary"]} for item in weekly[:8]],
        "noExamJobs": [{"title": f"{item['company']} {item['role']}", "note": item["age"]} for item in no_exam[:8]],
        "nightWorkers": [{"title": worker["name"], "note": "、".join(worker["tags"])} for worker in night[:8]],
        "selfRegisteredCount": len(self_registered),
    }


def public_demo_payload():
    knowledge = [
        {"id": -1, "accountId": 0, "companyKey": "demo", "category": "演示岗位规则", "title": "示例电子厂｜包装普工", "summary": "这是一条未登录状态下展示的模拟知识条目，用于演示岗位规则、薪资、食宿和用工周期如何沉淀。", "source": "系统演示", "entityType": "demo", "entityId": -1, "tags": ["模拟数据", "岗位规则", "短期工"], "confidence": 80, "isDeleted": 0, "createdAt": "", "updatedAt": ""},
        {"id": -2, "accountId": 0, "companyKey": "demo", "category": "演示求职者画像", "title": "示例求职者A｜普工｜可到岗", "summary": "这是一条未登录状态下展示的模拟求职者画像，用于演示标签、到岗时间和岗位偏好如何参与匹配。", "source": "系统演示", "entityType": "demo", "entityId": -2, "tags": ["模拟数据", "求职者画像"], "confidence": 75, "isDeleted": 0, "createdAt": "", "updatedAt": ""},
    ]
    return {
        "account": None, "demo": True,
        "demands": PUBLIC_DEMO_DEMANDS, "workers": PUBLIC_DEMO_WORKERS,
        "chat": [{"role": "assistant", "text": "当前为未登录演示模式，页面展示的是模拟数据。登录后会加载企业专属私有知识库。"}],
        "knowledge": knowledge,
        "insights": build_insights(PUBLIC_DEMO_DEMANDS, PUBLIC_DEMO_WORKERS),
    }


def get_payload(account=None):
    if not account or not account.get("companyKey"):
        return public_demo_payload()
    with connect() as conn:
        demand_where, demand_params = scoped_where(account)
        worker_where, worker_params = scoped_where(account)
        knowledge_where, knowledge_params = scoped_where(account)
        knowledge_where = f"{knowledge_where} AND is_deleted = 0"
        chat_where, chat_params = scoped_where(account)
        demands = [row_to_demand(row) for row in conn.execute(f"SELECT * FROM demands {demand_where} ORDER BY start_date, id", demand_params)]
        workers = [row_to_worker(row) for row in conn.execute(f"SELECT * FROM workers {worker_where} ORDER BY id DESC", worker_params)]
        for w in workers:
            if w.get("phone"):
                w["phone"] = mask_phone(w["phone"])
        chat = [dict(row) for row in conn.execute(f"SELECT role, text FROM chat_messages {chat_where} ORDER BY id", chat_params)]
        knowledge = [row_to_knowledge(row) for row in conn.execute(f"SELECT * FROM knowledge_entries {knowledge_where} ORDER BY updated_at DESC, id DESC", knowledge_params)]
    return {"account": account, "demands": demands, "workers": workers, "chat": chat, "knowledge": knowledge, "insights": build_insights(demands, workers)}


def reset_seed_data(account):
    require_login(account)
    if account.get("role") != "owner":
        raise PermissionError("只有老板/管理员可以恢复示例数据。")
    company_key = account["companyKey"]
    account_id = int(account["id"])
    with connect() as conn:
        conn.execute("DELETE FROM chat_messages WHERE company_key = ?", (company_key,))
        conn.execute("DELETE FROM workers WHERE company_key = ?", (company_key,))
        conn.execute("DELETE FROM demands WHERE company_key = ?", (company_key,))
        conn.execute("DELETE FROM knowledge_entries WHERE company_key = ?", (company_key,))
        for demand in DEMANDS:
            conn.execute("""INSERT INTO demands (account_id, company_key, company, role, type, location, start_date, end_date, headcount, signed, salary, age, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                         (account_id, company_key, demand["company"], demand["role"], demand["type"], demand["location"], demand["start"], demand["end"], demand["headcount"], demand["signed"], demand["salary"], demand["age"], demand["notes"]))
        for worker in WORKERS:
            conn.execute("""INSERT INTO workers (account_id, company_key, name, location, available, period, salary, score, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                         (account_id, company_key, worker["name"], worker["location"], worker["available"], worker["period"], worker["salary"], worker["score"], worker["tags"]))
        conn.execute("INSERT INTO chat_messages (account_id, company_key, role, text) VALUES (?, ?, ?, ?)", (account_id, company_key, "assistant", "已恢复示例企业用工数据和演示求职者库到当前企业。"))
        sync_knowledge_entries(conn, company_key=company_key)
