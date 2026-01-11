
const fs = require('fs');

const projectId = "nn7c921dndqc561fmq52hj79w17z0z92";
const ops = [];
const addOp = (kind, payload) => {
    if (kind === "materialLine.create") {
        // Schema fixes: Ensure itemName exists, default to title
        if (!payload.fields.itemName) {
            payload.fields.itemName = payload.fields.title;
        }
    }
    if (kind === "workLine.create") {
        if (!payload.fields.roleHe) {
            payload.fields.roleHe = "עובד כללי";
        }
    }
    ops.push({ kind, payload });
};

// =================================================================================================
// STAGE 1: ELEMENTS (E01-E16)
// =================================================================================================

// 1. E01_floor
addOp("element.create", {
    tempId: "E01_floor",
    element: { title: "רצפת לינו/פיויסי + ספי אלומיניום", type: "install", tags: ["element:E01_floor"] },
    draft: { status: "open" }
});

// 2. E02_drawers
addOp("element.create", {
    tempId: "E02_drawers",
    element: { title: "חיפוי מגירות + אי איפור (טפט + נצנצים)", type: "mixed", tags: ["element:E02_drawers"] },
    draft: { status: "open" }
});

// 3. E03_walls_prints
addOp("element.create", {
    tempId: "E03_walls_prints",
    element: { title: "הדפסות PVC לכל הקירות (צחי)", type: "print", tags: ["element:E03_walls_prints"] },
    draft: { status: "open" }
});

// 4. E04_ceiling
addOp("element.create", {
    tempId: "E04_ceiling",
    element: { title: "תקרה + חוטי יהלומים + חישוק מרכזי (ללא שנדליר)", type: "build", tags: ["element:E04_ceiling"] },
    draft: { status: "open" }
});

// 5. E05_devil
addOp("element.create", {
    tempId: "E05_devil",
    element: { title: "אזור השטן – להבות + תאורה", type: "mixed", tags: ["element:E05_devil"] },
    draft: { status: "open" }
});

// 6. E06_angel_wings
addOp("element.create", {
    tempId: "E06_angel_wings",
    element: { title: "כנפיים ענקיות – מלאכית", type: "build", tags: ["element:E06_angel_wings"] },
    draft: { status: "open" }
});

// 7. E07_clowns_carousel
addOp("element.create", {
    tempId: "E07_clowns_carousel",
    element: { title: "קרוסלת ליצנים דו־מימד – קאפה חתוכה + קישוטים", type: "mixed", tags: ["element:E07_clowns_carousel"] },
    draft: { status: "open" }
});

// 8. E08_tiger
addOp("element.create", {
    tempId: "E08_tiger",
    element: { title: "קיר נמרה – צמחיה + נמר + עיגון", type: "mixed", tags: ["element:E08_tiger"] },
    draft: { status: "open" }
});

// 9. E09_curtains
addOp("element.create", {
    tempId: "E09_curtains",
    element: { title: "וילונות קטיפה", type: "build", tags: ["element:E09_curtains"] },
    draft: { status: "open" }
});

// 10. E10_frames
addOp("element.create", {
    tempId: "E10_frames",
    element: { title: "מסגרות/קרניזים", type: "build", tags: ["element:E10_frames"] },
    draft: { status: "open" }
});

// 11. E11_graphics
addOp("element.create", {
    tempId: "E11_graphics",
    element: { title: "גרפיקה והדמיות (אודליה)", type: "print", tags: ["element:E11_graphics"] },
    draft: { status: "open" }
});

// 12. E12_constructor
addOp("element.create", {
    tempId: "E12_constructor",
    element: { title: "קונסטרוקטור/בטיחות", type: "subcontract", tags: ["element:E12_constructor"] },
    draft: { status: "open" }
});

// 13. E13_general
addOp("element.create", {
    tempId: "E13_general",
    element: { title: "מתכלים + אוכל סטודיו", type: "subcontract", tags: ["element:E13_general"] },
    draft: { status: "open" }
});

// 14. E14_install
addOp("element.create", {
    tempId: "E14_install",
    element: { title: "הקמה (לוגיסטיקה + צוות)", type: "install", tags: ["element:E14_install"] },
    draft: { status: "open" }
});

// 15. E15_teardown
addOp("element.create", {
    tempId: "E15_teardown",
    element: { title: "פירוק ושיקום", type: "install", tags: ["element:E15_teardown"] },
    draft: { status: "open" }
});

// 16. E16_repairs
addOp("element.create", {
    tempId: "E16_repairs",
    element: { title: "ביקורי תיקונים", type: "install", tags: ["element:E16_repairs"] },
    draft: { status: "open" }
});


// =================================================================================================
// STAGE 2: TASKS & FINANCIAL ROWS (Independent)
// =================================================================================================

