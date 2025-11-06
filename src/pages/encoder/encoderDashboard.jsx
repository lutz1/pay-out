import React, { useState, useEffect } from "react";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import {
  Box,
  Toolbar,
  Typography,
  TextField,
  MenuItem,
  Paper,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Stack,
  LinearProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
} from "@mui/material";
import { db, auth } from "../../firebase";
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import * as XLSX from "xlsx";

export default function EncoderDashboard() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [activePayouts, setActivePayouts] = useState([]);
  const [selectedPayout, setSelectedPayout] = useState("");
  const [search, setSearch] = useState("");
  const [registrations, setRegistrations] = useState({});
  const [excelData, setExcelData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [page, setPage] = useState(0);
  const ROWS_PER_PAGE = 10;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogRow, setDialogRow] = useState(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleCollapseToggle = () => setCollapsed(!collapsed);
  const userId = auth.currentUser?.uid;

  // 🔹 Fetch active payouts
  useEffect(() => {
    const fetchActivePayouts = async () => {
      try {
        const q = query(
          collection(db, "payoutschedules"),
          where("status", "==", "PAY-OUT ONGOING")
        );
        const snapshot = await getDocs(q);
        const payoutsList = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setActivePayouts(payoutsList);
      } catch (err) {
        console.error("Failed to fetch payouts:", err);
      }
    };
    fetchActivePayouts();
  }, []);

  // 🔹 Fetch encoder registrations for this user
  useEffect(() => {
    if (!userId) return;
    const fetchRegistrations = async () => {
      try {
        const q = query(
          collection(db, "encoderRegistrations"),
          where("userId", "==", userId)
        );
        const snapshot = await getDocs(q);
        const regObj = {};
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.rowId !== undefined && data.payoutId !== undefined) {
            regObj[data.payoutId + "_" + data.rowId] = {
              id: docSnap.id,
              ...data,
            };
          }
        });
        setRegistrations(regObj);
      } catch (err) {
        console.error("Failed to fetch registrations:", err);
      }
    };
    fetchRegistrations();
  }, [userId]);

  // 🔹 Fetch Excel data
  useEffect(() => {
    if (!selectedPayout) {
      setExcelData([]);
      return;
    }

    const fetchExcelData = async () => {
      setLoading(true);
      setPage(0);
      try {
        const payout = activePayouts.find((p) => p.id === selectedPayout);
        if (!payout?.fileUrl) {
          setExcelData([]);
          setLoading(false);
          return;
        }

        const res = await fetch(payout.fileUrl);
        if (!res.ok) throw new Error(`File fetch failed: ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        const rowsWithId = jsonData.map((row, index) => ({
          rowId: index,
          ...row,
        }));
        setExcelData(rowsWithId);
      } catch (err) {
        console.error("Failed to read Excel:", err);
        setExcelData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchExcelData();
  }, [selectedPayout, activePayouts]);

  // 🔹 Register a record
  const handleRegister = async (payoutId, rowId) => {
    try {
      const key = payoutId + "_" + rowId;
      const existing = registrations[key];
      if (existing && existing.id) {
        const regRef = doc(db, "encoderRegistrations", existing.id);
        await updateDoc(regRef, {
          registered: true,
          timestamp: serverTimestamp(),
        });
        setRegistrations((prev) => ({
          ...prev,
          [key]: { ...prev[key], registered: true },
        }));
      } else {
        const docRef = await addDoc(collection(db, "encoderRegistrations"), {
          payoutId,
          rowId,
          userId,
          registered: true,
          timestamp: serverTimestamp(),
        });
        setRegistrations((prev) => ({
          ...prev,
          [key]: {
            id: docRef.id,
            payoutId,
            rowId,
            userId,
            registered: true,
          },
        }));
      }
    } catch (err) {
      console.error("Failed to register row:", err);
    } finally {
      setDialogOpen(false);
      setDialogRow(null);
    }
  };

  // 🔹 Reset record
  const handleReset = async (payoutId, rowId) => {
    try {
      const key = payoutId + "_" + rowId;
      const existing = registrations[key];
      if (existing && existing.id) {
        const regRef = doc(db, "encoderRegistrations", existing.id);
        await updateDoc(regRef, {
          registered: false,
          timestamp: serverTimestamp(),
        });
        setRegistrations((prev) => ({
          ...prev,
          [key]: { ...prev[key], registered: false },
        }));
      } else {
        console.warn("No registration doc to reset for", key);
      }
    } catch (err) {
      console.error("Failed to reset row registration:", err);
    } finally {
      setResetConfirmOpen(false);
      setDialogOpen(false);
      setDialogRow(null);
    }
  };

  // 🔹 Filter + Paginate
  const filteredData = excelData.filter((row) =>
    Object.values(row)
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const paginatedData = filteredData.slice(
    page * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE + ROWS_PER_PAGE
  );
  const totalPages = Math.max(
    1,
    Math.ceil(filteredData.length / ROWS_PER_PAGE)
  );

  const tableColumns =
    excelData.length > 0
      ? Object.keys(excelData[0]).filter((k) => k !== "rowId")
      : [];

  const onRowClick = (row) => {
    setDialogRow(row);
    setDialogOpen(true);
  };

  return (
    <Box sx={{ display: "flex" }}>
      <Sidebar
        mobileOpen={mobileOpen}
        handleDrawerToggle={handleDrawerToggle}
        collapsed={collapsed}
        handleCollapseToggle={handleCollapseToggle}
        role="encoder"
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minHeight: "100vh",
          bgcolor: "#f5f5f5",
          overflowX: "hidden",
        }}
      >
        <Topbar
          handleDrawerToggle={handleDrawerToggle}
          collapsed={collapsed}
          role="encoder"
        />
        <Toolbar />
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
          <Typography variant="h5" mb={2}>
            Active Payouts
          </Typography>

          {/* Select payout */}
          <Box mb={2}>
            <TextField
              select
              label="Select Active Payout"
              value={selectedPayout}
              onChange={(e) => {
                setSelectedPayout(e.target.value);
                setShowTable(!!e.target.value);
              }}
              fullWidth
              size="small"
            >
              <MenuItem value="">-- Select Payout --</MenuItem>
              {activePayouts.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.title}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {/* Search */}
          {showTable && (
            <Box
              sx={{
                position: "sticky",
                top: 70,
                zIndex: 10,
                backgroundColor: "#f5f5f5",
                py: 1,
              }}
            >
              <TextField
                label="Search"
                placeholder="Search table..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                fullWidth
                size="small"
              />
            </Box>
          )}

          {/* Table */}
          {showTable && (
            <>
              {loading ? (
                <LinearProgress sx={{ mt: 2 }} />
              ) : filteredData.length === 0 ? (
                <Typography mt={2}>No records found.</Typography>
              ) : (
                <>
                  <Paper
                    sx={{
                      mt: 2,
                      borderRadius: 2,
                      overflow: "hidden",
                      width: "100%",
                    }}
                  >
                    <TableContainer
                      sx={{
                        maxHeight: "60vh",
                        overflowX: "auto",
                        overflowY: "auto",
                      }}
                    >
                      <Table stickyHeader size="small">
                        <TableHead>
                          <TableRow>
                            {tableColumns.map((col) => (
                              <TableCell
                                key={col}
                                sx={{
                                  fontWeight: "bold",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {col}
                              </TableCell>
                            ))}
                            <TableCell sx={{ fontWeight: "bold", width: 140 }}>
                              Status
                            </TableCell>
                          </TableRow>
                        </TableHead>

                        <TableBody>
  {paginatedData.map((row) => {
    const regKey = selectedPayout + "_" + row.rowId;
    const isRegistered = registrations[regKey]?.registered;

    // ✅ Determine background color based on content
    const rowText = Object.values(row).join(" ").toLowerCase();

    let bgColor = "inherit";
    let isDisabled = false;

    if (rowText.includes("totally damaged")) {
      bgColor = "#90caf9"; // Blue
    } else if (rowText.includes("disqualified")) {
      bgColor = "#fff59d"; // Yellow
      isDisabled = true; // disable clicking
    } else if (isRegistered) {
      bgColor = "#4af108"; // Green
    }

    return (
      <TableRow
        key={row.rowId}
        onClick={() => {
          if (!isDisabled) onRowClick(row);
        }}
        sx={{
          backgroundColor: bgColor,
          cursor: isDisabled ? "not-allowed" : "pointer",
          opacity: isDisabled ? 0.7 : 1,
          "&:hover": {
            backgroundColor: bgColor, // no hover color change
          },
        }}
      >
        {tableColumns.map((col) => (
          <TableCell key={col} sx={{ whiteSpace: "nowrap" }}>
            {row[col]}
          </TableCell>
        ))}
        <TableCell>
          {isRegistered ? (
            <Chip label="REGISTERED" size="small" color="success" />
          ) : (
            <Chip label="NOT REGISTERED" size="small" />
          )}
        </TableCell>
      </TableRow>
    );
  })}
</TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>

                  {/* Pagination */}
                  <Stack
                    direction="row"
                    spacing={2}
                    justifyContent="center"
                    alignItems="center"
                    mt={2}
                    flexWrap="wrap"
                  >
                    <Button
                      variant="contained"
                      disabled={page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      Previous
                    </Button>
                    <Typography>
                      Page {page + 1} of {totalPages}
                    </Typography>
                    <Button
                      variant="contained"
                      disabled={page + 1 >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </Stack>
                </>
              )}
            </>
          )}
        </Box>

        {/* Dialog */}
        <Dialog
          open={dialogOpen}
          onClose={() => {
            setDialogOpen(false);
            setDialogRow(null);
          }}
        >
          <DialogTitle>
            {dialogRow ? `Row #${dialogRow.rowId}` : "Row"}
          </DialogTitle>
          <DialogContent dividers sx={{ minWidth: { xs: 260, sm: 420 } }}>
            {dialogRow &&
              tableColumns.map((col) => (
                <Box key={col} sx={{ display: "flex", gap: 1, mb: 1 }}>
                  <Typography
                    variant="caption"
                    sx={{ minWidth: 120, color: "text.secondary" }}
                  >
                    {col}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ wordBreak: "break-word" }}
                  >
                    {String(dialogRow[col] ?? "")}
                  </Typography>
                </Box>
              ))}
          </DialogContent>

          <DialogActions>
            {(() => {
              const key = selectedPayout + "_" + dialogRow?.rowId;
              const isRegistered = registrations[key]?.registered;
              return (
                <>
                  {isRegistered ? (
                    <Button
                      onClick={() => setResetConfirmOpen(true)}
                      color="error"
                      variant="contained"
                    >
                      Reset
                    </Button>
                  ) : (
                    <>
                      <Button
                        onClick={() =>
                          handleRegister(selectedPayout, dialogRow.rowId)
                        }
                        variant="contained"
                        color="primary"
                      >
                        REGISTER
                      </Button>
                      <Button
                        onClick={() => {
                          setDialogOpen(false);
                          setDialogRow(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </>
              );
            })()}
          </DialogActions>
        </Dialog>

        {/* Confirm Reset Dialog */}
        <Dialog
          open={resetConfirmOpen}
          onClose={() => setResetConfirmOpen(false)}
        >
          <DialogTitle>Confirm Reset</DialogTitle>
          <DialogContent>
            <Typography>Are you sure you want to reset this record?</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setResetConfirmOpen(false)}>Cancel</Button>
            <Button
              onClick={() => handleReset(selectedPayout, dialogRow.rowId)}
              color="error"
              variant="contained"
            >
              OK
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}