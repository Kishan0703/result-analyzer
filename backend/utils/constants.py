# backend/utils/constants.py

COLUMN_ALIASES = {
    "usn": ["usn", "student id", "roll no", "roll number", "enrollment"],
    "name": ["name", "student name", "full name"],
    "semester": ["semester", "sem"],
    "course_code": ["course code", "subject code", "code", "course_code"],
    "course_title": ["course title", "subject", "subject name", "course name", "course_title"],
    "cia": ["cia", "internal", "internal marks", "ia"],
    "see": ["see", "external", "external marks", "university marks"],
    "total": ["total", "total marks"],
    "credits_registered": ["credits registered", "max credits", "credits", "credit"],
    "credits_earned": ["credits earned", "earned credits", "earned"],
    "grade": ["grade"],
    "grade_point": ["grade point", "gp", "grade points"],
    "sgpa": ["sgpa"],
    "cgpa": ["cgpa"],
    "attendance": ["attendance in %", "attendance", "att %", "attendance%", "att"],
    "remarks": ["remarks", "category", "quota", "admission category"],
    "section": ["section", "sec"],
    "cluster": ["cluster"],
}

REQUIRED_COLUMNS = [
    "usn", "name", "course_code", "course_title",
    "grade", "credits_registered", "credits_earned", "sgpa", "cgpa"
]

PASS_GRADES = {"O", "A+", "A", "B+", "B", "C", "P", "PP", "NP"}
FAIL_GRADES = {"F"}
ABSENT_GRADES = {"AB"}
DETAINED_GRADES = {"DX"}
NOT_EXAMINED_GRADES = {"NE"}
NON_CREDIT_GRADES = {"NP", "PP"}

KNOWN_CATEGORIES = {
    "CET", "COMED-K", "COMEDK", "MGMT", "MANAGEMENT",
    "DIP", "DIPLOMA", "PIO", "SNQ", "MNG+PIO+JK"
}

# Normalize category display names
CATEGORY_DISPLAY = {
    "CET": "CET",
    "COMED-K": "Comed-K",
    "COMEDK": "Comed-K",
    "MGMT": "Mgmt.",
    "MANAGEMENT": "Mgmt.",
    "DIP": "Dip",
    "DIPLOMA": "Dip",
    "PIO": "PIO",
    "SNQ": "SNQ",
    "MNG+PIO+JK": "MNG+PIO+JK",
}