// --- E11_graphics ---
addOp("task.create", {
    tempId: "T_E11_01", elementTempOrId: "E11_graphics", fields: {
        title: "איסוף חומרים מהלקוח + נעילת “מה מאושר”", estimatedMinutes: 120, stage: "clarification", workType: "management", priority: "high",
        checklist: [{ title: "רשימת קבצים חסרים" }, { title: "פורמטים ופונטים" }, { title: "אישור כתוב" }]
    }
});
addOp("workLine.create", {
    tempId: "WL_E11_01", elementTempOrId: "E11_graphics", fields: {
        title: "גרפיקה והדמיות (אודליה)", roleHe: "גרפיקאית חיצונית", total: 15000, type: "subcontract", workType: "printing_graphics"
    }
});

addOp("task.create", {
    tempId: "T_E11_02", elementTempOrId: "E11_graphics", fields: {
        title: "סט מידות/תבניות לקירות", estimatedMinutes: 120, workType: "printing_graphics", priority: "high",
        checklist: [{ title: "תבנית לכל אזור" }, { title: "bleed/safe" }, { title: "סימון פתחים" }]
    }
});

addOp("task.create", {
    tempId: "T_E11_03", elementTempOrId: "E11_graphics", fields: {
        title: "קבצי Print-Ready + אריזה לפי Parts", estimatedMinutes: 180, workType: "printing_graphics", priority: "high",
        checklist: [{ title: "PDF/X" }, { title: "הטמעת פונטים" }, { title: "Naming קבוע" }]
    }
});

addOp("task.create", {
    tempId: "T_E11_04", elementTempOrId: "E11_graphics", fields: {
        title: "QA קבצים לפני שליחה", estimatedMinutes: 120, workType: "management", priority: "high",
        checklist: [{ title: "מידה מול תבנית" }, { title: "DPI" }, { title: "safe margins" }]
    }
});

// --- E03_walls_prints ---
addOp("materialLine.create", {
    tempId: "ML_E03_01", elementTempOrId: "E03_walls_prints", fields: {
        title: "PVC לכל הקירות", itemName: "הדפסות PVC", total: 16700, type: "material", workType: "printing_graphics", vendorName: "צחי"
    }
});
addOp("workLine.create", {
    tempId: "WL_E03_01", elementTempOrId: "E03_walls_prints", fields: {
        title: "הכנות/QA/ארגון להתקנה (הדפסות)", roleHe: "עובד סטודיו", total: 1500, type: "labor", workType: "management"
    }
});

addOp("task.create", {
    tempId: "T_E03_01", elementTempOrId: "E03_walls_prints", fields: {
        title: "סגירת מפרט מול צחי", estimatedMinutes: 60, stage: "procurement", workType: "management", priority: "high",
        checklist: [{ title: "עובי PVC" }, { title: "תלייה: ברגים/דבק" }, { title: "אריזה/חלוקה" }]
    }
});
addOp("task.create", {
    tempId: "T_E03_02", elementTempOrId: "E03_walls_prints", fields: {
        title: "Proof דיגיטלי + Sign-off", estimatedMinutes: 60, workType: "management", priority: "high",
        checklist: [{ title: "צבע/קונטרסט" }, { title: "פתחים/מראות" }, { title: "אישור סופי" }]
    }
});
addOp("task.create", {
    tempId: "T_E03_03", elementTempOrId: "E03_walls_prints", fields: {
        title: "קליטת ההדפסות + סימון חלקים לפי אזורים", estimatedMinutes: 120, stage: "build", workType: "management", priority: "high",
        checklist: [{ title: "ספירה מול רשימה" }, { title: "בדיקת פגמים" }, { title: "סימון לאיזה קיר" }]
    }
});

// --- E04_ceiling ---
addOp("materialLine.create", {
    tempId: "ML_E04_01", elementTempOrId: "E04_ceiling", fields: {
        title: "גלילים + חישוק + מחברים", itemName: "חומרי תקרה", total: 2500, type: "material"
    }
});
addOp("workLine.create", {
    tempId: "WL_E04_01", elementTempOrId: "E04_ceiling", fields: {
        title: "הכנות סטודיו לתקרה", roleHe: "עובד סטודיו", total: 750, type: "labor", workType: "props_sculpt"
    }
});

addOp("task.create", {
    tempId: "T_E04_01", elementTempOrId: "E04_ceiling", fields: {
        title: "תכנון תלייה", estimatedMinutes: 120, workType: "management", priority: "high",
        checklist: [{ title: "תכנית רדיאלית" }, { title: "אורך לכל קבוצה" }, { title: "פתרון הסתבכות" }]
    }
});
addOp("task.create", {
    tempId: "T_E04_02", elementTempOrId: "E04_ceiling", fields: {
        title: "חיתוך פסים 15 ס״מ (Batch 1)", estimatedMinutes: 180, stage: "build", workType: "props_sculpt", priority: "high",
        checklist: [{ title: "מדידה אחידה" }, { title: "אריזה לפי קבוצות" }]
    }
});
addOp("task.create", {
    tempId: "T_E04_03", elementTempOrId: "E04_ceiling", fields: {
        title: "הכנת לולאות/מחברים לפסים (Batch 1)", estimatedMinutes: 180, stage: "build", workType: "props_sculpt",
        checklist: [{ title: "חיבור/קליפס" }, { title: "סימון אורך יעד" }]
    }
});
addOp("task.create", {
    tempId: "T_E04_04", elementTempOrId: "E04_ceiling", fields: {
        title: "בניית חישוק מרכזי + נקודות יציאה", estimatedMinutes: 180, stage: "build", workType: "metal_fab", priority: "high",
        checklist: [{ title: "יציבות" }, { title: "נקודות חיבור" }, { title: "שיטת תלייה ראשית" }]
    }
});

