import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Toolbar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Card,
  CardContent,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Button,
  LinearProgress,
  TextField,
  Stack,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import { db } from "../../firebase";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import * as XLSX from "xlsx";

/**
 * AdminDashboard
 * - Shows full list of Excel rows (paginated + searchable)
 * - Highlights registered rows (green) same as encoder dashboard
 * - Displays encoder name and registered timestamp when available
 * - Exports combined report with STATUS, ENCODER NAME, REGISTERED AT
 */

export default function AdminDashboard() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    JSON.parse(localStorage.getItem("sidebarCollapsed") || "false")
  );

  const [payouts, setPayouts] = useState([]);
  const [selectedPayout, setSelectedPayout] = useState("");
  const [excelData, setExcelData] = useState([]); // each row contains rowId + original columns
  // eslint-disable-next-line no-unused-vars
  const [excelHeaders, setExcelHeaders] = useState([]); // cleaned headers
  const [registeredData, setRegisteredData] = useState([]); // raw registration docs
  const [registrationsMap, setRegistrationsMap] = useState({}); // keyed by payoutId_rowId
  const [normalizedControlMap, setNormalizedControlMap] = useState({}); // keyed by control -> reg info
  const [encoderNames, setEncoderNames] = useState({}); // uid -> username
  const [loading, setLoading] = useState(false);
  const [serverTime, setServerTime] = useState("");

  // UI state (search/pagination/dialog)
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const ROWS_PER_PAGE = 10;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogRow, setDialogRow] = useState(null);

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleCollapseToggle = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    localStorage.setItem("sidebarCollapsed", JSON.stringify(newCollapsed));
  };

  // --- Fetch ongoing payouts ---
  useEffect(() => {
    const fetchPayouts = async () => {
      try {
        const q = query(
          collection(db, "payoutschedules"),
          where("status", "==", "PAY-OUT ONGOING")
        );
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPayouts(list);
      } catch (err) {
        console.error("Error fetching payouts:", err);
      }
    };
    fetchPayouts();
  }, []);

  // --- Fetch Excel file for selected payout ---
  useEffect(() => {
    if (!selectedPayout) {
      setExcelData([]);
      setExcelHeaders([]);
      setPage(0);
      return;
    }

    const fetchExcel = async () => {
      setLoading(true);
      try {
        const payout = payouts.find((p) => p.id === selectedPayout);
        if (!payout?.fileUrl) {
          setExcelData([]);
          setExcelHeaders([]);
          return;
        }

        const res = await fetch(payout.fileUrl);
        const arrayBuffer = await res.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];

        // get headers (row 0)
        const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || [];
        // clean header: remove empty and dedupe while preserving order
        const seen = new Set();
        const cleanHeaders = headerRow
          .map((h) => (h === undefined || h === null ? "" : String(h).trim()))
          .filter((h) => h !== "")
          .filter((h) => {
            const key = h.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

        // parse sheet to json (defval to keep empty strings)
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        // attach rowId and normalized control number for reliable matching
        const rowsWithIds = jsonData.map((row, idx) => {
          // try to find control number fields by common header variants
          const controlRaw =
            row["CONTROL NUMBER"] ??
            row["Control Number"] ??
            row["control number"] ??
            row["controlNumber"] ??
            row["ControlNumber"] ??
            "";
          const controlNormalized = String(controlRaw).toUpperCase().trim();

          return {
            rowId: idx, // 0-based to match encoderDashboard's rowId
            __index: idx + 1, // human-friendly No.
            ...row,
            CONTROL_NUMBER_NORMALIZED: controlNormalized,
          };
        });

        setExcelHeaders(cleanHeaders);
        setExcelData(rowsWithIds);
        setPage(0);
      } catch (err) {
        console.error("Error reading excel:", err);
        setExcelData([]);
        setExcelHeaders([]);
      } finally {
        setLoading(false);
      }
    };

    fetchExcel();
  }, [selectedPayout, payouts]);

  // --- Fetch registered docs for selected payout ---
  useEffect(() => {
    if (!selectedPayout) {
      setRegisteredData([]);
      setRegistrationsMap({});
      setNormalizedControlMap({});
      setEncoderNames({});
      return;
    }

    const fetchRegs = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, "encoderRegistrations"),
          where("payoutId", "==", selectedPayout)
        );
        const snap = await getDocs(q);
        const regs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Build map keyed by payoutId_rowId (same key encoder uses)
        const regMap = {};
        const controlMap = {}; // controlNormalized -> array of registrations (in case duplicates)
        const encoderIds = new Set();

        regs.forEach((r) => {
          const key = `${r.payoutId}_${r.rowId}`;
          regMap[key] = r;

          const controlNorm = String(r.controlNumber ?? "").toUpperCase().trim();
          if (controlNorm) {
            if (!controlMap[controlNorm]) controlMap[controlNorm] = [];
            controlMap[controlNorm].push(r);
          }

          if (r.userId) encoderIds.add(r.userId);
        });

        // fetch encoder usernames in parallel
        const names = {};
        await Promise.all(
          Array.from(encoderIds).map(async (uid) => {
            try {
              const userRef = doc(db, "users", uid);
              const userSnap = await getDoc(userRef);
              names[uid] = userSnap.exists()
                ? userSnap.data().username || "Unknown"
                : "Unknown";
            } catch (err) {
              names[uid] = "Unknown";
            }
          })
        );

        setRegisteredData(regs);
        setRegistrationsMap(regMap);
        setNormalizedControlMap(controlMap);
        setEncoderNames(names);
      } catch (err) {
        console.error("Error fetching registrations:", err);
        setRegisteredData([]);
        setRegistrationsMap({});
        setNormalizedControlMap({});
        setEncoderNames({});
      } finally {
        setLoading(false);
      }
    };

    fetchRegs();
  }, [selectedPayout]);

  // --- Server time tick ---
  useEffect(() => {
    const id = setInterval(() => setServerTime(new Date().toLocaleString()), 1000);
    return () => clearInterval(id);
  }, []);

  // --- Filtering & pagination (admins see ALL excel rows, with status highlight) ---
  const filteredData = excelData.filter((row) =>
    Object.values(row)
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredData.length / ROWS_PER_PAGE));
  const paginatedData = filteredData.slice(
    page * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE + ROWS_PER_PAGE
  );

  // Determine table columns (keys from first excel row), exclude our helper fields in display
  const tableColumns =
    excelData.length > 0
      ? Object.keys(excelData[0]).filter((k) => k !== "rowId" && k !== "__index" && k !== "CONTROL_NUMBER_NORMALIZED")
      : [];

  // --- Helpers for row status & encoder info ---
  const getRegistrationForRow = (row) => {
    // check by payout_rowId map first
    const key = `${selectedPayout}_${row.rowId}`;
    const regByKey = registrationsMap[key];
    if (regByKey) return regByKey;

    // fallback: check by CONTROL_NUMBER_NORMALIZED match
    const control = String(row.CONTROL_NUMBER_NORMALIZED ?? "").toUpperCase().trim();
    if (control && normalizedControlMap[control] && normalizedControlMap[control].length > 0) {
      // return first match (if many encoders registered same control)
      return normalizedControlMap[control][0];
    }
    return null;
  };

  const isRowRegistered = (row) => {
    const reg = getRegistrationForRow(row);
    return !!reg && !!reg.registered;
  };

  const getEncoderNameForRow = (row) => {
    const reg = getRegistrationForRow(row);
    if (!reg) return "";
    return encoderNames[reg.userId] || reg.userId || "";
  };

  const getRegisteredAtForRow = (row) => {
    const reg = getRegistrationForRow(row);
    if (!reg) return "";
    if (reg.timestamp && reg.timestamp.seconds) {
      return new Date(reg.timestamp.seconds * 1000).toLocaleString();
    }
    // if timestamp stored differently or as ISO string:
    if (reg.timestamp && typeof reg.timestamp === "string") return reg.timestamp;
    return "";
  };

  // --- Export combined Excel (all rows) ---
  const handleExportExcel = () => {
    if (excelData.length === 0) return;

    // Build set of normalized registered control numbers and payout_rowId keys
    const registeredControlSet = new Set(
      registeredData
        .map((r) => String(r.controlNumber ?? "").toUpperCase().trim())
        .filter(Boolean)
    );

    const registeredRowKeySet = new Set(
      registeredData
        .map((r) => `${r.payoutId}_${r.rowId}`)
        .filter(Boolean)
    );

    // Build export rows preserving original excel headers order + appended fields
    const exportRows = excelData.map((row, idx) => {
      // base row object: map original headers to values (keep empty strings)
      const base = {};
      tableColumns.forEach((col) => {
        base[col] = row[col] ?? "";
      });

      const controlNorm = String(row.CONTROL_NUMBER_NORMALIZED ?? "").toUpperCase().trim();
      const rowKey = `${selectedPayout}_${row.rowId}`;

      const status =
        registeredRowKeySet.has(rowKey) || (controlNorm && registeredControlSet.has(controlNorm))
          ? "Registered"
          : "Not Registered";

      const encoderName = getEncoderNameForRow(row);
      const registeredAt = getRegisteredAtForRow(row);

      return {
        "No.": row.__index ?? idx + 1,
        ...base,
        STATUS: status,
        "ENCODER NAME": encoderName,
        "REGISTERED AT": registeredAt,
      };
    });

    // Convert to worksheet and download
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Overview");
    XLSX.writeFile(wb, `Payout_${selectedPayout}_Overview_Report.xlsx`);
  };

  // --- Dialog open for viewing details ---
  const onRowClick = (row) => {
    setDialogRow(row);
    setDialogOpen(true);
  };

  return (
    <Box sx={{ display: "flex" }}>
      <Topbar handleDrawerToggle={handleDrawerToggle} collapsed={collapsed} />
      <Sidebar
        mobileOpen={mobileOpen}
        handleDrawerToggle={handleDrawerToggle}
        collapsed={collapsed}
        handleCollapseToggle={handleCollapseToggle}
        role="admin"
      />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          bgcolor: "#f5f5f5",
          minHeight: "100vh",
        }}
      >
        <Toolbar />
        <Typography variant="h4" gutterBottom fontWeight={600}>
          Admin Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          🕒 Server Time: {serverTime}
        </Typography>

        {/* Select Payout */}
        <FormControl size="small" sx={{ minWidth: 300, mb: 3 }}>
          <InputLabel>Select Payout</InputLabel>
          <Select
            value={selectedPayout}
            onChange={(e) => {
              setSelectedPayout(e.target.value);
              setSearch("");
              setPage(0);
            }}
            label="Select Payout"
          >
            <MenuItem value="">-- Select Payout --</MenuItem>
            {payouts.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.title} — {p.venue}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Summary */}
        <Grid container spacing={2} mb={3}>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ borderLeft: "5px solid green" }}>
              <CardContent sx={{ py: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Total Registered
                </Typography>
                <Typography variant="h6" sx={{ color: "green", fontWeight: 700 }}>
                  {registeredData.filter((r) => r.registered).length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ borderLeft: "5px solid red" }}>
              <CardContent sx={{ py: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Total Not Registered
                </Typography>
                <Typography variant="h6" sx={{ color: "red", fontWeight: 700 }}>
                  {Math.max(0, excelData.length - registeredData.filter((r) => r.registered).length)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {loading ? (
          <LinearProgress />
        ) : selectedPayout === "" ? (
          <Typography>Select a payout to display records.</Typography>
        ) : (
          <>
            <Button variant="contained" onClick={handleExportExcel} sx={{ mb: 2 }}>
              EXPORT EXCEL REPORT
            </Button>

            {/* Search bar */}
            <Box sx={{ mb: 1 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search table..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </Box>

            {/* Table */}
            <Paper sx={{ borderRadius: 2, overflow: "hidden" }}>
              <TableContainer sx={{ maxHeight: "70vh" }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: "bold" }}>No.</TableCell>
                      {tableColumns.map((col) => (
                        <TableCell key={col} sx={{ fontWeight: "bold", whiteSpace: "nowrap" }}>
                          {col}
                        </TableCell>
                      ))}
                      <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>Encoder Name</TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>Registered At</TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {filteredData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={tableColumns.length + 4} align="center">
                          No records found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedData.map((row) => {
                        const registered = isRowRegistered(row);
                        const encoderName = getEncoderNameForRow(row);
                        const registeredAt = getRegisteredAtForRow(row);
                        return (
                          <TableRow
                            key={row.rowId}
                            hover
                            onClick={() => onRowClick(row)}
                            sx={{
                              backgroundColor: registered ? "#4af108" : "inherit",
                              cursor: "pointer",
                              "&:hover": {
                                backgroundColor: registered ? "#4af108" : "#f3f3f3",
                              },
                            }}
                          >
                            <TableCell>{row.__index ?? row.rowId + 1}</TableCell>
                            {tableColumns.map((col) => (
                              <TableCell key={col} sx={{ whiteSpace: "nowrap" }}>
                                {String(row[col] ?? "")}
                              </TableCell>
                            ))}
                            <TableCell>
                              {registered ? <Chip label="REGISTERED" size="small" color="success" /> : <Chip label="NOT REGISTERED" size="small" />}
                            </TableCell>
                            <TableCell>{encoderName}</TableCell>
                            <TableCell>{registeredAt}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            {/* Pagination controls */}
            <Stack direction="row" spacing={2} justifyContent="center" alignItems="center" mt={2}>
              <Button variant="contained" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                Previous
              </Button>
              <Typography>
                Page {page + 1} of {totalPages}
              </Typography>
              <Button variant="contained" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
                Next
              </Button>
            </Stack>
          </>
        )}

        {/* View dialog */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
          <DialogTitle>{dialogRow ? `Row #${dialogRow.rowId}` : "Row"}</DialogTitle>
          <DialogContent dividers sx={{ minWidth: { xs: 260, sm: 420 } }}>
            {dialogRow &&
              tableColumns.map((col) => (
                <Box key={col} sx={{ display: "flex", gap: 1, mb: 1 }}>
                  <Typography variant="caption" sx={{ minWidth: 140, color: "text.secondary" }}>
                    {col}
                  </Typography>
                  <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                    {String(dialogRow[col] ?? "")}
                  </Typography>
                </Box>
              ))}
            {dialogRow && (
              <>
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Status
                  </Typography>
                  <Typography variant="body2">
                    {isRowRegistered(dialogRow) ? "Registered" : "Not Registered"}
                  </Typography>
                </Box>

                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Encoder Name
                  </Typography>
                  <Typography variant="body2">{getEncoderNameForRow(dialogRow)}</Typography>
                </Box>

                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Registered At
                  </Typography>
                  <Typography variant="body2">{getRegisteredAtForRow(dialogRow)}</Typography>
                </Box>
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}