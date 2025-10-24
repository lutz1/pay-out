import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Box,
  Typography,
  Toolbar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  Checkbox,
  ListItemText,
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
 * AdminDashboard.jsx
 * - Original logic kept intact: payouts fetch, excel parsing, registered fetch,
 *   registeredWithDetails, totals, serverTime, dialog, etc.
 * - Added: multi-select filters (BARANGAY, Encoder, Status) in same row as export buttons
 * - Export filtered rows to Excel with filename that reflects chosen filters:
 *     Payout_<PayoutTitle>_<Filters>_Report.xlsx
 * - Image export (PNG/JPG) is supported via dynamic import of html2canvas on-demand.
 *   If html2canvas is not installed, user sees an alert with install instructions.
 */

export default function AdminDashboard() {
  // UI & layout state
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    JSON.parse(localStorage.getItem("sidebarCollapsed") || "false")
  );

  // Core data state (kept from your previous file)
  const [payouts, setPayouts] = useState([]);
  const [selectedPayout, setSelectedPayout] = useState("");
  const [excelData, setExcelData] = useState([]); // parsed excel rows
  const [excelHeaders, setExcelHeaders] = useState([]); // header array
  const [registeredData, setRegisteredData] = useState([]); // encoderRegistrations docs
  const [registrationsMap, setRegistrationsMap] = useState({}); // payout_rowId -> reg
  const [normalizedControlMap, setNormalizedControlMap] = useState({}); // controlNormalized -> [regs]
  const [encoderNames, setEncoderNames] = useState({}); // uid -> username
  const [loading, setLoading] = useState(false);
  const [serverTime, setServerTime] = useState("");

  // table / UI extras
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const ROWS_PER_PAGE = 25;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogRow, setDialogRow] = useState(null);
  const tableRef = useRef(null);

  // Multi-select filters (new)
  const [selectedBarangays, setSelectedBarangays] = useState([]);
  const [selectedEncoders, setSelectedEncoders] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);

  // helpers
  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleCollapseToggle = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    localStorage.setItem("sidebarCollapsed", JSON.stringify(newCollapsed));
  };

  // --- Fetch ongoing payouts (unchanged) ---
  useEffect(() => {
    const fetchPayouts = async () => {
      try {
        const q = query(
          collection(db, "payoutschedules"),
          where("status", "==", "PAY-OUT ONGOING")
        );
        const snapshot = await getDocs(q);
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPayouts(list);
      } catch (err) {
        console.error("Error fetching payouts:", err);
      }
    };
    fetchPayouts();
  }, []);

  // --- Fetch Excel data and headers (preserve original parsing) ---
  useEffect(() => {
    if (!selectedPayout) {
      setExcelData([]);
      setExcelHeaders([]);
      setPage(1);
      return;
    }

    const fetchExcel = async () => {
      setLoading(true);
      try {
        const payout = payouts.find((p) => p.id === selectedPayout);
        if (!payout?.fileUrl) {
          setExcelData([]);
          setExcelHeaders([]);
          setLoading(false);
          return;
        }

        const res = await fetch(payout.fileUrl);
        const arrayBuffer = await res.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const firstSheet = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheet];

        // Get headers row (row 0)
        const headersRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || [];
        // Clean headers: preserve order, remove empty, dedupe case-insensitive
        const seen = new Set();
        const cleanHeaders = headersRow
          .map((h) => (h === undefined || h === null ? "" : String(h).trim()))
          .filter((h) => h !== "")
          .filter((h) => {
            const k = h.toLowerCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });

        // Parse sheet to JSON with defval so empty cells become ""
        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        // Attach rowId, __index, and normalized CONTROL NUMBER for robust matching
        const rowsWithIds = jsonData.map((row, idx) => {
          const controlRaw =
            row["CONTROL NUMBER"] ??
            row["Control Number"] ??
            row["control number"] ??
            row["controlNumber"] ??
            row["ControlNumber"] ??
            "";
          const controlNormalized = String(controlRaw).toUpperCase().trim();

          // Ensure BARANGAY exists as uppercase key expected by your filters/exports
          const barangay = (row["BARANGAY"] ?? row["Barangay"] ?? "").toString().trim();

          return {
            rowId: idx,
            __index: idx + 1,
            ...row,
            BARANGAY: barangay,
            CONTROL_NUMBER_NORMALIZED: controlNormalized,
          };
        });

        setExcelHeaders(cleanHeaders);
        setExcelData(rowsWithIds);
        setPage(1);
      } catch (err) {
        console.error("Error loading Excel file:", err);
        setExcelData([]);
        setExcelHeaders([]);
      } finally {
        setLoading(false);
      }
    };

    fetchExcel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPayout, payouts]);

  // --- Fetch registered data and encoder names (preserve original) ---
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

        const regMap = {};
        const controlMap = {};
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
        console.error("Error fetching registered:", err);
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

  // --- Server time (preserve) ---
  useEffect(() => {
    const id = setInterval(() => setServerTime(new Date().toLocaleString()), 1000);
    return () => clearInterval(id);
  }, []);

  // --- Helpers to get registration info for a row (preserve) ---
  const getRegistrationForRow = (row) => {
    const key = `${selectedPayout}_${row.rowId}`;
    const regByKey = registrationsMap[key];
    if (regByKey) return regByKey;

    const control = String(row.CONTROL_NUMBER_NORMALIZED ?? "").toUpperCase().trim();
    if (control && normalizedControlMap[control] && normalizedControlMap[control].length > 0) {
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
    if (reg.timestamp && typeof reg.timestamp === "string") return reg.timestamp;
    return "";
  };

  // --- Build merged rows (like your earlier mergedData / registeredWithDetails) ---
  // We preserve original fields and append STATUS, ENCODER NAME, REGISTERED AT
// eslint-disable-next-line react-hooks/exhaustive-deps
const mergedRows = useMemo(() => {
  return excelData.map((row, idx) => {
    const reg = getRegistrationForRow(row);
    return {
      no: row.__index ?? idx + 1,
      ...row,
      STATUS: reg && reg.registered ? "Registered" : "Not Registered",
      "ENCODER NAME": reg ? encoderNames[reg.userId] || "" : "",
      "REGISTERED AT": reg
        ? reg.timestamp && reg.timestamp.seconds
          ? new Date(reg.timestamp.seconds * 1000).toLocaleString()
          : reg.timestamp || ""
        : "",
    };
  });
}, [excelData, registrationsMap, normalizedControlMap, encoderNames, registeredData]);

  // --- Dynamic filter option lists ---
  const barangayOptions = useMemo(() => {
    return Array.from(new Set(excelData.map((r) => (r.BARANGAY ?? "").toString().trim()).filter(Boolean)));
  }, [excelData]);

  const encoderOptions = useMemo(() => {
    return Array.from(new Set(Object.values(encoderNames).filter(Boolean)));
  }, [encoderNames]);

  // --- Filtering logic (applies search + multi-filters) ---
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return mergedRows.filter((row) => {
      // BARANGAY filter
      const barangayMatch = selectedBarangays.length === 0 || selectedBarangays.includes((row.BARANGAY ?? "").toString());

      // Encoder filter
      const encoderMatch = selectedEncoders.length === 0 || selectedEncoders.includes((row["ENCODER NAME"] ?? "").toString());

      // Status filter
      const statusMatch = selectedStatuses.length === 0 || selectedStatuses.includes((row.STATUS ?? "").toString());

      // Search match across values (control number, names, etc.)
      const searchMatch =
        q === "" ||
        Object.values(row)
          .join(" ")
          .toLowerCase()
          .includes(q);

      return barangayMatch && encoderMatch && statusMatch && searchMatch;
    });
  }, [mergedRows, selectedBarangays, selectedEncoders, selectedStatuses, search]);

  // --- Pagination for filtered rows ---
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  useEffect(() => {
    // Ensure page is within bounds when filter changes
    if (page > totalPages) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return filteredRows.slice(start, start + ROWS_PER_PAGE);
  }, [filteredRows, page]);

  // --- Totals (preserve) ---
  const totalRegistered = mergedRows.filter((r) => r.STATUS === "Registered").length;
  const totalNotRegistered = Math.max(0, mergedRows.length - totalRegistered);

  // --- Export filtered rows to Excel with filename that reflects filters ---
  const sanitizeForFilename = (s) =>
    String(s)
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "");

  const buildFilterSuffix = () => {
    const parts = [];
    if (selectedBarangays.length > 0) parts.push(`Barangay-${selectedBarangays.map(sanitizeForFilename).join("-")}`);
    if (selectedEncoders.length > 0) parts.push(`Encoder-${selectedEncoders.map(sanitizeForFilename).join("-")}`);
    if (selectedStatuses.length > 0) parts.push(`Status-${selectedStatuses.map(sanitizeForFilename).join("-")}`);
    if (parts.length === 0) return "All";
    return parts.join("_");
  };

  const handleExportFilteredExcel = () => {
    if (!selectedPayout) return;
    const rowsToExport = filteredRows.map((row) => {
      // Preserve original excel columns (excelHeaders) then append extras
      const base = {};
      excelHeaders.forEach((h) => {
        base[h] = row[h] ?? "";
      });

      return {
        "No.": row.no,
        ...base,
        BARANGAY: row.BARANGAY ?? "",
        STATUS: row.STATUS ?? "",
        "ENCODER NAME": row["ENCODER NAME"] ?? "",
        "REGISTERED AT": row["REGISTERED AT"] ?? "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(rowsToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Filtered");
    const payoutTitle = (payouts.find((p) => p.id === selectedPayout)?.title ?? selectedPayout).toString();
    const fileName = `Payout_${sanitizeForFilename(payoutTitle)}_${buildFilterSuffix()}_Report.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // --- Image export using dynamic import of html2canvas (no compile-time dependency) ---
  const handleExportImage = async (format = "png") => {
    if (!selectedPayout) return;
    if (typeof window === "undefined") {
      alert("Image export only works in browser.");
      return;
    }
    try {
      // Try dynamic import
      const { default: html2canvas } = await import("html2canvas");
      const el = tableRef.current ?? document.querySelector("#admin-table");
      if (!el) {
        alert("Table element not found for image export.");
        return;
      }
      const canvas = await html2canvas(el, { scale: 2 });
      const mime = format === "jpeg" || format === "jpg" ? "image/jpeg" : "image/png";
      const dataUrl = canvas.toDataURL(mime);
      const link = document.createElement("a");
      const payoutTitle = (payouts.find((p) => p.id === selectedPayout)?.title ?? selectedPayout).toString();
      link.download = `Payout_${sanitizeForFilename(payoutTitle)}_${buildFilterSuffix()}_Report.${format === "jpeg" || format === "jpg" ? "jpg" : "png"}`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("html2canvas import/usage failed:", err);
      alert("Image export requires 'html2canvas'. Install it with:\n\nnpm install html2canvas\n\nor\n\nyarn add html2canvas\n\nThen retry the export.");
    }
  };

  // --- Row click for dialog ---
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

        <Typography variant="body2" color="text.secondary" mb={2}>
          🕒 Server Time: {serverTime}
        </Typography>

        {/* --- Select Payout (unchanged) --- */}
        <FormControl size="small" sx={{ minWidth: 300, mb: 3 }}>
          <InputLabel>Select Payout</InputLabel>
          <Select
            value={selectedPayout}
            onChange={(e) => {
              setSelectedPayout(e.target.value);
              // Reset filters & pagination when changing payout
              setSelectedBarangays([]);
              setSelectedEncoders([]);
              setSelectedStatuses([]);
              setSearch("");
              setPage(1);
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

        {/* --- Summary Cards (unchanged) --- */}
        <Grid container spacing={2} mb={3}>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ borderLeft: "5px solid green" }}>
              <CardContent sx={{ py: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Total Registered
                </Typography>
                <Typography variant="h6" sx={{ color: "green", fontWeight: 700 }}>
                  {totalRegistered}
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
                  {totalNotRegistered}
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
            {/* --- Export + Filters on same row --- */}
            <Stack direction="row" spacing={2} alignItems="center" mb={2} flexWrap="wrap">
              <Button variant="contained" onClick={handleExportFilteredExcel}>
                EXPORT EXCEL REPORT
              </Button>

              {/* PNG / JPG export (optional dynamic import) */}
              <Button variant="outlined" onClick={() => handleExportImage("png")}>
                EXPORT PNG
              </Button>
              <Button variant="outlined" onClick={() => handleExportImage("jpeg")}>
                EXPORT JPG
              </Button>

              {/* BARANGAY multi-select */}
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel>BARANGAY</InputLabel>
                <Select
                  multiple
                  value={selectedBarangays}
                  onChange={(e) => {
                    setSelectedBarangays(e.target.value);
                    setPage(1);
                  }}
                  input={<OutlinedInput label="BARANGAY" />}
                  renderValue={(selected) => (selected.length ? selected.join(", ") : "All")}
                >
                  {barangayOptions.map((b) => (
                    <MenuItem key={b} value={b}>
                      <Checkbox checked={selectedBarangays.indexOf(b) > -1} />
                      <ListItemText primary={b} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Encoder multi-select */}
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel>Encoder</InputLabel>
                <Select
                  multiple
                  value={selectedEncoders}
                  onChange={(e) => {
                    setSelectedEncoders(e.target.value);
                    setPage(1);
                  }}
                  input={<OutlinedInput label="Encoder" />}
                  renderValue={(selected) => (selected.length ? selected.join(", ") : "All")}
                >
                  {encoderOptions.map((enc) => (
                    <MenuItem key={enc} value={enc}>
                      <Checkbox checked={selectedEncoders.indexOf(enc) > -1} />
                      <ListItemText primary={enc} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Status multi-select */}
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  multiple
                  value={selectedStatuses}
                  onChange={(e) => {
                    setSelectedStatuses(e.target.value);
                    setPage(1);
                  }}
                  input={<OutlinedInput label="Status" />}
                  renderValue={(selected) => (selected.length ? selected.join(", ") : "All")}
                >
                  {["Registered", "Not Registered"].map((s) => (
                    <MenuItem key={s} value={s}>
                      <Checkbox checked={selectedStatuses.indexOf(s) > -1} />
                      <ListItemText primary={s} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            {/* Search */}
            <Box sx={{ mb: 2 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search table..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </Box>

            {/* Table (preserve structure; use excelHeaders for columns) */}
            <Paper sx={{ borderRadius: 2, overflow: "hidden" }}>
              <TableContainer sx={{ maxHeight: "70vh" }}>
                <Table id="admin-table" ref={tableRef} stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: "bold" }}>No.</TableCell>
                      {excelHeaders.map((header) => (
                        <TableCell key={header} sx={{ fontWeight: "bold" }}>
                          {header}
                        </TableCell>
                      ))}
                      <TableCell sx={{ fontWeight: "bold" }}>BARANGAY</TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>STATUS</TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>ENCODER NAME</TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>REGISTERED AT</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={excelHeaders.length + 5} align="center">
                          No records found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedRows.map((row) => (
                        <TableRow
                          key={row.rowId}
                          hover
                          onClick={() => onRowClick(row)}
                          sx={{
                            backgroundColor: row.STATUS === "Registered" ? "#e6fff0" : "inherit",
                            cursor: "pointer",
                            "&:hover": {
                              backgroundColor: row.STATUS === "Registered" ? "#e6fff0" : "#f7f7f7",
                            },
                          }}
                        >
                          <TableCell>{row.no}</TableCell>
                          {excelHeaders.map((h) => (
                            <TableCell key={h}>{row[h] ?? ""}</TableCell>
                          ))}
                          <TableCell>{row.BARANGAY ?? ""}</TableCell>
                          <TableCell>
                            {row.STATUS === "Registered" ? (
                              <Chip label="REGISTERED" size="small" color="success" />
                            ) : (
                              <Chip label="NOT REGISTERED" size="small" />
                            )}
                          </TableCell>
                          <TableCell>{row["ENCODER NAME"] ?? ""}</TableCell>
                          <TableCell>{row["REGISTERED AT"] ?? ""}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            {/* Pagination */}
            <Stack direction="row" spacing={2} justifyContent="center" alignItems="center" mt={2}>
              <Button variant="contained" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <Typography>
                Page {page} of {totalPages}
              </Typography>
              <Button variant="contained" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next
              </Button>
            </Stack>
          </>
        )}

        {/* Dialog (preserve) */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
          <DialogTitle>{dialogRow ? `Row #${dialogRow.rowId}` : "Row"}</DialogTitle>
          <DialogContent dividers sx={{ minWidth: { xs: 260, sm: 420 } }}>
            {dialogRow &&
              excelHeaders.map((col) => (
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
                  <Typography variant="body2">{isRowRegistered(dialogRow) ? "Registered" : "Not Registered"}</Typography>
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