// --- E06_angel_wings ---
addOp("materialLine.create", {
    tempId: "ML_E06_01", elementTempOrId: "E06_angel_wings", fields: {
        title: "ברזל/“נוצות”/LED", itemName: "חומרי כנפיים", total: 2400, type: "material"
    }
});
addOp("workLine.create", {
    tempId: "WL_E06_01", elementTempOrId: "E06_angel_wings", fields: {
        title: "עבודת סטודיו כנפיים", roleHe: "עובד סטודיו", total: 8000, type: "labor", workType: "props_sculpt"
    }
});

addOp("task.create", {
    tempId: "T_E06_01", elementTempOrId: "E06_angel_wings", fields: {
        title: "סגירת מידות + נקודת תלייה + משקל יעד", estimatedMinutes: 120, workType: "management", priority: "high",
        checklist: [{ title: "מידות סופיות" }, { title: "מודולרי" }]
    }
});
addOp("task.create", {
    tempId: "T_E06_02", elementTempOrId: "E06_angel_wings", fields: {
        title: "שלד ברזל: שרטוט+חיתוך+ריתוך (כנף שמאל)", estimatedMinutes: 240, stage: "build", workType: "metal_fab", priority: "high"
    }
});
addOp("task.create", {
    tempId: "T_E06_03", elementTempOrId: "E06_angel_wings", fields: {
        title: "שלד ברזל: ריתוך (כנף ימין)", estimatedMinutes: 240, stage: "build", workType: "metal_fab"
    }
});
addOp("task.create", {
    tempId: "T_E06_04", elementTempOrId: "E06_angel_wings", fields: {
        title: "נוצות: תבנית + חיתוך Batch 1", estimatedMinutes: 180, stage: "build", workType: "props_sculpt"
    }
});
addOp("task.create", {
    tempId: "T_E06_05", elementTempOrId: "E06_angel_wings", fields: {
        title: "נוצות: חיתוך Batch 2", estimatedMinutes: 180, stage: "build", workType: "props_sculpt"
    }
});
addOp("task.create", {
    tempId: "T_E06_06", elementTempOrId: "E06_angel_wings", fields: {
        title: "הדבקת נוצות על כנף שמאל", estimatedMinutes: 240, stage: "build", workType: "paint_finish", priority: "high"
    }
});
addOp("task.create", {
    tempId: "T_E06_07", elementTempOrId: "E06_angel_wings", fields: {
        title: "הדבקת נוצות על כנף ימין", estimatedMinutes: 240, stage: "build", workType: "paint_finish"
    }
});
addOp("task.create", {
    tempId: "T_E06_08", elementTempOrId: "E06_angel_wings", fields: {
        title: "שילוב לד עדין + בדיקות בטיחות", estimatedMinutes: 180, stage: "build", workType: "rigging_install", priority: "high",
        checklist: [{ title: "הזנת חשמל" }, { title: "הסתרת חוטים" }, { title: "טסט חום" }]
    }
});
addOp("task.create", {
    tempId: "T_E06_09", elementTempOrId: "E06_angel_wings", fields: {
        title: "QA תלייה בסטודיו + צילום", estimatedMinutes: 120, stage: "build", workType: "management", priority: "high"
    }
});
addOp("task.create", {
    tempId: "T_E06_10", elementTempOrId: "E06_angel_wings", fields: {
        title: "אריזה להובלה (מודולרי)", estimatedMinutes: 120, stage: "build", workType: "transport_logistics"
    }
});

// --- E07_clowns_carousel ---
addOp("materialLine.create", {
    tempId: "ML_E07_01", elementTempOrId: "E07_clowns_carousel", fields: {
        title: "הדפסה + קאפה + חומרי תלייה", itemName: "חומרי קרוסלה", total: 2000, type: "material"
    }
});
addOp("workLine.create", {
    tempId: "WL_E07_01", elementTempOrId: "E07_clowns_carousel", fields: {
        title: "הכנות סטודיו קרוסלה", roleHe: "עובד סטודיו", total: 4000, type: "labor", workType: "props_sculpt"
    }
});

