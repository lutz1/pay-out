import React, { useState, useEffect } from "react";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import {
  Box,
  Toolbar,
  Typography,
  Paper,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  LinearProgress,
  Grid,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { db, auth } from "../../firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import * as XLSX from "xlsx";

export default function EncoderMasterList() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    return saved ? JSON.parse(saved) : false;
  });
  const [activePayouts, setActivePayouts] = useState([]);
  const [selectedPayout, setSelectedPayout] = useState("");
  const [excelData, setExcelData] = useState([]);
  const [registrations, setRegistrations] = useState({});
  const [loading, setLoading] = useState(false);

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleCollapseToggle = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    localStorage.setItem("sidebarCollapsed", JSON.stringify(newCollapsed));
  };

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
        const payouts = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setActivePayouts(payouts);
      } catch (err) {
        console.error("Failed to fetch payouts:", err);
      }
    };
    fetchActivePayouts();
  }, []);

  // 🔹 Fetch encoder registrations
  useEffect(() => {
    if (!userId) return;
    const fetchRegistrations = async () => {
      try {
        const q = query(
          collection(db, "encoderRegistrations"),
          where("userId", "==", userId)
        );
        const snapshot = await getDocs(q);
        const regMap = {};
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.payoutId && data.rowId !== undefined) {
            regMap[data.payoutId + "_" + data.rowId] = data.registered;
          }
        });
        setRegistrations(regMap);
      } catch (err) {
        console.error("Failed to fetch registrations:", err);
      }
    };
    fetchRegistrations();
  }, [userId]);

  // 🔹 Fetch Excel data only when payout is selected
  useEffect(() => {
    if (!selectedPayout) {
      setExcelData([]);
      return;
    }

    const fetchExcelData = async () => {
      setLoading(true);
      try {
        const payout = activePayouts.find((p) => p.id === selectedPayout);
        if (!payout?.fileUrl) {
          setExcelData([]);
          return;
        }

        const res = await fetch(payout.fileUrl);
        const arrayBuffer = await res.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet);

        const withId = jsonData.map((row, i) => ({ rowId: i, ...row }));
        setExcelData(withId);
      } catch (err) {
        console.error("Failed to fetch Excel:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchExcelData();
  }, [selectedPayout, activePayouts]);

  // 🔹 Derived lists
  const registeredList = excelData.filter(
    (row) => registrations[selectedPayout + "_" + row.rowId]
  );
  const notRegisteredList = excelData.filter(
    (row) => !registrations[selectedPayout + "_" + row.rowId]
  );

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

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: "#f5f5f5",
          minHeight: "100vh",
          overflowX: "hidden",
        }}
      >
        <Topbar
          handleDrawerToggle={handleDrawerToggle}
          collapsed={collapsed}
          role="encoder"
        />
        <Toolbar />

        <Box sx={{ p: 2 }}>
          <Typography variant="h5" gutterBottom fontWeight={600}>
            Encoder Master List
          </Typography>

          {/* 🔹 Select Payout Dropdown */}
          <FormControl size="small" sx={{ minWidth: 250, mb: 2 }}>
            <InputLabel>Select Payout</InputLabel>
            <Select
              value={selectedPayout}
              label="Select Payout"
              onChange={(e) => setSelectedPayout(e.target.value)}
            >
              {activePayouts.length === 0 && (
                <MenuItem disabled>No Active Payouts</MenuItem>
              )}
              {activePayouts.map((payout) => (
                <MenuItem key={payout.id} value={payout.id}>
                  {payout.title || payout.id} — {payout.category}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* 🔸 Summary Cards */}
          {selectedPayout && (
            <Grid container spacing={1.5} mb={1.5}>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ borderLeft: "5px solid green" }}>
                  <CardContent sx={{ py: 1 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Total Registered
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{ color: "green", fontWeight: 700 }}
                    >
                      {registeredList.length}
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
                    <Typography
                      variant="h6"
                      sx={{ color: "red", fontWeight: 700 }}
                    >
                      {notRegisteredList.length}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* 🔹 Show loading or data */}
          {loading ? (
            <LinearProgress />
          ) : selectedPayout ? (
            <Grid container spacing={1.5}>
              {/* ✅ Registered List */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 1, borderRadius: 2, overflow: "hidden" }}>
                  <Typography
                    variant="subtitle1"
                    mb={1}
                    sx={{ color: "green", fontWeight: 600 }}
                  >
                    ✅ Registered ({registeredList.length})
                  </Typography>

                  {registeredList.length === 0 ? (
                    <Typography variant="body2">
                      No registered records.
                    </Typography>
                  ) : (
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
                                  py: 0.8,
                                }}
                              >
                                {col}
                              </TableCell>
                            ))}
                            <TableCell
                              sx={{ fontWeight: "bold", width: 140 }}
                            >
                              Status
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {registeredList.map((row) => (
                            <TableRow key={row.rowId} hover>
                              {tableColumns.map((col) => (
                                <TableCell
                                  key={col}
                                  sx={{ whiteSpace: "nowrap" }}
                                >
                                  {row[col]}
                                </TableCell>
                              ))}
                              <TableCell>
                                <Chip
                                  label="REGISTERED"
                                  size="small"
                                  color="success"
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Paper>
              </Grid>

              {/* ❌ Not Registered List */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 1, borderRadius: 2, overflow: "hidden" }}>
                  <Typography
                    variant="subtitle1"
                    mb={1}
                    sx={{ color: "red", fontWeight: 600 }}
                  >
                    ❌ Not Registered ({notRegisteredList.length})
                  </Typography>

                  {notRegisteredList.length === 0 ? (
                    <Typography variant="body2">
                      All records registered!
                    </Typography>
                  ) : (
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
                                  py: 0.8,
                                }}
                              >
                                {col}
                              </TableCell>
                            ))}
                            <TableCell
                              sx={{ fontWeight: "bold", width: 140 }}
                            >
                              Status
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {notRegisteredList.map((row) => (
                            <TableRow key={row.rowId} hover>
                              {tableColumns.map((col) => (
                                <TableCell
                                  key={col}
                                  sx={{ whiteSpace: "nowrap" }}
                                >
                                  {row[col]}
                                </TableCell>
                              ))}
                              <TableCell>
                                <Chip
                                  label="NOT REGISTERED"
                                  size="small"
                                  variant="outlined"
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Paper>
              </Grid>
            </Grid>
          ) : (
            <Typography mt={2} color="text.secondary">
              Please select a payout to view records.
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}