import React, { useEffect, useMemo, useState } from "react";

const API_URL =
  "https://script.google.com/macros/s/AKfycbx41QCs8kYM81auy4klVGdwyzTQhs2t8RRpm3s2eWCiymHI-r3JjPpZ2jkOAzln_lQ_/exec";

const CLEANING_MAP_URL = "/cleaning-map.jpg";
const MACHINE_OVERVIEW_URL = "/machine-overview.png";
const PART_TANK_URL = "/part-tank.png";
const PART_HOLDER_URL = "/part-holder.png";
const PART_TRAY_URL = "/part-tray.png";
const CACHE_KEY = "coffeeDutyAppCacheV4";
const SLACK_WEBHOOK_URL = "";
const WEATHER_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=35.7295&longitude=139.7190&current=temperature_2m,weather_code&timezone=Asia%2FTokyo";

function getWeatherIcon(code) {
  if ([0, 1].includes(code)) return "☀";
  if ([2, 3].includes(code)) return "⛅";
  if ([45, 48].includes(code)) return "🌫";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "🌧";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄";
  if ([95, 96, 99].includes(code)) return "⛈";
  return "☕";
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MACHINE_PARTS = {
  tank: {
    label: "Water Tank",
    image: PART_TANK_URL,
    badge: "Water Tank",
    steps: [
      "Remove the water tank from the coffee machine.",
      "Wash it with a sponge and tap water.",
      "Refill the tank with water and place it back in position.",
    ],
  },
  holder: {
    label: "Capsule Holder",
    image: PART_HOLDER_URL,
    badge: "Capsule Holder",
    steps: [
      "Remove the capsule holder from the machine.",
      "Wash both sides of the holder with tap water.",
      "Wipe off any moisture and return it to the original position.",
    ],
  },
  tray: {
    label: "Extraction Tray",
    image: PART_TRAY_URL,
    badge: "Extraction Tray",
    steps: [
      "Remove the extraction tray and extraction grid.",
      "Wash both parts with tap water.",
      "Wipe off dirt and moisture, then place them back in position.",
    ],
  },
};

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeDateKey(value) {
  if (!value) return "";

  if (value instanceof Date) {
    return toDateKey(value);
  }

  const str = String(value).trim();

  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(str)) return str;

  if (/^[0-9]{4}\/[0-9]{1,2}\/[0-9]{1,2}/.test(str)) {
    const parts = str.split(/[\/ ]/);
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return toDateKey(parsed);

  return str;
}

function getMonthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function normalizeMonthValue(value) {
  if (!value) return "";
  const str = String(value).trim();

  if (str.includes("/")) {
    const [year, month] = str.split("/");
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  return str.slice(0, 7);
}

function getActiveNamesForDate(date, versions, fallbackMembers = []) {
  if (!versions || versions.length === 0) return fallbackMembers;

  const targetMonth = getMonthKey(date);

  return versions
    .filter((m) => {
      const name = String(m.name || "").trim();
      const start = normalizeMonthValue(m.startMonth);
      const end = normalizeMonthValue(m.endMonth);

      if (!name || !start) return false;

      // endMonth is excluded from that month.
      // Example: endMonth = 2026/5 means excluded from 2026-05 onward.
      return start <= targetMonth && (!end || end > targetMonth);
    })
    .map((m) => String(m.name || "").trim())
    .filter(Boolean);
}

function isWeekend(date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

function isPastDate(date) {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return target < today;
}

function getBusinessDayIndex(date, holidays) {
  const start = new Date(date.getFullYear(), 0, 1);
  let count = 0;

  for (let d = new Date(start); d <= date; d.setDate(d.getDate() + 1)) {
    const key = toDateKey(d);
    if (!isWeekend(d) && !holidays.includes(key)) count++;
  }

  return count;
}

function getBaseCoffeeMember(date, members, holidays) {
  const key = toDateKey(date);

  if (!members.length) return "";
  if (isWeekend(date)) return "";
  if (holidays.includes(key)) return "";

  const index = (getBusinessDayIndex(date, holidays) - 1) % members.length;
  return members[index] || "";
}

function getChangedMember(date, assignmentChanges) {
  const key = toDateKey(date);
  const changes = assignmentChanges.filter((item) => item.date === key);

  if (!changes.length) return "";
  return changes[changes.length - 1].newMember || "";
}

function getCoffeeMember(date, members, holidays, assignmentChanges) {
  const changed = getChangedMember(date, assignmentChanges);
  if (changed) return changed;

  return getBaseCoffeeMember(date, members, holidays);
}

function isCoffeeRecordDone(record) {
  if (!record) return false;

  // Old format: trash / water / clean are all true.
  if (record.trash && record.water && record.clean) return true;

  // New GAS format: record exists with date/member/completedAt.
  if (record.date || record.member || record.completedAt) return true;

  return false;
}

function isCleaningRecordDone(record) {
  if (!record) return false;
  if (record.date || record.member || record.completedBy || record.completedAt) return true;
  return false;
}

function buildCalendar(year, month) {
  const firstDay = new Date(year, month - 1, 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function getNthWeekdayOfMonth(year, month, weekday, nth) {
  const first = new Date(year, month - 1, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month - 1, 1 + offset + (nth - 1) * 7);
}

function getCleaningDutiesForMonth(year, month, cleaningMembers) {
  const secondThursday = getNthWeekdayOfMonth(year, month, 4, 2);
  const fourthThursday = getNthWeekdayOfMonth(year, month, 4, 4);

  const baseIndex = (month - 1) * 2;

  return [
    {
      date: secondThursday,
      dateKey: toDateKey(secondThursday),
      member: cleaningMembers.length
        ? cleaningMembers[baseIndex % cleaningMembers.length]
        : "",
      area: "C",
    },
    {
      date: fourthThursday,
      dateKey: toDateKey(fourthThursday),
      member: cleaningMembers.length
        ? cleaningMembers[(baseIndex + 1) % cleaningMembers.length]
        : "",
      area: "D",
    },
  ];
}

function useWindowWidth() {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 980 : window.innerWidth
  );

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return width;
}

function MonthButton({ children, onClick }) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      style={{
        ...styles.monthButton,
        ...(pressed ? styles.monthButtonPressed : {}),
      }}
      aria-label="Change month"
    >
      {children}
    </button>
  );
}

function AppMotionStyles() {
  return (
    <style>{`
      html, body, #root {
        width: 100%;
        min-height: 100%;
        margin: 0;
      }

      #root {
        max-width: none !important;
        padding: 0 !important;
        text-align: left !important;
      }

      * {
        box-sizing: border-box;
      }

      @keyframes softPulseToday {
        0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.28), 0 8px 18px rgba(92,54,24,0.05); }
        70% { box-shadow: 0 0 0 9px rgba(245, 158, 11, 0), 0 14px 28px rgba(92,54,24,0.10); }
        100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0), 0 8px 18px rgba(92,54,24,0.05); }
      }

      @keyframes toastSlideIn {
        0% { transform: translateY(-8px); opacity: 0; }
        100% { transform: translateY(0); opacity: 1; }
      }

      @keyframes calendarOpen {
        0% { transform: translateY(-14px) scale(0.98); opacity: 0; }
        100% { transform: translateY(0) scale(1); opacity: 1; }
      }

      @keyframes checkPop {
        0% { transform: scale(0.5); opacity: 0; }
        45% { transform: scale(1.12); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }

      @keyframes skeletonShine {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      @keyframes confettiFall {
        0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
        100% { transform: translateY(110vh) rotate(520deg); opacity: 0; }
      }

      .soft-card,
      .info-hover-card,
      .cleaning-hover-row,
      .calendar-day {
        transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease;
      }

      .soft-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 34px 82px rgba(92, 54, 24, 0.20) !important;
      }

      .info-hover-card:hover,
      .cleaning-hover-row:hover {
        transform: translateY(-3px);
        box-shadow: 0 16px 34px rgba(92,54,24,0.12);
      }

      .calendar-day:hover {
        transform: translateY(-2px);
        box-shadow: 0 14px 28px rgba(92,54,24,0.12) !important;
      }

      .today-glow {
        animation: softPulseToday 2.2s ease-in-out infinite;
      }

      .complete-button {
        transition: transform 0.14s ease, box-shadow 0.14s ease, filter 0.14s ease;
      }

      .complete-button:hover:not(:disabled) {
        transform: translateY(-2px);
        filter: brightness(1.04);
        box-shadow: 0 20px 42px rgba(124,45,18,0.34) !important;
      }

      .complete-button:active:not(:disabled) {
        transform: translateY(2px) scale(0.98);
        box-shadow: 0 8px 18px rgba(124,45,18,0.22) !important;
      }

      .toast-message {
        animation: toastSlideIn 0.22s ease both;
      }

      .skeleton-shine {
        background: linear-gradient(90deg, #f3e8dc 25%, #fff7ed 50%, #f3e8dc 75%);
        background-size: 200% 100%;
        animation: skeletonShine 1.1s ease infinite;
      }

      .check-pop {
        animation: checkPop 0.55s ease both;
      }

      .calendar-panel-open {
        animation: calendarOpen 0.28s ease both;
      }

      @media (max-width: 980px) {
        .soft-card {
          border-radius: 26px !important;
        }
      }

      @media (max-width: 720px) {
        body {
          overflow-x: hidden;
        }

        .soft-card {
          border-radius: 22px !important;
        }

        button {
          touch-action: manipulation;
        }
        .soft-card:hover,
        .info-hover-card:hover,
        .cleaning-hover-row:hover,
        .calendar-day:hover {
          transform: none;
        }
      }
    `}</style>
  );
}

export default function App() {
  const width = useWindowWidth();
  const isMobile = width < 720;
  const today = new Date();
  const todayKey = toDateKey(today);

  const [members, setMembers] = useState([]);
  const [memberVersions, setMemberVersions] = useState([]);
  const [cleaningMemberVersions, setCleaningMemberVersions] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [records, setRecords] = useState({});
  const [assignmentChanges, setAssignmentChanges] = useState([]);
  const [cleaningMembers, setCleaningMembers] = useState([]);
  const [cleaningRecords, setCleaningRecords] = useState({});

  const [apiTodayMember, setApiTodayMember] = useState("");
  const [apiBaseMember, setApiBaseMember] = useState("");
  const [apiNextDuty, setApiNextDuty] = useState(null);
  const [apiHasChange, setApiHasChange] = useState(false);
  const [apiRecord, setApiRecord] = useState(null);
  const [appVersion, setAppVersion] = useState("v2.0.0");

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [showCalendar, setShowCalendar] = useState(false);
  const [mobileTab, setMobileTab] = useState("today");
  const [showConfetti, setShowConfetti] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [selectedMachinePart, setSelectedMachinePart] = useState("tank");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCheck, setShowCheck] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [installPrompt, setInstallPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("coffee-dark") === "1";
  });
  const [weather, setWeather] = useState({ label: "東池袋", icon: "☕", temp: "--" });

  const [selectedDate, setSelectedDate] = useState(null);
  const [changeName, setChangeName] = useState("");
  const [changeMember, setChangeMember] = useState("");
  const [changeReason, setChangeReason] = useState("");

  const selectedPart = MACHINE_PARTS[selectedMachinePart];

  const todayActiveMembers = useMemo(
    () => getActiveNamesForDate(today, memberVersions, members),
    [memberVersions, members, todayKey]
  );

  const monthCleaningDuties = useMemo(() => {
    const targetDate = new Date(year, month - 1, 1);
    const activeCleaningMembers = getActiveNamesForDate(
      targetDate,
      cleaningMemberVersions,
      cleaningMembers
    );

    return getCleaningDutiesForMonth(year, month, activeCleaningMembers);
  }, [year, month, cleaningMembers, cleaningMemberVersions]);

  const days = useMemo(() => buildCalendar(year, month), [year, month]);

  const localTodayMember = getCoffeeMember(
    today,
    todayActiveMembers,
    holidays,
    assignmentChanges
  );

  const todayMember = apiTodayMember || localTodayMember;

  const todayDone = !!apiRecord || isCoffeeRecordDone(records[todayKey]);

  const completedAt =
    apiRecord?.completedAt ||
    records[todayKey]?.completedAt ||
    records[todayKey]?.time ||
    "";

  const hasTodayChange =
    apiHasChange || !!getChangedMember(today, assignmentChanges);

  const baseMember =
    apiBaseMember || getBaseCoffeeMember(today, todayActiveMembers, holidays);

  function applyApiData(data) {
    setMembers(data.members || []);
    setMemberVersions(data.memberVersions || []);
    setCleaningMemberVersions(data.cleaningMemberVersions || []);
    setHolidays(data.holidays || []);
    setAssignmentChanges(data.assignmentChanges || []);
    setCleaningMembers(data.cleaningMembers || []);
    setAppVersion(data.appVersion || "v2.0.0");

    setApiTodayMember(data.todayMember || "");
    setApiBaseMember(data.baseMember || "");
    setApiNextDuty(data.nextDuty || null);
    setApiHasChange(!!data.hasChange);
    setApiRecord(data.record || null);

    const coffeeMap = {};
    (data.records || []).forEach((r) => {
      const key = normalizeDateKey(r.date);
      if (key) coffeeMap[key] = { ...r, date: key };
    });
    setRecords(coffeeMap);

    const cleaningMap = {};
    (data.cleaningRecords || []).forEach((r) => {
      const key = normalizeDateKey(r.date);
      if (key) cleaningMap[key] = { ...r, date: key };
    });
    setCleaningRecords(cleaningMap);
  }

  function loadCachedData() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return false;

      const data = JSON.parse(cached);
      applyApiData(data);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  async function loadData(forceRefresh = false) {
    setLoading(true);
    setMessage("");

    const hasCache = loadCachedData();
    if (hasCache && !forceRefresh) {
      setLoading(false);
    }

    if (!navigator.onLine) {
      setMessage("Offline mode: showing the latest saved data.");
      setLoading(false);
      return;
    }

    try {
      const url = forceRefresh ? `${API_URL}?t=${Date.now()}` : API_URL;
      const res = await fetch(url);
      const data = await res.json();

      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      applyApiData(data);
    } catch {
      if (!hasCache) {
        setMessage("Failed to load data. Please check the API connection.");
      } else {
        setMessage("Could not update. Showing cached data.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCachedData();
    loadData(false);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      loadData(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setMessage("Offline mode: showing the latest saved data.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const autoReload = setInterval(() => {
      loadData(true);
    }, 300000);

    return () => clearInterval(autoReload);
  }, []);

  useEffect(() => {
    let startY = 0;

    const handleTouchStart = (e) => {
      startY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e) => {
      const endY = e.changedTouches[0].clientY;
      if (window.scrollY === 0 && endY - startY > 90) {
        loadData(true);
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("coffee-dark", darkMode ? "1" : "0");
  }, [darkMode]);

  useEffect(() => {
    async function loadWeather() {
      try {
        const res = await fetch(WEATHER_URL);
        const data = await res.json();
        const temp = Math.round(data?.current?.temperature_2m);
        const code = Number(data?.current?.weather_code ?? -1);
        setWeather({
          label: "東池袋",
          icon: getWeatherIcon(code),
          temp: Number.isFinite(temp) ? temp : "--",
        });
      } catch {
        setWeather({ label: "東池袋", icon: "☕", temp: "--" });
      }
    }

    loadWeather();
    const timer = setInterval(loadWeather, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setCanInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  async function postData(data) {
    await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  const saveCoffeeComplete = async () => {
    if (!todayMember || todayDone) return;

    const data = {
      action: "completeCoffee",
      member: todayMember,
      user: todayMember,
    };

    setMessage("Saving...");

    try {
      await postData(data);
      setApiRecord({
        date: todayKey,
        member: todayMember,
        completedAt: new Date().toLocaleTimeString("ja-JP", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
      setRecords((prev) => ({
        ...prev,
        [todayKey]: {
          date: todayKey,
          member: todayMember,
          trash: true,
          water: true,
          clean: true,
          completedAt: new Date().toISOString(),
        },
      }));

      setShowCheck(true);
      setShowConfetti(true);
      setMessage("Slack notification sent: Coffee cleaning report has been saved.");

      try {
        if (SLACK_WEBHOOK_URL) {
          await fetch(SLACK_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `☕ Coffee completed by ${todayMember}`,
          }),
        });
        }
      } catch {}
      setTimeout(() => setShowCheck(false), 1100);
      setTimeout(() => setShowConfetti(false), 1800);
      setTimeout(() => setMessage(""), 2800);
    } catch {
      setMessage("Failed to save the report.");
    }
  };

  const installApp = async () => {
    if (!installPrompt) return;

    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setCanInstall(false);
  };

  const saveCleaningComplete = async (duty) => {
    if (duty.dateKey !== todayKey) return;

    const completedBy = window.prompt(
      "Enter your name to complete this report."
    );
    if (!completedBy) return;

    const data = {
      type: "cleaning_complete",
      date: duty.dateKey,
      member: duty.member,
      area: duty.area,
      completedBy,
    };

    setMessage("Saving...");

    try {
      await postData(data);
      setCleaningRecords((prev) => ({
        ...prev,
        [duty.dateKey]: data,
      }));
      setMessage("Area cleaning report has been saved.");
      setTimeout(() => setMessage(""), 2500);
    } catch {
      setMessage("Failed to save the report.");
    }
  };

  const openChangeForm = (date) => {
    if (isPastDate(date)) return;

    const activeMembersForDate = getActiveNamesForDate(
      date,
      memberVersions,
      members
    );

    const member = getCoffeeMember(
      date,
      activeMembersForDate,
      holidays,
      assignmentChanges
    );
    if (!member) return;

    setSelectedDate(date);
    setChangeMember(member);
    setChangeName("");
    setChangeReason("");
  };

  const saveAssignmentChange = async () => {
    if (!selectedDate) return;

    if (!changeName.trim() || !changeMember) {
      setMessage("Please enter the changer name and the new assignee.");
      return;
    }

    const dateKey = toDateKey(selectedDate);
    const activeMembersForDate = getActiveNamesForDate(
      selectedDate,
      memberVersions,
      members
    );

    const oldMember = getCoffeeMember(
      selectedDate,
      activeMembersForDate,
      holidays,
      assignmentChanges
    );

    const data = {
      action: "changeAssignment",
      type: "assignment_change",
      date: dateKey,
      oldMember,
      newMember: changeMember,
      changedBy: changeName.trim(),
      reason: changeReason.trim(),
    };

    setMessage("Saving...");

    try {
      await postData(data);
      setAssignmentChanges((prev) => [...prev, data]);
      setSelectedDate(null);
      setMessage("Assignee change has been saved.");
      setTimeout(() => setMessage(""), 2500);
      await loadData();
    } catch {
      setMessage("Failed to save the change.");
    }
  };

  const movePrevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const moveNextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  return (
    <div style={{ ...styles.page, ...(darkMode ? styles.pageDark : {}) }}>
      <AppMotionStyles />
      <div style={styles.decorCircleOne} />
      <div style={styles.decorCircleTwo} />

      <div style={styles.appShell}>
        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>Coffee Dolce Operations</div>
            <h1 style={styles.title}>Coffee Duty</h1>
            <div style={styles.subtitle}>
              A small daily routine, beautifully managed.
            </div>
            <div style={styles.quoteText}>
              “Keep the coffee flowing ☕”
            </div>
          </div>

          <div style={styles.weatherBadge}>
            {weather.icon} {weather.temp}°C · {weather.label}
          </div>

          <div style={styles.headerRight}>
            {!isOnline && <div style={styles.offlineBadge}>Offline</div>}
            <div style={styles.versionBadge}>{appVersion}</div>
            {canInstall && (
              <button type="button" onClick={installApp} style={styles.installButton}>
                Install App
              </button>
            )}
            <button
              type="button"
              onClick={() => setDarkMode((v) => !v)}
              style={styles.darkModeButton}
            >
              {darkMode ? "Light" : "Dark"}
            </button>

            <button type="button" onClick={() => loadData(true)} style={styles.refreshButton}>
              Refresh
            </button>
          </div>
        </header>

        <div
          style={{
            ...styles.dashboardLayout,
            ...(isMobile ? styles.dashboardLayoutMobile : {}),
          }}
        >
        <main className="soft-card" style={styles.heroCard}>
          <div style={styles.heroTopRow}>
            <div>
              <div style={styles.todayHeroCard}>
                <div style={styles.todayHeroKicker}>☕ TODAY DUTY</div>
                <div style={styles.todayLabel}>Today's Coffee Cleaning Duty</div>
              <div style={styles.todayMemberCompact}>
                {loading && !todayMember ? (
                  <span style={styles.skeletonText}>Loading...</span>
                ) : (
                  todayMember || "No duty today"
                )}
              </div>
            </div>
            </div>

            <div style={styles.statusStack}>
              {hasTodayChange && (
                <div style={styles.changeBadge}>Changed Today</div>
              )}

              {todayDone ? (
                <div style={styles.doneBadge}>
                  Completed{completedAt ? ` · ${completedAt}` : ""}
                </div>
              ) : (
                <div style={styles.pendingBadge}>Waiting Report</div>
              )}
            </div>
          </div>
          <div style={styles.infoGrid}>
            <div className="info-hover-card" style={styles.infoCard}>
              <div style={styles.infoLabel}>Base Assignee</div>
              <div style={styles.infoValue}>{baseMember || "-"}</div>
            </div>

            <div className="info-hover-card" style={styles.infoCard}>
              <div style={styles.infoLabel}>Next Duty</div>
              <div style={styles.infoValue}>{apiNextDuty?.member || "-"}</div>
              {apiNextDuty?.date && (
                <div style={styles.infoSub}>{apiNextDuty.date}</div>
              )}
            </div>

            <div className="info-hover-card" style={styles.infoCard}>
              <div style={styles.infoLabel}>Today</div>
              <div style={styles.infoValue}>{todayKey}</div>
            </div>
          </div>

          <button
            className="complete-button"
            type="button"
            onClick={saveCoffeeComplete}
            disabled={!todayMember || todayDone}
            style={{
              ...styles.primaryButton,
              ...(!todayMember || todayDone ? styles.disabledButton : {}),
            }}
          >
            {todayDone ? "Completed" : "Complete Coffee Cleaning"}
          </button>

          {message && (
            <div className="toast-message" style={styles.message}>
              <span style={styles.slackIcon}>#</span>
              <span>{message}</span>
            </div>
          )}
        </main>

        <section style={styles.cleaningSection}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionKicker}>Floor Cleaning</div>
              <h2 style={styles.sectionTitle}>Monthly Area Cleaning Duty</h2>
            </div>
          </div>

          <div style={styles.cleaningList}>
            {monthCleaningDuties.map((duty) => {
              const done = isCleaningRecordDone(cleaningRecords[duty.dateKey]);
              const completedBy = cleaningRecords[duty.dateKey]?.completedBy || "";
              const canComplete = duty.dateKey === todayKey && !done;

              return (
                <div
                  key={duty.dateKey}
                  className="cleaning-hover-row"
                  style={{
                    ...styles.cleaningDutyRow,
                    ...(done ? styles.cleaningDutyRowDone : {}),
                    ...(isMobile ? styles.cleaningDutyRowMobile : {}),
                  }}
                >
                  <div>
                    <div style={styles.cleaningDutyDate}>{duty.dateKey}</div>
                    <div style={styles.cleaningDutyMember}>
                      {duty.member || "Unassigned"}
                    </div>
                    {done && completedBy && (
                      <div style={styles.completedByText}>
                        Completed by {completedBy}
                      </div>
                    )}
                  </div>

                  <div style={styles.cleaningDutyArea}>Area {duty.area}</div>

                  <button
                    type="button"
                    onClick={() => saveCleaningComplete(duty)}
                    disabled={!canComplete}
                    style={{
                      ...styles.cleaningCompleteButton,
                      ...(!canComplete
                        ? styles.cleaningCompleteButtonDisabled
                        : {}),
                    }}
                  >
                    {done ? "Completed" : "Complete"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <div style={styles.rightColumn}>
          <section style={styles.cleaningSection}>
            <div style={styles.sectionHeader}>
              <div>
                <div style={styles.sectionKicker}>Quick Status</div>
                <h2 style={styles.sectionTitle}>Today's Overview</h2>
              </div>
            </div>

            <div style={styles.infoGrid}>
              <div className="info-hover-card" style={styles.infoCard}>
                <div style={styles.infoLabel}>Today Duty</div>
                <div style={styles.infoValue}>{todayMember || "-"}</div>
              </div>

              <div className="info-hover-card" style={styles.infoCard}>
                <div style={styles.infoLabel}>Status</div>
                <div style={styles.infoValue}>{todayDone ? "Done" : "Waiting"}</div>
              </div>

              <div className="info-hover-card" style={styles.infoCard}>
                <div style={styles.infoLabel}>Weather</div>
                <div style={styles.infoValue}>{weather.icon} {weather.temp}°C</div>
              </div>
            </div>
          </section>
        </div>
        </div>

        {isMobile && (
          <div style={styles.mobileTabs}>
            {[
              ["today", "Today"],
              ["calendar", "Calendar"],
              ["rules", "Rules"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMobileTab(key)}
                style={mobileTab === key ? styles.mobileTabActive : styles.mobileTab}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div
          style={{
            ...(isMobile && mobileTab !== "today" ? { display: "none" } : {}),
            ...styles.commandArea,
            ...(isMobile ? styles.commandAreaMobile : {}),
          }}
        >
          <button
            type="button"
            onClick={() => setShowRules(true)}
            style={{ ...styles.tabButton, ...styles.ruleButton }}
          >
            Cleaning Rules
          </button>

          <button
            type="button"
            onClick={() => setShowCalendar((v) => !v)}
            style={{ ...styles.tabButton, ...styles.secondaryButton }}
          >
            {showCalendar ? "Close Calendar" : "Open Calendar"}
          </button>

          <button
            type="button"
            onClick={() => setShowMap(true)}
            style={{ ...styles.tabButton, ...styles.mapTabButton }}
          >
            Cleaning Area
          </button>
        </div>

        <section
          style={{
            ...(isMobile && mobileTab !== "calendar" ? { display: "none" } : {}),
            ...styles.calendarPanel,
            maxHeight: showCalendar ? 980 : 0,
            opacity: showCalendar ? 1 : 0,
            transform: showCalendar ? "translateY(0)" : "translateY(-12px)",
            pointerEvents: showCalendar ? "auto" : "none",
          }}
        >
          <div style={styles.calendarHeader}>
            <MonthButton onClick={movePrevMonth}>‹</MonthButton>
            <div style={styles.monthTitle}>
              {MONTH_NAMES[month - 1]} {year}
            </div>
            <MonthButton onClick={moveNextMonth}>›</MonthButton>
          </div>

          <div style={isMobile ? styles.calendarScroll : undefined}>
            <div
              style={{
                ...styles.weekGrid,
                ...(isMobile ? styles.weekGridMobile : {}),
              }}
            >
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
                <div key={w} style={styles.weekHeader}>
                  {w}
                </div>
              ))}
            </div>

            <div
              style={{
                ...styles.calendarGrid,
                ...(isMobile ? styles.calendarGridMobile : {}),
              }}
            >
              {days.map((date) => {
                const key = toDateKey(date);
                const inMonth = date.getMonth() + 1 === month;
                const holiday = holidays.includes(key);
                const weekend = isWeekend(date);

                const activeMembersForDate = getActiveNamesForDate(
                  date,
                  memberVersions,
                  members
                );

                const member = getCoffeeMember(
                  date,
                  activeMembersForDate,
                  holidays,
                  assignmentChanges
                );

                const done = isCoffeeRecordDone(records[key]);
                const isToday = key === todayKey;
                const changed = !!getChangedMember(date, assignmentChanges);
                const canChange = inMonth && member && !isPastDate(date);

                let cellStyle = styles.dayCell;
                if (!inMonth) cellStyle = { ...cellStyle, ...styles.dayMuted };
                else if (done) cellStyle = { ...cellStyle, ...styles.dayDone };
                else if (isToday) cellStyle = { ...cellStyle, ...styles.dayToday };
                else if (weekend) cellStyle = { ...cellStyle, ...styles.dayWeekend };
                else if (holiday) cellStyle = { ...cellStyle, ...styles.dayHoliday };

                return (
                  <div
                    key={key}
                    className={`calendar-day ${isToday ? "today-glow" : ""}`}
                    style={{
                      ...cellStyle,
                      cursor: canChange ? "pointer" : "default",
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openChangeForm(date);
                    }}
                    onClick={() => {
                      if (!isMobile) openChangeForm(date);
                    }}
                    title={canChange ? "Click to change assignee" : ""}
                  >
                    <div style={styles.dayNumber}>{date.getDate()}</div>

                    {inMonth && holiday && (
                      <div style={styles.holidayText}>Holiday</div>
                    )}

                    {inMonth && member && (
                      <>
                        <div style={styles.memberName} title={member}>
                          {member}
                        </div>
                        {changed && <div style={styles.changedMark}>Changed</div>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {showCheck && (
        <div style={styles.checkOverlay}>
          <div style={styles.checkCircle}>✓</div>
        </div>
      )}

      {showConfetti && (
        <div style={styles.confettiWrap}>
          {Array.from({ length: 28 }).map((_, i) => (
            <div
              key={i}
              style={{
                ...styles.confetti,
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 0.6}s`,
              }}
            />
          ))}
        </div>
      )}

      {showRules && (
        <div style={styles.modalOverlay} onClick={() => setShowRules(false)}>
          <div style={styles.rulesModalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={styles.modalTitle}>Cleaning Rules</h2>
                <div style={styles.modalSubText}>
                  Daily operating procedure for keeping the coffee area clean.
                </div>
              </div>
              <button type="button" onClick={() => setShowRules(false)} style={styles.cancelButton}>
                Close
              </button>
            </div>

            <div style={styles.ruleList}>
              <div style={{ ...styles.ruleSection, ...styles.ruleMorning }}>
                <div style={styles.ruleTitle}>Morning Routine</div>
                <ul style={styles.ruleBullets}>
                  <li>Refill the water tank.</li>
                  <li>Check the capsule trash bin.</li>
                  <li>Wipe off water drops around the coffee machine.</li>
                </ul>
              </div>

              <div style={{ ...styles.ruleSection, ...styles.ruleEvening }}>
                <div style={styles.ruleTitle}>Evening Routine</div>
                <ul style={styles.ruleBullets}>
                  <li>Clean the area around the coffee machine.</li>
                  <li>Empty the capsule trash bin and wash it.</li>
                  <li>Check capsules, paper cups, and stirrers.</li>
                </ul>
              </div>

              <div style={{ ...styles.ruleSection, ...styles.ruleMachine }}>
                <div style={styles.ruleTitle}>Coffee Machine Cleaning Guide</div>

                <div style={styles.machineOverviewCard}>
                  <div style={styles.machineOverviewHeader}>
                    <div>
                      <div style={styles.machineOverviewTitle}>Parts Guide</div>
                      <div style={styles.machineOverviewSubText}>
                        Select a part to review cleaning steps.
                      </div>
                    </div>
                    <div style={styles.machineOverviewBadge}>Manual</div>
                  </div>

                  <img
                    src={MACHINE_OVERVIEW_URL}
                    alt="Coffee machine parts overview"
                    style={styles.machineOverviewImage}
                  />
                </div>

                <div style={{ ...styles.partTabs, ...(isMobile ? styles.partTabsMobile : {}) }}>
                  {Object.entries(MACHINE_PARTS).map(([key, part]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedMachinePart(key)}
                      style={selectedMachinePart === key ? styles.partTabActive : styles.partTab}
                    >
                      {part.label}
                    </button>
                  ))}
                </div>

                <div style={{ ...styles.partDetailCard, ...(isMobile ? styles.partDetailCardMobile : {}) }}>
                  <div style={{ ...styles.partImageBox, ...(isMobile ? styles.partImageBoxMobile : {}) }}>
                    <img src={selectedPart.image} alt={selectedPart.label} style={styles.partImage} />
                  </div>

                  <div style={styles.partDetailTextBox}>
                    <div style={styles.partBadge}>{selectedPart.badge}</div>
                    <div style={styles.partTitle}>{selectedPart.label}</div>
                    <ol style={styles.partSteps}>
                      {selectedPart.steps.map((step, index) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>

              <div style={{ ...styles.ruleSection, ...styles.ruleFloor }}>
                <div style={styles.ruleTitle}>Floor Cleaning</div>
                <ul style={styles.ruleBullets}>
                  <li>Vacuum the assigned cleaning area.</li>
                  <li>Clean visible dust, trash, or stains if found.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {showMap && (
        <div style={styles.modalOverlay} onClick={() => setShowMap(false)}>
          <div style={styles.mapModalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={styles.modalTitle}>Cleaning Area</h2>
                <div style={styles.modalSubText}>
                  Check the assigned area and clean the corresponding space.
                </div>
              </div>
              <button type="button" onClick={() => setShowMap(false)} style={styles.cancelButton}>
                Close
              </button>
            </div>

            <div style={styles.mapViewer}>
              <div style={styles.mapToolbar}>
                <div style={styles.mapToolbarTitle}>Cleaning Area Map</div>
                <div style={styles.mapToolbarBadge}>Reference</div>
              </div>

              <div style={styles.mapImageFrame}>
                <img src={CLEANING_MAP_URL} alt="Cleaning area map" style={styles.cleaningMapImage} />
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedDate && (
        <div style={styles.modalOverlay} onClick={() => setSelectedDate(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Change Assignee</h2>
            <div style={styles.modalDate}>{toDateKey(selectedDate)}</div>
            <div style={styles.historyInfoBox}>
              <div style={styles.historyTitle}>Latest Change History</div>
              <div style={styles.historyText}>
                Changed by: {assignmentChanges.find((a) => a.date === toDateKey(selectedDate))?.changedBy || "-"}
              </div>
              <div style={styles.historyText}>
                Reason: {assignmentChanges.find((a) => a.date === toDateKey(selectedDate))?.reason || "-"}
              </div>
            </div>

            <button
              type="button"
              onClick={() => window.open("https://slack.com/app_redirect?channel=general", "_blank")}
              style={styles.slackOpenButton}
            >
              Open Slack
            </button>

            <label style={styles.formLabel}>Changed By</label>
            <input
              value={changeName}
              onChange={(e) => setChangeName(e.target.value)}
              style={styles.input}
              placeholder="e.g. Takagi"
            />

            <label style={styles.formLabel}>New Assignee</label>
            <select
              value={changeMember}
              onChange={(e) => setChangeMember(e.target.value)}
              style={styles.input}
            >
              {getActiveNamesForDate(selectedDate, memberVersions, members).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <label style={styles.formLabel}>Reason Optional</label>
            <input
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              style={styles.input}
              placeholder="e.g. Substitute duty"
            />

            <div style={styles.modalActions}>
              <button type="button" onClick={() => setSelectedDate(null)} style={styles.cancelButton}>
                Cancel
              </button>

              <button type="button" onClick={saveAssignmentChange} style={styles.saveButton}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  darkModeButton: {
    padding: "9px 13px",
    borderRadius: 999,
    border: "1px solid rgba(146,64,14,0.12)",
    background: "#24160f",
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 950,
    cursor: "pointer",
  },
  weatherBadge: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#9a3412",
    fontSize: 12,
    fontWeight: 950,
  },
  quoteText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: 700,
    color: "#7c5a46",
    fontStyle: "italic",
  },
  todayHeroCard: {
    padding: "10px 0",
  },
  todayHeroKicker: {
    marginBottom: 8,
    fontSize: 11,
    fontWeight: 950,
    color: "#9a3412",
    letterSpacing: "0.12em",
  },
  stickyHeader: {
    position: "sticky",
    top: 10,
    zIndex: 30,
    marginBottom: 14,
  },
  stickyInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.82)",
    backdropFilter: "blur(14px)",
    border: "1px solid rgba(146,64,14,0.12)",
    boxShadow: "0 14px 30px rgba(92,54,24,0.12)",
  },
  stickyTodayLabel: {
    fontSize: 11,
    fontWeight: 950,
    color: "#9a3412",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  stickyTodayMember: {
    flex: 1,
    fontSize: 20,
    fontWeight: 950,
    color: "#24160f",
  },
  stickyDonePill: {
    padding: "7px 11px",
    borderRadius: 999,
    background: "#f6eadf",
    border: "1px solid #dfc2a8",
    color: "#7c2d12",
    fontSize: 12,
    fontWeight: 950,
  },
  stickyWaitingPill: {
    padding: "7px 11px",
    borderRadius: 999,
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#9a3412",
    fontSize: 12,
    fontWeight: 950,
  },
  mobileTabs: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 8,
    marginBottom: 14,
  },
  mobileTab: {
    padding: "11px 8px",
    borderRadius: 999,
    border: "1px solid #e7d4c2",
    background: "#ffffff",
    fontSize: 12,
    fontWeight: 900,
    color: "#7c2d12",
  },
  mobileTabActive: {
    padding: "11px 8px",
    borderRadius: 999,
    border: "1px solid #7c2d12",
    background: "#7c2d12",
    fontSize: 12,
    fontWeight: 900,
    color: "#ffffff",
  },
  confettiWrap: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    overflow: "hidden",
    zIndex: 90,
  },
  confetti: {
    position: "absolute",
    top: -20,
    width: 10,
    height: 18,
    borderRadius: 3,
    background: "#b45309",
    animation: "confettiFall 1.6s linear forwards",
  },
  historyInfoBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 16,
    background: "#fff7ed",
    border: "1px solid #fed7aa",
  },
  historyTitle: {
    fontSize: 12,
    fontWeight: 950,
    color: "#9a3412",
    marginBottom: 6,
  },
  historyText: {
    fontSize: 12,
    fontWeight: 700,
    color: "#5c3b2a",
    marginTop: 2,
  },
  slackOpenButton: {
    marginTop: 12,
    width: "100%",
    padding: "12px 14px",
    borderRadius: 999,
    border: "none",
    background: "#4a154b",
    color: "#ffffff",
    fontWeight: 950,
    cursor: "pointer",
  },
  page: {
    minHeight: "100vh",
    width: "100vw",
    padding: "clamp(14px, 1.4vw, 24px)"
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    background:
      "radial-gradient(circle at top left, #fdecc8 0, transparent 34%), radial-gradient(circle at top right, #dbeafe 0, transparent 30%), linear-gradient(135deg, #fff7ed 0%, #f8fafc 48%, #eef2ff 100%)",
    color: "#24160f",
    letterSpacing: "0.01em",
    position: "relative",
    overflowX: "hidden",
  },
  pageDark: {
    background:
      "radial-gradient(circle at top left, rgba(180,83,9,0.18) 0, transparent 34%), radial-gradient(circle at top right, rgba(30,41,59,0.42) 0, transparent 30%), linear-gradient(135deg, #1c120c 0%, #24160f 48%, #0f172a 100%)",
    color: "#fff7ed",
  },
  decorCircleOne: {
    position: "fixed",
    width: 280,
    height: 280,
    borderRadius: "50%",
    background: "rgba(146, 64, 14, 0.08)",
    top: -120,
    left: -80,
    pointerEvents: "none",
  },
  decorCircleTwo: {
    position: "fixed",
    width: 340,
    height: 340,
    borderRadius: "50%",
    background: "rgba(30, 64, 175, 0.08)",
    right: -120,
    bottom: -120,
    pointerEvents: "none",
  },
  appShell: {
    width: "100%",
    maxWidth: "none",
    margin: "0",
    position: "relative",
    zIndex: 1,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 16,
    marginBottom: 22,
    flexWrap: "wrap",
  },
  kicker: {
    fontSize: 12,
    fontWeight: 900,
    color: "#9a3412",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  title: {
    margin: "4px 0 0",
    fontSize: "clamp(34px, 5vw, 52px)",
    fontWeight: 950,
    letterSpacing: "-0.05em",
    lineHeight: 1,
    color: "#1c120c",
  },
  subtitle: {
    marginTop: 8,
    color: "#7c5a46",
    fontSize: 13,
    fontWeight: 750,
  },
  headerRight: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  versionBadge: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.72)",
    border: "1px solid rgba(146,64,14,0.12)",
    fontSize: 12,
    fontWeight: 900,
    color: "#78350f",
    boxShadow: "0 10px 24px rgba(120, 53, 15, 0.08)",
  },
  offlineBadge: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "#fee2e2",
    border: "1px solid #fecaca",
    fontSize: 12,
    fontWeight: 950,
    color: "#991b1b",
  },
  installButton: {
    padding: "9px 13px",
    borderRadius: 999,
    border: "1px solid #dfc2a8",
    background: "#f6eadf",
    color: "#7c2d12",
    fontSize: 12,
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(120, 53, 15, 0.08)",
  },
  refreshButton: {
    padding: "9px 13px",
    borderRadius: 999,
    border: "1px solid rgba(120,53,15,0.16)",
    background: "#ffffff",
    color: "#3b2418",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(120, 53, 15, 0.08)",
  },
  dashboardLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(360px, 1.15fr) minmax(300px, 0.85fr) minmax(300px, 0.85fr)",
    gap: 20,
    alignItems: "start",
    width: "100%",
  },
  dashboardLayoutMobile: {
    gridTemplateColumns: "1fr",
  },
  rightColumn: {
    display: "grid",
    gap: 18,
    alignContent: "start",
    marginTop: 18,
  },
  heroCard: {
    padding: "clamp(18px, 2vw, 30px)",
    borderRadius: 34,
    background: "rgba(255,255,255,0.82)",
    backdropFilter: "blur(16px)",
    border: "1px solid rgba(255,255,255,0.75)",
    boxShadow: "0 30px 70px rgba(92, 54, 24, 0.16)",
  },
  heroTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 18,
    flexWrap: "wrap",
  },
  todayLabel: {
    fontSize: 12,
    fontWeight: 900,
    color: "#9a3412",
    marginBottom: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },
  todayMemberCompact: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 70,
    padding: "12px clamp(16px, 2vw, 28px)",
    borderRadius: 26,
    background:
      "linear-gradient(135deg, rgba(120,53,15,0.12), rgba(253,230,138,0.42))",
    border: "1px solid rgba(146,64,14,0.16)",
    fontSize: "clamp(26px, 5vw, 54px)",
    fontWeight: 950,
    letterSpacing: "-0.04em",
    color: "#2b170e",
  },
  statusStack: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "flex-end",
  },
  changeBadge: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "#ffedd5",
    color: "#9a3412",
    fontSize: 12,
    fontWeight: 950,
    border: "1px solid #fed7aa",
  },
  doneBadge: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "#ead7c5",
    color: "#7c2d12",
    fontSize: 12,
    fontWeight: 950,
    border: "1px solid #b98a64",
  },
  pendingBadge: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "#fef9c3",
    color: "#854d0e",
    fontSize: 12,
    fontWeight: 950,
    border: "1px solid #fde68a",
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    margin: "22px 0",
  },
  infoCard: {
    padding: 14,
    borderRadius: 20,
    background: "rgba(255,255,255,0.72)",
    border: "1px solid rgba(148, 111, 82, 0.16)",
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: 900,
    color: "#8b5e3c",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  infoValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: 950,
    color: "#2b170e",
  },
  infoSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: 750,
    color: "#7c5a46",
  },
  primaryButton: {
    width: "100%",
    padding: "15px 24px",
    borderRadius: 999,
    border: "none",
    background: "linear-gradient(135deg, #7c2d12, #b45309)",
    color: "white",
    fontSize: 14,
    fontWeight: 950,
    letterSpacing: "0.04em",
    cursor: "pointer",
    boxShadow: "0 16px 34px rgba(124,45,18,0.28)",
  },
  disabledButton: {
    background: "#a8a29e",
    cursor: "not-allowed",
    boxShadow: "none",
  },
  message: {
    marginTop: 16,
    padding: "10px 12px",
    borderRadius: 16,
    background: "#fff7ed",
    color: "#9a3412",
    fontSize: 13,
    fontWeight: 850,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  slackIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    background: "#4a154b",
    color: "#ffffff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 950,
  },
  skeletonText: {
    minWidth: 150,
    height: 38,
    borderRadius: 999,
    color: "transparent",
    display: "inline-block",
    background: "linear-gradient(90deg, #f3e8dc 25%, #fff7ed 50%, #f3e8dc 75%)",
    backgroundSize: "200% 100%",
    animation: "skeletonShine 1.1s ease infinite",
  },
  checkOverlay: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    zIndex: 80,
  },
  checkCircle: {
    width: 92,
    height: 92,
    borderRadius: "50%",
    background: "#7c2d12",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 52,
    fontWeight: 950,
    boxShadow: "0 22px 60px rgba(124,45,18,0.36)",
    animation: "checkPop 0.55s ease both",
  },
  cleaningSection: {
    marginTop: 0,
    padding: "clamp(16px, 2vw, 24px)",
    borderRadius: 28,
    background: "rgba(255,255,255,0.72)",
    border: "1px solid rgba(255,255,255,0.75)",
    boxShadow: "0 20px 48px rgba(92,54,24,0.1)",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionKicker: {
    fontSize: 11,
    fontWeight: 950,
    color: "#9a3412",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  sectionTitle: {
    margin: "4px 0 0",
    fontSize: 20,
    fontWeight: 950,
    letterSpacing: "-0.03em",
  },
  cleaningList: {
    display: "grid",
    gap: 10,
  },
  cleaningDutyRow: {
    display: "grid",
    gridTemplateColumns: "1.5fr 0.8fr 1fr",
    gap: 10,
    alignItems: "center",
    padding: 14,
    borderRadius: 18,
    background: "#fffaf3",
    border: "1px solid rgba(146,64,14,0.12)",
  },
  cleaningDutyRowDone: {
    background: "#f6eadf",
    border: "1px solid #dfc2a8",
  },
  cleaningDutyRowMobile: {
    gridTemplateColumns: "1fr",
    textAlign: "left",
  },
  cleaningDutyDate: {
    fontSize: 13,
    fontWeight: 900,
    color: "#7c5a46",
  },
  cleaningDutyMember: {
    marginTop: 3,
    fontSize: 16,
    fontWeight: 950,
    color: "#24160f",
  },
  completedByText: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: 850,
    color: "#7c2d12",
  },
  cleaningDutyArea: {
    fontSize: 13,
    fontWeight: 950,
    color: "#1d4ed8",
  },
  cleaningCompleteButton: {
    padding: "10px 14px",
    borderRadius: 999,
    border: "none",
    background: "#1d4ed8",
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 950,
    cursor: "pointer",
  },
  cleaningCompleteButtonDisabled: {
    background: "#d6d3d1",
    color: "#78716c",
    cursor: "not-allowed",
  },
  commandArea: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
    width: "100%",
    margin: "20px 0 18px",
  },
  commandAreaMobile: {
    gridTemplateColumns: "1fr",
  },
  tabButton: {
    width: "100%",
    minHeight: 46,
    padding: "11px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.04em",
    cursor: "pointer",
    boxShadow: "0 12px 26px rgba(92,54,24,0.08)",
    whiteSpace: "nowrap",
  },
  ruleButton: {
    border: "1px solid #fed7aa",
    background: "#fff7ed",
    color: "#9a3412",
  },
  secondaryButton: {
    border: "1px solid #cbd5e1",
    background: "rgba(255,255,255,0.95)",
    color: "#1e293b",
  },
  mapTabButton: {
    border: "1px solid #bfdbfe",
    background: "#eff6ff",
    color: "#1d4ed8",
  },
  calendarPanel: {
    overflow: "visible",
    transition:
      "max-height 0.45s ease, opacity 0.3s ease, transform 0.35s ease",
    paddingBottom: 30,
  },
  calendarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    marginBottom: 10,
    height: 50,
  },
  monthButton: {
    width: 56,
    height: 56,
    borderRadius: 18,
    border: "1px solid rgba(146,64,14,0.12)",
    background: "#fffaf5",
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1,
    color: "#2b1d16",
    cursor: "pointer",
    boxShadow:
      "0 6px 14px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    transition:
      "transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease",
  },
  monthButtonPressed: {
    transform: "translateY(2px) scale(0.96)",
    boxShadow:
      "0 2px 6px rgba(0,0,0,0.10), inset 0 2px 4px rgba(0,0,0,0.08)",
    background: "#efe4d8",
  },
  monthTitle: {
    minWidth: 230,
    textAlign: "center",
    fontSize: 27,
    fontWeight: 950,
    letterSpacing: "-0.04em",
  },
  calendarScroll: {
    width: "100%",
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
    paddingBottom: 8,
  },
  weekGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: 6,
    marginBottom: 6,
  },
  weekGridMobile: {
    minWidth: 0,
  },
  calendarGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gridAutoRows: "clamp(92px, 8.5vw, 140px)",
    gap: 6,
    paddingBottom: 18,
  },
  calendarGridMobile: {
    minWidth: 0,
    gridTemplateColumns: "repeat(7, minmax(42px, 1fr))",
    gridAutoRows: "72px",
  },
  weekHeader: {
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 950,
    letterSpacing: "0.08em",
    color: "#9a3412",
  },
  dayCell: {
    height: "100%",
    borderRadius: 18,
    padding: 10,
    boxSizing: "border-box",
    overflow: "hidden",
    background: "rgba(255,255,255,0.9)",
    border: "1px solid rgba(146,64,14,0.12)",
    boxShadow: "0 8px 18px rgba(92,54,24,0.05)",
  },
  dayMuted: {
    background: "#e7e5e4",
    color: "#a8a29e",
  },
  dayDone: {
    background: "#f6eadf",
    border: "1px solid #dfc2a8",
  },
  dayToday: {
    background: "#fef3c7",
    border: "2px solid #f59e0b",
  },
  dayWeekend: {
    background: "#e2e8f0",
  },
  dayHoliday: {
    background: "#fee2e2",
  },
  dayNumber: {
    fontWeight: 950,
    fontSize: 13,
  },
  holidayText: {
    marginTop: 4,
    color: "#dc2626",
    fontSize: 11,
    fontWeight: 900,
  },
  memberName: {
    marginTop: 10,
    textAlign: "center",
    fontWeight: 950,
    fontSize: 13,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  changedMark: {
    margin: "7px auto 0",
    width: "fit-content",
    padding: "3px 7px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 950,
    color: "#9a3412",
    background: "#ffedd5",
  },
  mobileContainer: {
    width: "100%",
    overflowX: "hidden",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(28, 18, 12, 0.52)",
    backdropFilter: "blur(6px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 50,
  },
  modalCard: {
    width: "min(94vw, 430px)",
    maxWidth: 430,
    background: "#fffaf3",
    borderRadius: 26,
    padding: 24,
    boxShadow: "0 28px 80px rgba(28,18,12,0.34)",
  },
  rulesModalCard: {
    width: "min(96vw, 1100px)",
    maxWidth: 1100,
    maxHeight: "88vh",
    overflowY: "auto",
    background: "#fffaf3",
    borderRadius: 26,
    padding: 24,
    boxShadow: "0 28px 80px rgba(28,18,12,0.34)",
  },
  mapModalCard: {
    width: "min(96vw, 1200px)",
    maxWidth: 1200,
    background: "#fffaf3",
    borderRadius: 26,
    padding: 22,
    boxShadow: "0 28px 80px rgba(28,18,12,0.34)",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 12,
  },
  modalTitle: {
    margin: 0,
    fontSize: 25,
    fontWeight: 950,
    letterSpacing: "-0.04em",
  },
  modalSubText: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: 700,
    color: "#7c5a46",
  },
  modalDate: {
    marginTop: 6,
    marginBottom: 18,
    color: "#7c5a46",
    fontWeight: 850,
  },
  formLabel: {
    display: "block",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 900,
    color: "#5c3b2a",
    marginTop: 12,
    marginBottom: 6,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #d6d3d1",
    background: "#ffffff",
    fontSize: 14,
    fontWeight: 650,
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 20,
  },
  cancelButton: {
    padding: "11px 18px",
    borderRadius: 999,
    border: "1px solid #d6d3d1",
    background: "#ffffff",
    fontSize: 13,
    fontWeight: 900,
    cursor: "pointer",
  },
  saveButton: {
    padding: "11px 20px",
    borderRadius: 999,
    border: "none",
    background: "#7c2d12",
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 950,
    cursor: "pointer",
  },
  ruleList: {
    textAlign: "left",
    lineHeight: 1.72,
  },
  ruleSection: {
    padding: "15px 16px",
    borderRadius: 18,
    marginBottom: 12,
    border: "1px solid rgba(146,64,14,0.12)",
  },
  ruleMorning: {
    background: "#fff7ed",
  },
  ruleEvening: {
    background: "#eef2ff",
  },
  ruleMachine: {
    background: "#f0fdf4",
  },
  ruleFloor: {
    background: "#f8fafc",
  },
  ruleTitle: {
    fontSize: 15,
    fontWeight: 950,
    marginBottom: 8,
  },
  ruleBullets: {
    margin: 0,
    paddingLeft: 20,
    fontSize: 14,
    fontWeight: 650,
    color: "#3f2a1f",
  },
  machineOverviewCard: {
    marginTop: 12,
    marginBottom: 12,
    borderRadius: 18,
    overflow: "hidden",
    border: "1px solid #bbf7d0",
    background: "#ffffff",
    boxShadow: "0 10px 24px rgba(28,18,12,0.08)",
  },
  machineOverviewHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    background: "#f0fdf4",
    borderBottom: "1px solid #bbf7d0",
  },
  machineOverviewTitle: {
    fontSize: 13,
    fontWeight: 950,
    color: "#166534",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  machineOverviewSubText: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: 700,
    color: "#475569",
  },
  machineOverviewBadge: {
    padding: "5px 10px",
    borderRadius: 999,
    background: "#ffffff",
    color: "#166534",
    fontSize: 11,
    fontWeight: 950,
  },
  machineOverviewImage: {
    width: "100%",
    maxHeight: 260,
    objectFit: "contain",
    display: "block",
    background: "#ffffff",
    padding: 12,
    boxSizing: "border-box",
  },
  partTabs: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  partTabsMobile: {
    gridTemplateColumns: "1fr",
  },
  partTab: {
    padding: "10px 8px",
    borderRadius: 999,
    border: "1px solid #d6d3d1",
    background: "#ffffff",
    color: "#3f2a1f",
    fontSize: 12,
    fontWeight: 950,
    cursor: "pointer",
  },
  partTabActive: {
    padding: "10px 8px",
    borderRadius: 999,
    border: "1px solid #7c2d12",
    background: "#7c2d12",
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 8px 22px rgba(124,45,18,0.25)",
  },
  partDetailCard: {
    display: "grid",
    gridTemplateColumns: "180px 1fr",
    gap: 14,
    alignItems: "center",
    padding: 14,
    borderRadius: 18,
    background: "#ffffff",
    border: "1px solid #bbf7d0",
  },
  partDetailCardMobile: {
    gridTemplateColumns: "1fr",
  },
  partImageBox: {
    height: 160,
    borderRadius: 16,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  partImageBoxMobile: {
    height: 190,
  },
  partImage: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    display: "block",
  },
  partDetailTextBox: {
    minWidth: 0,
  },
  partBadge: {
    display: "inline-block",
    padding: "5px 10px",
    borderRadius: 999,
    background: "#f5e6d3",
    color: "#7c2d12",
    fontSize: 11,
    fontWeight: 950,
    marginBottom: 8,
  },
  partTitle: {
    fontSize: 17,
    fontWeight: 950,
    marginBottom: 8,
  },
  partSteps: {
    margin: 0,
    paddingLeft: 20,
    fontSize: 14,
    fontWeight: 650,
    color: "#334155",
  },
  mapViewer: {
    overflow: "hidden",
    borderRadius: 18,
    border: "1px solid #d6d3d1",
    background: "#ffffff",
  },
  mapToolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 14px",
    background: "#fff7ed",
    borderBottom: "1px solid #fed7aa",
  },
  mapToolbarTitle: {
    fontSize: 12,
    fontWeight: 950,
    color: "#7c2d12",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  mapToolbarBadge: {
    padding: "5px 10px",
    borderRadius: 999,
    background: "#ffffff",
    color: "#9a3412",
    fontSize: 11,
    fontWeight: 950,
  },
  mapImageFrame: {
    padding: 12,
    background: "#ffffff",
  },
  cleaningMapImage: {
    width: "100%",
    maxHeight: "78vh",
    objectFit: "contain",
    border: "1px solid #d6d3d1",
    display: "block",
    background: "#ffffff",
  },
};