addOp("task.create", {
    tempId: "T_E07_01", elementTempOrId: "E07_clowns_carousel", fields: {
        title: "הגדרת סט סוסים + קבצים", estimatedMinutes: 120, workType: "printing_graphics", priority: "high",
        checklist: [{ title: "כמות 6-10" }, { title: "חורי תלייה בקובץ" }, { title: "חיזוק גב" }]
    }
});
addOp("task.create", {
    tempId: "T_E07_02", elementTempOrId: "E07_clowns_carousel", fields: {
        title: "הזמנה: הדפסה על קאפה + חיתוך", estimatedMinutes: 90, stage: "procurement", workType: "management", priority: "high"
    }
});
addOp("task.create", {
    tempId: "T_E07_03", elementTempOrId: "E07_clowns_carousel", fields: {
        title: "קישוטים בסטודיו + חיזוק תלייה", estimatedMinutes: 240, stage: "build", workType: "paint_finish", priority: "high",
        checklist: [{ title: "הדבקת קישוטים" }, { title: "חיזוק חורים" }]
    }
});
addOp("task.create", {
    tempId: "T_E07_04", elementTempOrId: "E07_clowns_carousel", fields: {
        title: "QA + מפת תלייה + אריזה", estimatedMinutes: 120, stage: "build", workType: "management", priority: "high",
        checklist: [{ title: "סימון גבהים" }, { title: "סט חוטים מוכן" }]
    }
});

// --- E08_tiger ---
addOp("materialLine.create", {
    tempId: "ML_E08_01", elementTempOrId: "E08_tiger", fields: {
        title: "צמחיה + נמר + זהב", itemName: "חומרי נמר", total: 3000, type: "material"
    }
});
addOp("workLine.create", {
    tempId: "WL_E08_01", elementTempOrId: "E08_tiger", fields: {
        title: "סטודיו צבע/הכנה נמרה", roleHe: "עובד סטודיו", total: 2000, type: "labor", workType: "paint_finish"
    }
});

addOp("task.create", {
    tempId: "T_E08_01", elementTempOrId: "E08_tiger", fields: {
        title: "קניית צמחיה + ספריי זהב", estimatedMinutes: 120, workType: "purchasing", priority: "high"
    }
});
addOp("task.create", {
    tempId: "T_E08_02", elementTempOrId: "E08_tiger", fields: {
        title: "צביעת צמחיה זהב + ייבוש", estimatedMinutes: 180, stage: "build", workType: "paint_finish"
    }
});
addOp("task.create", {
    tempId: "T_E08_03", elementTempOrId: "E08_tiger", fields: {
        title: "נמר: איתור/רכישה + בדיקת מצב", estimatedMinutes: 120, workType: "purchasing", priority: "high"
    }
});
addOp("task.create", {
    tempId: "T_E08_04", elementTempOrId: "E08_tiger", fields: {
        title: "פיניש נמר (זהב מיושן)", estimatedMinutes: 240, stage: "build", workType: "paint_finish", priority: "high"
    }
});
addOp("task.create", {
    tempId: "T_E08_05", elementTempOrId: "E08_tiger", fields: {
        title: "תכנון עיגון + ערכת התקנה", estimatedMinutes: 180, workType: "management", priority: "high"
    }
});

// --- E05_devil ---
addOp("materialLine.create", {
    tempId: "ML_E05_01", elementTempOrId: "E05_devil", fields: {
        title: "חומרים/תאורה/ספייסרים", itemName: "חומרי שטן", total: 3500, type: "material"
    }
});
addOp("workLine.create", {
    tempId: "WL_E05_01", elementTempOrId: "E05_devil", fields: {
        title: "עבודת סטודיו שטן", roleHe: "עובד סטודיו", total: 1500, type: "labor", workType: "props_sculpt"
    }
});

addOp("task.create", {
    tempId: "T_E05_01", elementTempOrId: "E05_devil", fields: {
        title: "סגירת פתרון “אש” + טסט סטודיו", estimatedMinutes: 180, workType: "rigging_install", priority: "high"
    }
});
addOp("task.create", {
    tempId: "T_E05_02", elementTempOrId: "E05_devil", fields: {
        title: "הכנת ספייסרים/תושבות לתלייה", estimatedMinutes: 180, stage: "build", workType: "props_sculpt"
    }
});

// --- E09_curtains ---
addOp("materialLine.create", {
    tempId: "ML_E09_01", elementTempOrId: "E09_curtains", fields: {
        title: "קטיפה", itemName: "בד קטיפה", total: 700, type: "material"
    }
});
addOp("workLine.create", {
    tempId: "WL_E09_01", elementTempOrId: "E09_curtains", fields: {
        title: "גזירה/תפירה", roleHe: "תופרת", total: 800, type: "labor", workType: "props_sculpt"
    }
});

