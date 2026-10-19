// Rareté des paires d'initiales (prénom, nom) pour les célébrités connues en France. GÉNÉRÉ — ne pas éditer à la main.
// Source (octobre 2026) : pages les plus vues de Wikipédia en français sur 24 mois (classements mensuels + un jour
// par semaine), dont les personnes ont été identifiées avec Wikidata (11 373 personnes). Initiales calculées comme
// le jeu : première lettre du prénom, première lettre du dernier mot du nom hors particules, sans accents.
// commun : au moins 4 personnes parmi les 3 000 plus consultées ; peu commun : au moins 1 parmi ces 3 000 ou 6 en tout ;
// très rare : quelques personnes peu connues ; impossible : personne trouvée. Copie côté serveur : backend/pair_tiers.json.
export const PAIR_TIERS = {
  commun: [
    "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AJ", "AK", "AL", "AM", "AN", "AP", "AR", "AS", "AT", "AV", "AW", "BA",
    "BB", "BC", "BD", "BG", "BH", "BJ", "BL", "BM", "BP", "BR", "BS", "BV", "CA", "CB", "CC", "CD", "CF", "CG", "CH", "CJ",
    "CK", "CL", "CM", "CN", "CP", "CR", "CS", "CT", "DA", "DB", "DC", "DD", "DF", "DG", "DH", "DJ", "DL", "DM", "DP", "DR",
    "DS", "DT", "EA", "EB", "EC", "ED", "EF", "EG", "EH", "EJ", "EK", "EL", "EM", "EP", "ER", "ES", "ET", "EW", "EZ", "FA",
    "FB", "FC", "FD", "FF", "FG", "FH", "FL", "FM", "FP", "FR", "FS", "FT", "FV", "GA", "GB", "GC", "GD", "GF", "GG", "GH",
    "GK", "GL", "GM", "GP", "GR", "GS", "GT", "HA", "HB", "HC", "HD", "HF", "HG", "HH", "HL", "HM", "HS", "JA", "JB", "JC",
    "JD", "JE", "JF", "JG", "JH", "JJ", "JK", "JL", "JM", "JN", "JP", "JR", "JS", "JT", "JV", "JW", "JZ", "KA", "KB", "KC",
    "KG", "KH", "KJ", "KK", "KL", "KM", "KP", "KR", "KS", "LA", "LB", "LC", "LD", "LF", "LG", "LH", "LJ", "LL", "LM", "LN",
    "LP", "LR", "LS", "LT", "LV", "LW", "MA", "MB", "MC", "MD", "MF", "MG", "MH", "MJ", "MK", "ML", "MM", "MN", "MP", "MR",
    "MS", "MT", "MV", "MY", "NA", "NB", "NC", "ND", "NL", "NM", "NP", "NS", "PA", "PB", "PC", "PD", "PE", "PF", "PG", "PK",
    "PL", "PM", "PN", "PP", "PR", "PS", "PT", "PV", "RA", "RB", "RC", "RD", "RF", "RG", "RH", "RJ", "RK", "RL", "RM", "RN",
    "RP", "RR", "RS", "RV", "RW", "RZ", "SA", "SB", "SC", "SD", "SE", "SF", "SG", "SH", "SJ", "SK", "SL", "SM", "SP", "SR",
    "SS", "ST", "SV", "SW", "TA", "TB", "TC", "TG", "TH", "TJ", "TL", "TM", "TP", "TR", "TS", "TT", "VB", "VC", "VD", "VG",
    "VK", "VL", "VM", "VP", "VS", "WM", "YB", "YS",
  ],
  peuCommun: [
    "AY", "AZ", "BE", "BF", "BK", "BN", "BT", "BW", "BY", "CE", "CQ", "CV", "CW", "CY", "CZ", "DE", "DK", "DN", "DV", "DW",
    "EE", "EN", "EV", "EY", "FE", "FJ", "FK", "FN", "FQ", "FW", "GE", "GJ", "GN", "GV", "GW", "GX", "GZ", "HE", "HK", "HN",
    "HP", "HR", "HT", "HV", "HW", "HZ", "JQ", "KD", "KF", "KN", "KT", "KV", "KW", "LE", "LK", "LY", "LZ", "ME", "MQ", "MW",
    "MZ", "NF", "NG", "NH", "NJ", "NK", "NR", "NT", "NV", "NW", "NZ", "PH", "PJ", "PW", "QD", "QH", "QJ", "QM", "QS", "QT",
    "RE", "RQ", "RT", "RY", "SN", "SQ", "SY", "SZ", "TD", "TE", "TF", "TK", "TN", "TV", "TW", "TZ", "VA", "VE", "VF", "VH",
    "VJ", "VN", "VR", "VT", "VV", "VW", "VZ", "WA", "WB", "WC", "WD", "WG", "WH", "WL", "WP", "WR", "WS", "WW", "XA", "XE",
    "XF", "XG", "XJ", "XN", "YA", "YC", "YD", "YF", "YG", "YH", "YK", "YM", "YN", "YP", "YR", "YT", "YW", "YZ", "ZB", "ZC",
    "ZD", "ZL", "ZM", "ZR", "ZS", "ZT", "ZZ",
  ],
  tresRare: [
    "AQ", "AX", "BZ", "DQ", "DY", "DZ", "FZ", "GQ", "GY", "HJ", "HY", "JY", "KE", "KQ", "KY", "KZ", "NE", "NN", "NQ", "NY",
    "PQ", "PY", "PZ", "QE", "QF", "QN", "QP", "QV", "TY", "WE", "WF", "WJ", "WK", "WN", "WT", "WV", "WY", "XB", "XC", "XD",
    "XL", "XM", "XS", "XT", "YE", "YJ", "YL", "YQ", "YV", "ZA", "ZE", "ZH", "ZJ", "ZK", "ZN", "ZQ", "ZV", "ZX",
  ],
  impossible: [
    "BQ", "BX", "CX", "DX", "EQ", "EX", "FX", "FY", "HQ", "HX", "JX", "KX", "LQ", "LX", "MX", "NX", "PX", "QA", "QB", "QC",
    "QG", "QK", "QL", "QQ", "QR", "QW", "QX", "QY", "QZ", "RX", "SX", "TQ", "TX", "VQ", "VX", "VY", "WQ", "WX", "WZ", "XH",
    "XK", "XP", "XQ", "XR", "XV", "XW", "XX", "XY", "XZ", "YX", "YY", "ZF", "ZG", "ZP", "ZW", "ZY",
  ],
};

// Part de chaque rareté dans le tirage d'une paire, selon la difficulté (une plaque = deux paires tirées séparément).
export const TIER_RATES = {
  chill: { commun: 95, peuCommun: 5, tresRare: 0, impossible: 0 },
  normal: { commun: 85, peuCommun: 15, tresRare: 0, impossible: 0 },
  hardcore: { commun: 55, peuCommun: 35, tresRare: 10, impossible: 0 },
};
