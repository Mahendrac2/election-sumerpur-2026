// =========================================================================
// 🌾 पंचायती राज चुनाव 2026 — मास्टर डेटा (ग्राम पंचायत, PS वार्ड एवं प्रत्याशी)
// =========================================================================

// 1. ग्राम पंचायतों की सूची (सुमेरपुर पंचायत समिति संदर्भ)
const masterGramPanchayats = [
    { id: 1, name: "पुराड़ा", name_en: "Purada", ps_ward: 1, total_electors: 3450, total_booths: 4, sarpanch_reservation: "सामान्य (General)" },
    { id: 2, name: "बांकली", name_en: "Bankli", ps_ward: 2, total_electors: 4200, total_booths: 5, sarpanch_reservation: "महिला (OBC Female)" },
    { id: 3, name: "बलवाना", name_en: "Balwana", ps_ward: 3, total_electors: 2890, total_booths: 3, sarpanch_reservation: "अनुसूचित जाति (SC)" },
    { id: 4, name: "भारूण्डा", name_en: "Bharunda", ps_ward: 4, total_electors: 3600, total_booths: 4, sarpanch_reservation: "सामान्य महिला (Gen Female)" },
    { id: 5, name: "बिरामी", name_en: "Birami", ps_ward: 5, total_electors: 2450, total_booths: 3, sarpanch_reservation: "OBC" },
    { id: 6, name: "कोलीवाड़ा", name_en: "Koliwara", ps_ward: 6, total_electors: 3800, total_booths: 4, sarpanch_reservation: "सामान्य (General)" },
    { id: 7, name: "नोवी", name_en: "Novi", ps_ward: 7, total_electors: 3100, total_booths: 3, sarpanch_reservation: "SC महिला (SC Female)" },
    { id: 8, name: "पोमावा", name_en: "Pomawa", ps_ward: 8, total_electors: 2950, total_booths: 3, sarpanch_reservation: "सामान्य (General)" },
    { id: 9, name: "सिंदरू", name_en: "Sindru", ps_ward: 9, total_electors: 4100, total_booths: 5, sarpanch_reservation: "ST" },
    { id: 10, name: "पालड़ी", name_en: "Paldi", ps_ward: 10, total_electors: 3300, total_booths: 4, sarpanch_reservation: "सामान्य (General)" }
];

// 2. पंचायत समिति वार्ड (वार्ड 1 से 15/21)
const masterPsWards = [
    { ward: 1, name: "पंचायत समिति वार्ड 1 (पुराड़ा-क्षेत्र)", total_electors: 5800, reservation: "सामान्य" },
    { ward: 2, name: "पंचायत समिति वार्ड 2 (बांकली-क्षेत्र)", total_electors: 6200, reservation: "OBC महिला" },
    { ward: 3, name: "पंचायत समिति वार्ड 3 (बलवाना-क्षेत्र)", total_electors: 5400, reservation: "SC" },
    { ward: 4, name: "पंचायत समिति वार्ड 4 (भारूण्डा-क्षेत्र)", total_electors: 5900, reservation: "सामान्य महिला" },
    { ward: 5, name: "पंचायत समिति वार्ड 5 (कोलीवाड़ा-क्षेत्र)", total_electors: 6100, reservation: "सामान्य" }
];

// 3. राज्य निर्वाचन आयोग के अधिकृत मुक्त चुनाव चिह्न (Free Symbols for Sarpanch)
const freeSymbols = [
    "अलमारी", "उगता सूरज", "पतंग", "ताला और चाबी", "कार", "सिलाई मशीन",
    "ट्रैक्टर चलाता किसान", "बल्ला (क्रिकेट बैट)", "गैस का चूल्हा", "हवाई जहाज",
    "टेबल पंखा", "मोमबत्ती", "ग्लास", "कप और प्लेट", "हाथ घड़ी"
];

// 4. राजनीतिक दल (पंचायत समिति व जिला परिषद सदस्य हेतु)
const priParties = [
    { code: "BJP", name: "भारतीय जनता पार्टी", symbol: "कमल", color: "#f97316" },
    { code: "INC", name: "इण्डियन नेशनल कांग्रेस", symbol: "हाथ", color: "#0ea5e9" },
    { code: "IND", name: "निर्दलीय", symbol: "मुक्त चिह्न", color: "#8b5cf6" },
    { code: "RLP", name: "राष्ट्रीय लोकतांत्रिक पार्टी", symbol: "बोतल", color: "#10b981" },
    { code: "BSP", name: "बहुजन समाज पार्टी", symbol: "हाथी", color: "#3b82f6" }
];

module.exports = {
    masterGramPanchayats,
    masterPsWards,
    freeSymbols,
    priParties
};