addOp("task.create", {
    tempId: "T_E09_01", elementTempOrId: "E09_curtains", fields: {
        title: "קניה + תפירה/שוליים", estimatedMinutes: 240, workType: "props_sculpt", priority: "high" // Changed prio from med in text based on context
    }
});
addOp("task.create", {
    tempId: "T_E09_02", elementTempOrId: "E09_curtains", fields: {
        title: "שיטת תלייה + QA", estimatedMinutes: 120, stage: "build", workType: "management"
    }
});

// --- E10_frames ---
addOp("materialLine.create", {
    tempId: "ML_E10_01", elementTempOrId: "E10_frames", fields: {
        title: "מסגרות רכישה", itemName: "מסגרות", total: 1000, type: "material"
    }
});
addOp("workLine.create", {
    tempId: "WL_E10_01", elementTempOrId: "E10_frames", fields: {
        title: "צביעה/הרכבה", roleHe: "עובד סטודיו", total: 1000, type: "labor", workType: "paint_finish"
    }
});

addOp("task.create", {
    tempId: "T_E10_01", elementTempOrId: "E10_frames", fields: {
        title: "רכישה מסגרות", estimatedMinutes: 120, workType: "purchasing"
    }
});
addOp("task.create", {
    tempId: "T_E10_02", elementTempOrId: "E10_frames", fields: {
        title: "צביעה/יישון", estimatedMinutes: 180, stage: "build", workType: "paint_finish"
    }
});
addOp("task.create", {
    tempId: "T_E10_03", elementTempOrId: "E10_frames", fields: {
        title: "חיבורי תלייה + QA", estimatedMinutes: 120, stage: "build", workType: "props_sculpt"
    }
});

// --- E12_constructor ---
addOp("workLine.create", {
    tempId: "WL_E12_01", elementTempOrId: "E12_constructor", fields: {
        title: "אישור קונסטרוקטור", roleHe: "קונסטרוקטור", total: 2000, type: "subcontract", workType: "management"
    }
});
addOp("task.create", {
    tempId: "T_E12_01", elementTempOrId: "E12_constructor", fields: {
        title: "הכנת חבילה לקונסטרוקטור", estimatedMinutes: 120, workType: "management", priority: "high",
        checklist: [{ title: "כנפיים/תקרה" }, { title: "קרוסלה" }, { title: "עיגון נמר" }]
    }
});
addOp("task.create", {
    tempId: "T_E12_02", elementTempOrId: "E12_constructor", fields: {
        title: "אישור כתוב + העברה לקניון", estimatedMinutes: 120, workType: "management", priority: "high"
    }
});

// --- E14_install ---
addOp("materialLine.create", { tempId: "ML_E14_01", elementTempOrId: "E14_install", fields: { title: "אוכל התקנה", itemName: "אוכל התקנה", total: 1500, type: "material", workType: "transport_logistics" } });
addOp("materialLine.create", { tempId: "ML_E14_02", elementTempOrId: "E14_install", fields: { title: "מוניות עובדים", itemName: "מוניות", total: 1500, type: "material", workType: "transport_logistics" } });
addOp("materialLine.create", { tempId: "ML_E14_03", elementTempOrId: "E14_install", fields: { title: "הובלות+פיגומים/ציוד", itemName: "הובלות", total: 7000, type: "material", workType: "transport_logistics" } });
addOp("workLine.create", { tempId: "WL_E14_01", elementTempOrId: "E14_install", fields: { title: "שכר צוות התקנה", total: 20000, type: "labor", workType: "rigging_install" } });
addOp("materialLine.create", { tempId: "ML_E13_02", elementTempOrId: "E13_general", fields: { title: "מתכלים (דבק/סכינים/צבע)", itemName: "מתכלים", total: 1000, type: "material", workType: "transport_logistics" } }); // Used in install tasks
addOp("materialLine.create", { tempId: "ML_E13_01", elementTempOrId: "E13_general", fields: { title: "אוכל סטודיו", itemName: "אוכל סטודיו", total: 2900, type: "material", workType: "transport_logistics" } });


const installTasks = [
    { id: "T_E14_01", title: "תכנית הקמה לפי לילות", min: 120, type: "management" },
    { id: "T_E14_02", title: "הזמנת הובלות + פיגומים", min: 120, type: "transport_logistics" },
    { id: "T_E14_03", title: "Kit התקנה (כלים)", min: 180, type: "transport_logistics" },
    { id: "T_E14_10", title: "פריקה + בטיחות", min: 120, type: "transport_logistics" },
    { id: "T_E14_11", title: "התקנת תקרה", min: 240, type: "rigging_install" },
    { id: "T_E14_12", title: "תליית כנפיים", min: 180, type: "rigging_install", assignee: "גיא" },
    { id: "T_E14_13", title: "שטן: התקנה + חשמל", min: 240, type: "rigging_install", assignee: "גיא" },
    { id: "T_E14_14", title: "קרוסלה: תלייה", min: 180, type: "rigging_install" },
    { id: "T_E14_15", title: "QA לילה 1", min: 90, type: "management" },
    { id: "T_E14_20", title: "התקנת רצפה", min: 240, type: "rigging_install" },
    { id: "T_E14_21", title: "חיפוי מגירות + אי איפור", min: 240, type: "rigging_install" },
    { id: "T_E14_22", title: "התקנת הדפסות קיר", min: 240, type: "rigging_install" },
    { id: "T_E14_23", title: "נמרה: התקנה", min: 240, type: "rigging_install" },
    { id: "T_E14_24", title: "פינישים", min: 120, type: "paint_finish" },
    { id: "T_E14_25", title: "מסירה", min: 60, type: "management" },
];

