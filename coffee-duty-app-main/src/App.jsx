import React, { useEffect, useMemo, useState } from "react";

const API_URL =
  "https://script.google.com/macros/s/AKfycbzdRQAUFEGiiBVgMPHbtj61GPdxdnFLuxrj53Zydagj2NwBGMd-R3_EbDVhR18jJDkDVQ/exec";

const CLEANING_MAP_URL = "/cleaning-map.jpg";
const MACHINE_OVERVIEW_URL = "/machine-overview.png";
const PART_TANK_URL = "/part-tank.png";
const PART_HOLDER_URL = "/part-holder.png";
const PART_TRAY_URL = "/part-tray.png";

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
  return members[index];
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
  return (
    <button type="button" onClick={onClick} style={styles.monthButton}>
      {children}
    </button>
  );
}

export default function App() {
  const width = useWindowWidth();
  const isMobile = width < 720;
  const today = new Date();
  const todayKey = toDateKey(today);

  const [members, setMembers] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [records, setRecords] = useState({});
  const [assignmentChanges, setAssignmentChanges] = useState([]);
  const [cleaningMembers, setCleaningMembers] = useState([]);
  const [cleaningRecords, setCleaningRecords] = useState({});

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [showCalendar, setShowCalendar] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [selectedMachinePart, setSelectedMachinePart] = useState("tank");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(null);
  const [changeName, setChangeName] = useState("");
  const [changeMember, setChangeMember] = useState("");
  const [changeReason, setChangeReason] = useState("");

  useEffect(() => {
    fetch(API_URL)
      .then((res) => res.json())
      .then((data) => {
        setMembers(data.members || []);
        setHolidays(data.holidays || []);
        setAssignmentChanges(data.assignmentChanges || []);
        setCleaningMembers(data.cleaningMembers || []);

        const coffeeMap = {};
        (data.records || []).forEach((r) => {
          if (r.date) coffeeMap[r.date] = r;
        });
        setRecords(coffeeMap);

        const cleaningMap = {};
        (data.cleaningRecords || []).forEach((r) => {
          if (r.date) cleaningMap[r.date] = r;
        });
        setCleaningRecords(cleaningMap);
      })
      .catch(() => {
        setMessage("Failed to load data. Please check the API connection.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const days = useMemo(() => buildCalendar(year, month), [year, month]);

  const monthCleaningDuties = useMemo(
    () => getCleaningDutiesForMonth(year, month, cleaningMembers),
    [year, month, cleaningMembers]
  );

  const todayMember = getCoffeeMember(
    today,
    members,
    holidays,
    assignmentChanges
  );

  const todayDone =
    records[todayKey]?.trash &&
    records[todayKey]?.water &&
    records[todayKey]?.clean;

  const selectedPart = MACHINE_PARTS[selectedMachinePart];

  async function postData(data) {
    await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  const saveCoffeeComplete = async () => {
    if (!todayMember || todayDone) return;

    const data = {
      date: todayKey,
      member: todayMember,
      trash: true,
      water: true,
      clean: true,
    };

    setMessage("Saving...");

    try {
      await postData(data);
      setRecords((prev) => ({
        ...prev,
        [todayKey]: data,
      }));
      setMessage("Coffee cleaning report has been saved.");
      setTimeout(() => setMessage(""), 2500);
    } catch {
      setMessage("Failed to save the report.");
    }
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

    const member = getCoffeeMember(date, members, holidays, assignmentChanges);
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
    const oldMember = getCoffeeMember(
      selectedDate,
      members,
      holidays,
      assignmentChanges
    );

    const data = {
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
    <div style={styles.page}>
      <div style={styles.appShell}>
        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>Coffee Dolce Duty</div>
            <h1 style={styles.title}>Coffee Duty</h1>
          </div>
          <div style={styles.badge}>Internal Operations App</div>
        </header>

        <main style={styles.mainCard}>
          <div style={styles.todayLabel}>Today's Coffee Cleaning Duty</div>

          <div style={styles.todayRow}>
            <div style={styles.todayMemberCompact}>
              {loading ? "Loading..." : todayMember || "No duty today"}
            </div>

            <button
              type="button"
              onClick={saveCoffeeComplete}
              disabled={!todayMember || todayDone}
              style={{
                ...styles.primaryButton,
                ...(!todayMember || todayDone ? styles.disabledButton : {}),
              }}
            >
              {todayDone ? "Completed" : "Complete"}
            </button>
          </div>

          <div style={styles.cleaningSection}>
            <div style={styles.cleaningSectionTitle}>
              Monthly Area Cleaning Duty
            </div>

            {monthCleaningDuties.map((duty) => {
              const done = !!cleaningRecords[duty.dateKey];
              const canComplete = duty.dateKey === todayKey && !done;

              return (
                <div
                  key={duty.dateKey}
                  style={{
                    ...styles.cleaningDutyRow,
                    ...(isMobile ? styles.cleaningDutyRowMobile : {}),
                  }}
                >
                  <div style={styles.cleaningDutyDate}>{duty.dateKey}</div>
                  <div style={styles.cleaningDutyMember}>
                    {duty.member || "Unassigned"}
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

          {message && <div style={styles.message}>{message}</div>}
        </main>

        <div
          style={{
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
            ...styles.calendarPanel,
            maxHeight: showCalendar ? 900 : 0,
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
                const member = getCoffeeMember(
                  date,
                  members,
                  holidays,
                  assignmentChanges
                );
                const done =
                  records[key]?.trash &&
                  records[key]?.water &&
                  records[key]?.clean;
                const isToday = key === todayKey;
                const changed = !!getChangedMember(date, assignmentChanges);
                const canChange = inMonth && member && !isPastDate(date);

                let background = "#ffffff";
                if (!inMonth) background = "#e5e7eb";
                else if (done) background = "#dbeafe";
                else if (isToday) background = "#fff7cc";
                else if (weekend) background = "#cbd5e1";
                else if (holiday) background = "#ffe8e8";

                return (
                  <div
                    key={key}
                    style={{
                      ...styles.dayCell,
                      background,
                      color: inMonth ? "#0f172a" : "#94a3b8",
                      border: isToday
                        ? "3px solid #f59e0b"
                        : "1px solid #d1d5db",
                      cursor: canChange ? "pointer" : "default",
                    }}
                    onClick={() => openChangeForm(date)}
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
                        {changed && (
                          <div style={styles.changedMark}>Changed</div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {showRules && (
        <div style={styles.modalOverlay}>
          <div style={styles.rulesModalCard}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={styles.modalTitle}>Cleaning Rules</h2>
                <div style={styles.modalSubText}>
                  Daily operating procedure for keeping the coffee area clean
                  and ready to use.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRules(false)}
                style={styles.cancelButton}
              >
                Close
              </button>
            </div>

            <div style={styles.ruleList}>
              <div
                style={{ ...styles.ruleSection, ...styles.ruleSectionMorning }}
              >
                <div style={styles.ruleTitle}>Morning Routine</div>
                <ul style={styles.ruleBullets}>
                  <li>Refill the water tank.</li>
                  <li>
                    Check the capsule trash bin and dispose of used capsules if
                    needed.
                  </li>
                  <li>
                    Wipe off any water drops or stains around the coffee
                    machine.
                  </li>
                </ul>
              </div>

              <div
                style={{ ...styles.ruleSection, ...styles.ruleSectionEvening }}
              >
                <div style={styles.ruleTitle}>Evening Routine</div>
                <ul style={styles.ruleBullets}>
                  <li>Clean the area around the coffee machine.</li>
                  <li>
                    Empty the capsule trash bin and wash it with detergent.
                  </li>
                  <li>
                    Check the inventory of capsules, paper cups, and stirrers.
                  </li>
                </ul>
              </div>

              <div
                style={{ ...styles.ruleSection, ...styles.ruleSectionCleaning }}
              >
                <div style={styles.ruleTitle}>
                  Coffee Machine Cleaning Guide
                </div>

                <div style={styles.machineOverviewCard}>
                  <div style={styles.machineOverviewHeader}>
                    <div>
                      <div style={styles.machineOverviewTitle}>Parts Guide</div>
                      <div style={styles.machineOverviewSubText}>
                        Select a part to review the target component and
                        cleaning steps.
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

                <div
                  style={{
                    ...styles.partTabs,
                    ...(isMobile ? styles.partTabsMobile : {}),
                  }}
                >
                  {Object.entries(MACHINE_PARTS).map(([key, part]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedMachinePart(key)}
                      style={
                        selectedMachinePart === key
                          ? styles.partTabActive
                          : styles.partTab
                      }
                    >
                      {part.label}
                    </button>
                  ))}
                </div>

                <div
                  style={{
                    ...styles.partDetailCard,
                    ...(isMobile ? styles.partDetailCardMobile : {}),
                  }}
                >
                  <div
                    style={{
                      ...styles.partImageBox,
                      ...(isMobile ? styles.partImageBoxMobile : {}),
                    }}
                  >
                    <img
                      src={selectedPart.image}
                      alt={selectedPart.label}
                      style={styles.partImage}
                    />
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

              <div
                style={{ ...styles.ruleSection, ...styles.ruleSectionFloor }}
              >
                <div style={styles.ruleTitle}>Floor Cleaning</div>
                <ul style={styles.ruleBullets}>
                  <li>Vacuum the assigned cleaning area.</li>
                  <li>Clean any visible dust, trash, or stains if found.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {showMap && (
        <div style={styles.modalOverlay}>
          <div style={styles.mapModalCard}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={styles.modalTitle}>Cleaning Area</h2>
                <div style={styles.modalSubText}>
                  Check the assigned area and clean the corresponding space.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMap(false)}
                style={styles.cancelButton}
              >
                Close
              </button>
            </div>

            <div style={styles.mapViewer}>
              <div style={styles.mapToolbar}>
                <div style={styles.mapToolbarTitle}>Cleaning Area Map</div>
                <div style={styles.mapToolbarBadge}>Reference</div>
              </div>

              <div style={styles.mapImageFrame}>
                <img
                  src={CLEANING_MAP_URL}
                  alt="Cleaning area map"
                  style={styles.cleaningMapImage}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedDate && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h2 style={styles.modalTitle}>Change Assignee</h2>
            <div style={styles.modalDate}>{toDateKey(selectedDate)}</div>

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
              {members.map((m) => (
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
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                style={styles.cancelButton}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveAssignmentChange}
                style={styles.saveButton}
              >
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
  page: {
    minHeight: "100vh",
    padding: "24px 14px",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    background:
      "linear-gradient(135deg, #eff6ff 0%, #f8fafc 45%, #f1f5f9 100%)",
    color: "#0f172a",
    letterSpacing: "0.01em",
  },
  appShell: {
    maxWidth: 980,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  kicker: {
    fontSize: 12,
    fontWeight: 800,
    color: "#2563eb",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: 36,
    fontWeight: 950,
    letterSpacing: "-0.035em",
    lineHeight: 1.05,
  },
  badge: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "#ffffff",
    boxShadow: "0 8px 20px rgba(15, 23, 42, 0.08)",
    fontSize: 12,
    fontWeight: 850,
    letterSpacing: "0.04em",
    color: "#0f172a",
  },
  mainCard: {
    padding: "34px 24px",
    borderRadius: 28,
    background: "#ffffff",
    textAlign: "center",
    boxShadow: "0 20px 50px rgba(15, 23, 42, 0.12)",
  },
  todayLabel: {
    fontSize: 12,
    fontWeight: 850,
    color: "#64748b",
    marginBottom: 12,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  todayRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    marginBottom: 28,
    flexWrap: "wrap",
  },
  todayMemberCompact: {
    minWidth: 180,
    padding: "12px 22px",
    borderRadius: 18,
    background: "#eff6ff",
    fontSize: 34,
    fontWeight: 950,
    letterSpacing: "-0.025em",
  },
  primaryButton: {
    padding: "14px 30px",
    borderRadius: 999,
    border: "none",
    background: "#2563eb",
    color: "white",
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: "0.04em",
    cursor: "pointer",
    boxShadow: "0 12px 28px rgba(37, 99, 235, 0.32)",
  },
  disabledButton: {
    background: "#94a3b8",
    cursor: "not-allowed",
    boxShadow: "none",
  },
  cleaningSection: {
    maxWidth: 720,
    margin: "0 auto",
    padding: 18,
    borderRadius: 20,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
  },
  cleaningSectionTitle: {
    textAlign: "left",
    fontSize: 13,
    fontWeight: 950,
    marginBottom: 12,
    letterSpacing: "0.04em",
  },
  cleaningDutyRow: {
    display: "grid",
    gridTemplateColumns: "1.3fr 1fr 0.8fr 1fr",
    gap: 10,
    alignItems: "center",
    padding: "10px 0",
    borderTop: "1px solid #e2e8f0",
  },
  cleaningDutyRowMobile: {
    gridTemplateColumns: "1fr 1fr",
    textAlign: "left",
    rowGap: 8,
  },
  cleaningDutyDate: {
    fontSize: 13,
    fontWeight: 850,
    textAlign: "left",
  },
  cleaningDutyMember: {
    fontSize: 13,
    fontWeight: 950,
  },
  cleaningDutyArea: {
    fontSize: 13,
    fontWeight: 900,
    color: "#2563eb",
  },
  cleaningCompleteButton: {
    padding: "9px 12px",
    borderRadius: 999,
    border: "none",
    background: "#2563eb",
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.03em",
    cursor: "pointer",
  },
  cleaningCompleteButtonDisabled: {
    background: "#cbd5e1",
    color: "#64748b",
    cursor: "not-allowed",
  },
  message: {
    marginTop: 18,
    fontSize: 13,
    fontWeight: 800,
    color: "#2563eb",
    letterSpacing: "0.02em",
  },
  commandArea: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 10,
    width: "100%",
    margin: "22px 0 18px",
  },
  commandAreaMobile: {
    gridTemplateColumns: "1fr",
    gap: 8,
  },
  tabButton: {
    width: "100%",
    minHeight: 44,
    padding: "10px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.04em",
    cursor: "pointer",
    boxShadow: "0 8px 22px rgba(15, 23, 42, 0.08)",
    whiteSpace: "nowrap",
  },
  ruleButton: {
    border: "1px solid #fde68a",
    background: "#fffbeb",
    color: "#92400e",
  },
  secondaryButton: {
    border: "1px solid #cbd5e1",
    background: "rgba(255,255,255,0.95)",
    color: "#0f172a",
  },
  mapTabButton: {
    border: "1px solid #bfdbfe",
    background: "#eff6ff",
    color: "#2563eb",
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
    marginBottom: 8,
    height: 48,
  },
  monthButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    background: "#ffffff",
    fontSize: 20,
    fontWeight: 950,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    padding: 0,
  },
  monthTitle: {
    minWidth: 220,
    textAlign: "center",
    fontSize: 26,
    fontWeight: 950,
    letterSpacing: "-0.03em",
    lineHeight: "44px",
  },
  calendarScroll: {
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
    paddingBottom: 8,
  },
  weekGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: 4,
    marginBottom: 6,
  },
  weekGridMobile: {
    minWidth: 720,
  },
  calendarGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gridAutoRows: "118px",
    gap: 4,
    paddingBottom: 18,
  },
  calendarGridMobile: {
    minWidth: 720,
    gridAutoRows: "104px",
  },
  weekHeader: {
    height: 26,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: "0.06em",
    color: "#2563eb",
    borderBottom: "2px solid #2563eb",
  },
  dayCell: {
    height: 118,
    borderRadius: 14,
    padding: 10,
    boxSizing: "border-box",
    overflow: "hidden",
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
    marginTop: 16,
    textAlign: "center",
    fontWeight: 950,
    fontSize: 13,
    letterSpacing: "-0.01em",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  changedMark: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: 900,
    color: "#2563eb",
    textAlign: "center",
    letterSpacing: "0.04em",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 50,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    background: "#ffffff",
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 24px 70px rgba(15, 23, 42, 0.25)",
  },
  rulesModalCard: {
    width: "100%",
    maxWidth: 780,
    maxHeight: "88vh",
    overflowY: "auto",
    background: "#ffffff",
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 24px 70px rgba(15, 23, 42, 0.25)",
  },
  mapModalCard: {
    width: "100%",
    maxWidth: 920,
    background: "#ffffff",
    borderRadius: 24,
    padding: 22,
    boxShadow: "0 24px 70px rgba(15, 23, 42, 0.25)",
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
    fontSize: 24,
    fontWeight: 950,
    letterSpacing: "-0.03em",
  },
  modalSubText: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: 700,
    color: "#64748b",
    letterSpacing: "0.01em",
  },
  modalDate: {
    marginTop: 6,
    marginBottom: 18,
    color: "#64748b",
    fontWeight: 850,
  },
  formLabel: {
    display: "block",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 900,
    color: "#334155",
    marginTop: 12,
    marginBottom: 6,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    fontSize: 14,
    fontWeight: 650,
    letterSpacing: "0.01em",
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
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: "0.03em",
    cursor: "pointer",
  },
  saveButton: {
    padding: "11px 20px",
    borderRadius: 999,
    border: "none",
    background: "#2563eb",
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 950,
    letterSpacing: "0.03em",
    cursor: "pointer",
  },
  mapViewer: {
    overflow: "hidden",
    borderRadius: 18,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
  },
  mapToolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 14px",
    background: "#ffffff",
    borderBottom: "1px solid #e2e8f0",
  },
  mapToolbarTitle: {
    fontSize: 12,
    fontWeight: 950,
    color: "#334155",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  mapToolbarBadge: {
    padding: "5px 10px",
    borderRadius: 999,
    background: "#eff6ff",
    color: "#2563eb",
    fontSize: 11,
    fontWeight: 950,
    letterSpacing: "0.05em",
  },
  mapImageFrame: {
    padding: 12,
    background: "#f8fafc",
  },
  cleaningMapImage: {
    width: "100%",
    maxHeight: "72vh",
    objectFit: "contain",
    borderRadius: 0,
    border: "1px solid #cbd5e1",
    display: "block",
    background: "#ffffff",
  },
  ruleList: {
    textAlign: "left",
    lineHeight: 1.72,
  },
  ruleSection: {
    padding: "14px 16px",
    borderRadius: 16,
    marginBottom: 12,
    border: "1px solid rgba(148, 163, 184, 0.25)",
  },
  ruleSectionMorning: {
    background: "#fffbeb",
  },
  ruleSectionEvening: {
    background: "#eef2ff",
  },
  ruleSectionCleaning: {
    background: "#f0fdf4",
  },
  ruleSectionFloor: {
    background: "#f8fafc",
  },
  ruleTitle: {
    fontSize: 15,
    fontWeight: 950,
    marginBottom: 8,
    letterSpacing: "0.02em",
  },
  ruleBullets: {
    margin: 0,
    paddingLeft: 20,
    fontSize: 14,
    fontWeight: 650,
    color: "#334155",
    letterSpacing: "0.005em",
  },
  machineOverviewCard: {
    marginTop: 12,
    marginBottom: 12,
    borderRadius: 18,
    overflow: "hidden",
    border: "1px solid #dbeafe",
    background: "#ffffff",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.08)",
  },
  machineOverviewHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    background: "#eff6ff",
    borderBottom: "1px solid #dbeafe",
  },
  machineOverviewTitle: {
    fontSize: 13,
    fontWeight: 950,
    color: "#1e3a8a",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  machineOverviewSubText: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: 700,
    color: "#475569",
    letterSpacing: "0.01em",
  },
  machineOverviewBadge: {
    padding: "5px 10px",
    borderRadius: 999,
    background: "#ffffff",
    color: "#2563eb",
    fontSize: 11,
    fontWeight: 950,
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
    textTransform: "uppercase",
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
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#334155",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.02em",
    cursor: "pointer",
  },
  partTabActive: {
    padding: "10px 8px",
    borderRadius: 999,
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: "0.02em",
    cursor: "pointer",
    boxShadow: "0 8px 22px rgba(37, 99, 235, 0.25)",
  },
  partDetailCard: {
    display: "grid",
    gridTemplateColumns: "180px 1fr",
    gap: 14,
    alignItems: "center",
    padding: 14,
    borderRadius: 18,
    background: "#ffffff",
    border: "1px solid #dcfce7",
  },
  partDetailCardMobile: {
    gridTemplateColumns: "1fr",
    alignItems: "stretch",
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
    background: "#eff6ff",
    color: "#2563eb",
    fontSize: 11,
    fontWeight: 950,
    marginBottom: 8,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  partTitle: {
    fontSize: 17,
    fontWeight: 950,
    marginBottom: 8,
    color: "#0f172a",
    letterSpacing: "-0.015em",
  },
  partSteps: {
    margin: 0,
    paddingLeft: 20,
    fontSize: 14,
    fontWeight: 650,
    color: "#334155",
    letterSpacing: "0.005em",
  },
};
// test
