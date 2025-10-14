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
  IconButton,
  Stack,
  LinearProgress,
  Button,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ReplayIcon from "@mui/icons-material/Replay";
import { db, auth } from "../../firebase";
import { collection, getDocs, query, where, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
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

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleCollapseToggle = () => setCollapsed(!collapsed);

  const userId = auth.currentUser?.uid;

  // Fetch active payouts
  useEffect(() => {
    const fetchActivePayouts = async () => {
      try {
        const q = query(
          collection(db, "payoutschedules"),
          where("status", "==", "PAY-OUT ONGOING")
        );
        const snapshot = await getDocs(q);
        const payoutsList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setActivePayouts(payoutsList);
      } catch (err) {
        console.error("Failed to fetch payouts:", err);
      }
    };
    fetchActivePayouts();
  }, []);

  // Fetch encoder registrations
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
          if (data.rowId !== undefined) {
            regObj[data.payoutId + "_" + data.rowId] = { id: docSnap.id, ...data };
          }
        });
        setRegistrations(regObj);
      } catch (err) {
        console.error("Failed to fetch registrations:", err);
      }
    };
    fetchRegistrations();
  }, [userId]);

  // Fetch Excel data from fileUrl for selected payout
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

  // Register a row
  const handleRegister = async (payoutId, rowId) => {
    try {
      const docRef = await addDoc(collection(db, "encoderRegistrations"), {
        payoutId,
        rowId,
        userId,
        registered: true,
        timestamp: serverTimestamp(),
      });
      setRegistrations((prev) => ({
        ...prev,
        [payoutId + "_" + rowId]: { id: docRef.id, payoutId, rowId, userId, registered: true },
      }));
    } catch (err) {
      console.error("Failed to register row:", err);
    }
  };

  // Reset a row registration
  const handleReset = async (payoutId, rowId) => {
    try {
      const regKey = payoutId + "_" + rowId;
      const regDoc = registrations[regKey];
      if (!regDoc) return;
      const regRef = doc(db, "encoderRegistrations", regDoc.id);
      await updateDoc(regRef, { registered: false });
      setRegistrations((prev) => ({
        ...prev,
        [regKey]: { ...prev[regKey], registered: false },
      }));
    } catch (err) {
      console.error("Failed to reset row registration:", err);
    }
  };

  // Filtered data
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
  const totalPages = Math.ceil(filteredData.length / ROWS_PER_PAGE);

  const tableColumns =
    excelData.length > 0
      ? Object.keys(excelData[0]).filter((key) => key !== "rowId")
      : [];

  return (
    <Box sx={{ display: "flex" }}>
      <Sidebar
        mobileOpen={mobileOpen}
        handleDrawerToggle={handleDrawerToggle}
        collapsed={collapsed}
        handleCollapseToggle={handleCollapseToggle}
        role="encoder"
      />
      <Box component="main" sx={{ flexGrow: 1, minHeight: "100vh", bgcolor: "#f5f5f5" }}>
        <Topbar handleDrawerToggle={handleDrawerToggle} collapsed={collapsed} role="encoder" />
        <Toolbar />
        <Box sx={{ p: 3 }}>
          <Typography variant="h4" mb={3}>
            Active Payouts
          </Typography>

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
            >
              <MenuItem value="">-- Select Payout --</MenuItem>
              {activePayouts.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.title}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {showTable && (
            <Box mb={3}>
              <TextField
                label="Search"
                placeholder="Search table..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                fullWidth
              />
            </Box>
          )}

          {showTable && (
            <>
              {loading ? (
                <LinearProgress />
              ) : filteredData.length === 0 ? (
                <Typography>No records found.</Typography>
              ) : (
                <>
                  <Paper sx={{ borderRadius: 2 }}>
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow>
                            {tableColumns.map((col) => (
                              <TableCell key={col}>{col}</TableCell>
                            ))}
                            <TableCell>Action</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {paginatedData.map((row) => {
                            const regKey = selectedPayout + "_" + row.rowId;
                            const isRegistered = registrations[regKey]?.registered;
                            return (
                              <TableRow key={row.rowId} sx={{ backgroundColor: isRegistered ? "yellow" : "inherit" }}>
                                {tableColumns.map((col) => (
                                  <TableCell key={col}>{row[col]}</TableCell>
                                ))}
                                <TableCell>
                                  {!isRegistered ? (
                                    <IconButton color="primary" onClick={() => handleRegister(selectedPayout, row.rowId)}>
                                      <CheckCircleIcon />
                                    </IconButton>
                                  ) : (
                                    <Stack direction="row" spacing={1} alignItems="center">
                                      <Typography>Registered</Typography>
                                      <IconButton color="secondary" onClick={() => handleReset(selectedPayout, row.rowId)}>
                                        <ReplayIcon />
                                      </IconButton>
                                    </Stack>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>

                  <Stack direction="row" spacing={2} justifyContent="center" mt={2}>
                    <Button variant="contained" disabled={page === 0} onClick={() => setPage((prev) => prev - 1)}>
                      Previous
                    </Button>
                    <Typography sx={{ display: "flex", alignItems: "center" }}>
                      Page {page + 1} of {totalPages}
                    </Typography>
                    <Button variant="contained" disabled={page + 1 >= totalPages} onClick={() => setPage((prev) => prev + 1)}>
                      Next
                    </Button>
                  </Stack>
                </>
              )}
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}