for (const t of installTasks) {
    addOp("task.create", {
        tempId: t.id, elementTempOrId: "E14_install", fields: {
            title: t.title, estimatedMinutes: t.min, stage: "install", workType: t.type, priority: "high", assignee: t.assignee
        }
    });
}

// --- E15_teardown ---
addOp("materialLine.create", { tempId: "ML_E15_01", elementTempOrId: "E15_teardown", fields: { title: "הובלה/ציוד פירוק", total: 3000, type: "material", workType: "transport_logistics" } });
addOp("materialLine.create", { tempId: "ML_E15_02", elementTempOrId: "E15_teardown", fields: { title: "חומרים לשיקום", total: 1000, type: "material", workType: "paint_finish" } });
addOp("workLine.create", { tempId: "WL_E15_01", elementTempOrId: "E15_teardown", fields: { title: "שכר צוות פירוק", total: 10000, type: "labor", workType: "rigging_install" } });

const teardownTasks = [
    { id: "T_E15_01", title: "תיאום פירוק", min: 120, type: "management" },
    { id: "T_E15_02", title: "Kit שיקום (שפכטל)", min: 120, type: "transport_logistics" },
    { id: "T_E15_10", title: "פירוק תקרה", min: 240, type: "rigging_install" },
    { id: "T_E15_11", title: "פירוק כנפיים + חשמל", min: 180, type: "rigging_install", assignee: "גיא" },
    { id: "T_E15_12", title: "פירוק קרוסלה", min: 120, type: "rigging_install" },
    { id: "T_E15_13", title: "פירוק נמרה", min: 180, type: "rigging_install" },
    { id: "T_E15_14", title: "פירוק הדפסות קיר", min: 240, type: "rigging_install" },
    { id: "T_E15_15", title: "פירוק רצפה", min: 240, type: "rigging_install" },
    { id: "T_E15_16", title: "שיקום וסגירת חורים", min: 240, type: "paint_finish" },
    { id: "T_E15_17", title: "חשמל: חזרה למקור", min: 120, type: "rigging_install", assignee: "גיא" },
    { id: "T_E15_18", title: "פינוי והובלה חזור", min: 180, type: "transport_logistics" },
];
for (const t of teardownTasks) {
    addOp("task.create", {
        tempId: t.id, elementTempOrId: "E15_teardown", fields: {
            title: t.title, estimatedMinutes: t.min, stage: "teardown", workType: t.type, priority: "high", assignee: t.assignee
        }
    });
}

// --- E16_repairs ---
addOp("materialLine.create", { tempId: "ML_E16_01", elementTempOrId: "E16_repairs", fields: { title: "חומרי תיקונים", total: 600, type: "material" } });
addOp("workLine.create", { tempId: "WL_E16_01", elementTempOrId: "E16_repairs", fields: { title: "עבודת תיקונים", total: 3000, type: "labor", workType: "rigging_install" } });

addOp("task.create", { tempId: "T_E16_01", elementTempOrId: "E16_repairs", fields: { title: "פתיחת חלון תיקונים", estimatedMinutes: 60, workType: "management" } });
addOp("task.create", { tempId: "T_E16_02", elementTempOrId: "E16_repairs", fields: { title: "ביקור תיקונים #1", estimatedMinutes: 240, stage: "teardown", workType: "rigging_install" } });

// --- Others (E01, E02...) Costs (Not always tasked directly in doc, but cost definitions exist)
addOp("materialLine.create", { tempId: "ML_E01_01", elementTempOrId: "E01_floor", fields: { title: "Linoleum/PVC + ספים", total: 4300, type: "material", workType: "rigging_install" } });
addOp("materialLine.create", { tempId: "ML_E02_01", elementTempOrId: "E02_drawers", fields: { title: "טפט/“קטיפה” + נצנצים", total: 3900, type: "material", workType: "paint_finish" } });

// =================================================================================================
// STAGE 3: ACCOUNTING LINKS & DEPENDENCIES
// =================================================================================================

const linkOp = (taskId, lineId, type = "work") => {
    addOp("task.patch", {
        taskTempOrId: taskId, fields: {
            accountingLinks: [{ lineType: type, lineId, relation: "primary" }]
        }
    });
};

const depOp = (taskId, depIds) => {
    addOp("task.patch", { taskTempOrId: taskId, fields: { dependencies: depIds } });
};

// E11 Links
linkOp("T_E11_01", "WL_E11_01");
addOp("task.patch", {
    taskTempOrId: "T_E11_03", fields: {
        accountingLinks: [
            { lineType: "work", lineId: "WL_E11_01" }, { lineType: "work", lineId: "WL_E03_01" }
        ]
    }
});
linkOp("T_E11_04", "WL_E03_01");
depOp("T_E11_02", []); // "Medidot" external
depOp("T_E11_03", []);
depOp("T_E11_04", ["T_E11_03"]);

// E03 Links
addOp("task.patch", {
    taskTempOrId: "T_E03_01", fields: {
        accountingLinks: [
            { lineType: "material", lineId: "ML_E03_01" }, { lineType: "work", lineId: "WL_E03_01" }
        ]
    }
});
depOp("T_E03_01", ["T_E11_03"]);
linkOp("T_E03_02", "WL_E03_01");
depOp("T_E03_02", ["T_E03_01"]);
addOp("task.patch", {
    taskTempOrId: "T_E03_03", fields: {
        accountingLinks: [
            { lineType: "material", lineId: "ML_E03_01" }, { lineType: "work", lineId: "WL_E03_01" }
        ]
    }
});

// E04 Links
linkOp("T_E04_01", "WL_E04_01");
addOp("task.patch", {
    taskTempOrId: "T_E04_02", fields: {
        accountingLinks: [
            { lineType: "material", lineId: "ML_E04_01" }, { lineType: "work", lineId: "WL_E04_01" }
        ]
    }
});
depOp("T_E04_02", ["T_E04_01"]);
addOp("task.patch", {
    taskTempOrId: "T_E04_03", fields: {
        accountingLinks: [
            { lineType: "material", lineId: "ML_E04_01" }, { lineType: "work", lineId: "WL_E04_01" }
        ]
    }
});
depOp("T_E04_03", ["T_E04_02"]);
addOp("task.patch", {
    taskTempOrId: "T_E04_04", fields: {
        accountingLinks: [
            { lineType: "material", lineId: "ML_E04_01" }, { lineType: "work", lineId: "WL_E04_01" }
        ]
    }
});
depOp("T_E04_04", ["T_E04_01"]);

// E06 Links
addOp("task.patch", {
    taskTempOrId: "T_E06_01", fields: {
        accountingLinks: [
            { lineType: "work", lineId: "WL_E06_01" }, { lineType: "work", lineId: "WL_E12_01" }
        ]
    }
});
addOp("task.patch", {
    taskTempOrId: "T_E06_02", fields: {
        accountingLinks: [
            { lineType: "material", lineId: "ML_E06_01" }, { lineType: "work", lineId: "WL_E06_01" }
        ]
    }
});
linkOp("T_E06_03", "WL_E06_01");
linkOp("T_E06_04", "WL_E06_01");
linkOp("T_E06_05", "WL_E06_01");
linkOp("T_E06_06", "WL_E06_01");
linkOp("T_E06_07", "WL_E06_01");
addOp("task.patch", {
    taskTempOrId: "T_E06_08", fields: {
        accountingLinks: [
            { lineType: "material", lineId: "ML_E06_01" }, { lineType: "work", lineId: "WL_E06_01" }
        ]
    }
});
addOp("task.patch", {
    taskTempOrId: "T_E06_09", fields: {
        accountingLinks: [
            { lineType: "work", lineId: "WL_E06_01" }, { lineType: "work", lineId: "WL_E12_01" }
        ]
    }
});
linkOp("T_E06_10", "WL_E06_01");

// E07 Links
addOp("task.patch", {
    taskTempOrId: "T_E07_01", fields: {
        accountingLinks: [
            { lineType: "material", lineId: "ML_E07_01" }, { lineType: "work", lineId: "WL_E07_01" }
        ]
    }
});
linkOp("T_E07_02", "ML_E07_01", "material");
depOp("T_E07_02", ["T_E07_01"]);
linkOp("T_E07_03", "WL_E07_01");
linkOp("T_E07_04", "WL_E07_01");

// E08 Links
linkOp("T_E08_01", "ML_E08_01", "material");
linkOp("T_E08_02", "WL_E08_01");
linkOp("T_E08_03", "ML_E08_01", "material");
linkOp("T_E08_04", "WL_E08_01");
addOp("task.patch", {
    taskTempOrId: "T_E08_05", fields: {
        accountingLinks: [
            { lineType: "work", lineId: "WL_E12_01" }, { lineType: "work", lineId: "WL_E08_01" }
        ]
    }
});

// E05 Links
addOp("task.patch", {
    taskTempOrId: "T_E05_01", fields: {
        accountingLinks: [
            { lineType: "material", lineId: "ML_E05_01" }, { lineType: "work", lineId: "WL_E05_01" }
        ]
    }
});
linkOp("T_E05_02", "WL_E05_01");

// E09 Links
addOp("task.patch", {
    taskTempOrId: "T_E09_01", fields: {
        accountingLinks: [
            { lineType: "material", lineId: "ML_E09_01" }, { lineType: "work", lineId: "WL_E09_01" }
        ]
    }
});
linkOp("T_E09_02", "WL_E09_01");

// E10 Links
linkOp("T_E10_01", "ML_E10_01", "material");
linkOp("T_E10_02", "WL_E10_01");
linkOp("T_E10_03", "WL_E10_01");

// E12 Links
linkOp("T_E12_01", "WL_E12_01");
linkOp("T_E12_02", "WL_E12_01");

// E14 Install Links
linkOp("T_E14_01", "WL_E14_01");
linkOp("T_E14_02", "ML_E14_03", "material");
linkOp("T_E14_03", "ML_E13_02", "material");
addOp("task.patch", {
    taskTempOrId: "T_E14_10", fields: {
        accountingLinks: [
            { lineType: "work", lineId: "WL_E14_01" }, { lineType: "material", lineId: "ML_E14_03" }
        ]
    }
});
addOp("task.patch", {
    taskTempOrId: "T_E14_11", fields: {
        accountingLinks: [
            { lineType: "work", lineId: "WL_E14_01" }, { lineType: "material", lineId: "ML_E04_01" }, { lineType: "work", lineId: "WL_E04_01" }
        ]
    }
});
linkOp("T_E14_12", "WL_E14_01");
addOp("task.patch", {
    taskTempOrId: "T_E14_13", fields: {
        accountingLinks: [
            { lineType: "work", lineId: "WL_E14_01" }, { lineType: "material", lineId: "ML_E05_01" }
        ]
    }
});
linkOp("T_E14_14", "WL_E14_01");
linkOp("T_E14_15", "WL_E14_01");
addOp("task.patch", {
    taskTempOrId: "T_E14_20", fields: {
        accountingLinks: [
            { lineType: "work", lineId: "WL_E14_01" }, { lineType: "material", lineId: "ML_E01_01" }
        ]
    }
});
addOp("task.patch", {
    taskTempOrId: "T_E14_21", fields: {
        accountingLinks: [
            { lineType: "work", lineId: "WL_E14_01" }, { lineType: "material", lineId: "ML_E02_01" }, { lineType: "material", lineId: "ML_E13_02" }
        ]
    }
});
addOp("task.patch", {
    taskTempOrId: "T_E14_22", fields: {
        accountingLinks: [
            { lineType: "work", lineId: "WL_E14_01" }, { lineType: "material", lineId: "ML_E03_01" }
        ]
    }
});
addOp("task.patch", {
    taskTempOrId: "T_E14_23", fields: {
        accountingLinks: [
            { lineType: "work", lineId: "WL_E14_01" }, { lineType: "material", lineId: "ML_E08_01" }
        ]
    }
});
addOp("task.patch", {
    taskTempOrId: "T_E14_24", fields: {
        accountingLinks: [
            { lineType: "work", lineId: "WL_E14_01" }, { lineType: "material", lineId: "ML_E13_02" }
        ]
    }
});
linkOp("T_E14_25", "WL_E14_01");

// E15 Teardown Links
addOp("task.patch", {
    taskTempOrId: "T_E15_01", fields: {
        accountingLinks: [
            { lineType: "work", lineId: "WL_E15_01" }, { lineType: "material", lineId: "ML_E15_01" }
        ]
    }
});
linkOp("T_E15_02", "ML_E15_02", "material");
linkOp("T_E15_10", "WL_E15_01");
linkOp("T_E15_11", "WL_E15_01");
linkOp("T_E15_12", "WL_E15_01");
linkOp("T_E15_13", "WL_E15_01");
linkOp("T_E15_14", "WL_E15_01");
linkOp("T_E15_15", "WL_E15_01");
addOp("task.patch", {
    taskTempOrId: "T_E15_16", fields: {
        accountingLinks: [
            { lineType: "work", lineId: "WL_E15_01" }, { lineType: "material", lineId: "ML_E15_02" }
        ]
    }
});
linkOp("T_E15_17", "WL_E15_01");
linkOp("T_E15_18", "ML_E15_01", "material");

// E16 Repairs
linkOp("T_E16_01", "WL_E16_01");
addOp("task.patch", {
    taskTempOrId: "T_E16_02", fields: {
        accountingLinks: [
            { lineType: "work", lineId: "WL_E16_01" }, { lineType: "material", lineId: "ML_E16_01" }
        ]
    }
});

const changeset = {
    projectId: projectId,
    stage: "BREAKDOWN",
    status: "PROPOSED",
    ops: ops,
    reason_he: "טעינת נתוני פרויקט סקארה 26 (אוטומטי) " + new Date().toISOString(),
    createdBy_he: "System Import",
    createdAt: Date.now()
};

fs.writeFileSync('sacara.jsonl', JSON.stringify(changeset) + '\n');
console.log(`Generated sacara.jsonl with ${ops.length} ops`);
