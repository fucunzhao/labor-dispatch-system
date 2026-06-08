"""数据模型行→字典转换"""
def row_to_demand(row):
    row = dict(row)
    return {
        "id": row["id"],
        "accountId": row["account_id"],
        "companyKey": row["company_key"],
        "company": row["company"],
        "product": row.get("product", ""),
        "role": row["role"],
        "type": row["type"],
        "location": row["location"],
        "start": row["start_date"],
        "end": row["end_date"] or "",
        "headcount": row["headcount"],
        "signed": row["signed"],
        "salary": row["salary"],
        "age": row["age"],
        "genderRequired": row.get("gender_required", ""),
        "needId": row.get("need_id", ""),
        "needExperience": row.get("need_experience", ""),
        "hasShifts": row.get("has_shifts", ""),
        "hasMeal": row.get("has_meal", ""),
        "hasDorm": row.get("has_dorm", ""),
        "notes": row["notes"],
        "status": row.get("status", "active") or "active",
    }


def row_to_worker(row):
    row = dict(row)
    return {
        "id": row["id"],
        "accountId": row["account_id"],
        "companyKey": row["company_key"],
        "name": row["name"],
        "phone": row["phone"],
        "gender": row["gender"],
        "age": row["age"],
        "location": row["location"],
        "available": row["available"],
        "period": row["period"],
        "expectedRole": row["expected_role"],
        "salary": row["salary"],
        "score": row["score"],
        "note": row["note"],
        "source": row["source"],
        "registrationDate": row.get("registration_date", ""),
        "interviewDate": row.get("interview_date", ""),
        "desiredStartDate": row.get("desired_start_date", ""),
        "previousJob": row.get("previous_job", ""),
        "education": row.get("education", ""),
        "hasInterviewed": row.get("has_interviewed", ""),
        "hasEmployed": row.get("has_employed", ""),
        "employDate": row.get("employ_date", ""),
        "desiredCompany": row.get("desired_company", ""),
        "desiredRole": row.get("desired_role", ""),
        "acceptShifts": row.get("accept_shifts", ""),
        "acceptDorm": row.get("accept_dorm", ""),
        "acceptSocialInsurance": row.get("accept_social_insurance", ""),
        "desiredArea": row.get("desired_area", ""),
        "otherWishes": row.get("other_wishes", ""),
        "tags": [item.strip() for item in (row["tags"] or "").replace("，", ",").split(",") if item.strip()],
    }


def row_to_knowledge(row):
    return {
        "id": row["id"],
        "accountId": row["account_id"],
        "companyKey": row["company_key"],
        "category": row["category"],
        "title": row["title"],
        "summary": row["summary"],
        "source": row["source"],
        "entityType": row["entity_type"],
        "entityId": row["entity_id"],
        "tags": [item.strip() for item in (row["tags"] or "").replace("，", ",").split(",") if item.strip()],
        "confidence": row["confidence"],
        "isDeleted": row["is_deleted"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }
